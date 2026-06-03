#!/bin/bash
# Apply migration steps one by one via gsk hosted d1_execute
# Handles approval handshake for DDL, direct execute for DML
#
# Usage: ./scripts/apply-migration-steps.sh <steps_dir> [start_index]
#   <steps_dir>    : directory containing NN.sql files
#   [start_index]  : optional, resume from this step (default 0)

set -e

STEPS_DIR="${1:?Usage: $0 <steps_dir> [start_index]}"
START_IDX="${2:-0}"

if [ ! -d "$STEPS_DIR" ]; then
  echo "ERROR: directory not found: $STEPS_DIR"
  exit 1
fi

# List all NN.sql files sorted
FILES=$(ls "$STEPS_DIR"/*.sql 2>/dev/null | sort)
TOTAL=$(echo "$FILES" | wc -l)
echo "Found $TOTAL statement files in $STEPS_DIR"
echo "Starting from index $START_IDX"
echo "======================================"

IDX=0
for f in $FILES; do
  NAME=$(basename "$f" .sql)
  STEP_NUM=$((10#$NAME))

  if [ $STEP_NUM -lt $START_IDX ]; then
    echo "  ⏭️  skip $NAME (before start)"
    IDX=$((IDX+1))
    continue
  fi

  SIZE=$(wc -c < "$f")
  FIRST=$(head -1 "$f" | cut -c1-80)
  echo ""
  echo "── [$NAME] ($SIZE bytes) ─────────────────────────────"
  echo "    $FIRST..."

  # Submit
  SQL_CONTENT=$(cat "$f")
  RESP=$(gsk hosted d1_execute --sql "$SQL_CONTENT" 2>&1 || true)

  # Find code
  CODE=$(echo "$RESP" | grep -oE '"code":[[:space:]]*"[^"]+"' | head -1 | grep -oE '"[^"]+"$' | tr -d '"')
  PENDING_ID=$(echo "$RESP" | grep -oE '"pending_action_id":[[:space:]]*"[^"]+"' | head -1 | grep -oE '"[a-f0-9-]{36}"' | tr -d '"')

  echo "    code=$CODE"
  if [ -n "$PENDING_ID" ]; then
    echo "    pending_action_id=$PENDING_ID"
    echo "    ⏳ Waiting for approval..."

    # Wait loop (up to 3 times)
    WAIT_ATTEMPTS=0
    while [ $WAIT_ATTEMPTS -lt 3 ]; do
      WAIT_RESP=$(gsk hosted action_wait --id "$PENDING_ID" 2>&1 || true)
      WAIT_CODE=$(echo "$WAIT_RESP" | grep -oE '"code":[[:space:]]*"[^"]+"' | head -1 | grep -oE '"[^"]+"$' | tr -d '"')
      echo "    wait_code=$WAIT_CODE"
      if [ "$WAIT_CODE" = "still_pending" ]; then
        WAIT_ATTEMPTS=$((WAIT_ATTEMPTS+1))
        continue
      fi
      break
    done

    if [ "$WAIT_CODE" != "ok" ]; then
      echo "    ❌ FAILED step $NAME — code=$WAIT_CODE"
      echo "$WAIT_RESP" | grep -E '"(message|error|hint|kind|error_text)"' | head -10
      echo ""
      echo "STOPPED at step $NAME (index $STEP_NUM)"
      echo "Resume after fix: $0 $STEPS_DIR $STEP_NUM"
      exit 1
    fi
    echo "    ✅ approved + executed"
  elif [ "$CODE" = "ok" ] || [ "$CODE" = "completed" ]; then
    echo "    ✅ direct execute OK"
  else
    echo "    ❌ FAILED step $NAME — code=$CODE"
    echo "$RESP" | grep -E '"(message|error|hint|kind|error_text)"' | head -10
    echo ""
    echo "STOPPED at step $NAME (index $STEP_NUM)"
    echo "Resume after fix: $0 $STEPS_DIR $STEP_NUM"
    exit 1
  fi

  IDX=$((IDX+1))
done

echo ""
echo "======================================"
echo "✅ All $IDX statements applied successfully"
