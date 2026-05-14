#!/usr/bin/env python3
"""
Génère un seed SQL complet à partir de la base D1 locale.
Préserve TOUS les commerciaux + restaurants + marques + paliers + tranches
+ commandes + commissions, pour pouvoir redéployer sans perdre les données.

Usage:
  python3 scripts/export-production-seed.py > seed-production.sql
"""
import sqlite3
import sys
import glob
import os
from datetime import datetime

# Trouver le fichier SQLite local de wrangler
SQLITE_FILES = sorted(
    glob.glob(".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite"),
    key=lambda f: os.path.getsize(f),
    reverse=True
)
SQLITE_FILES = [f for f in SQLITE_FILES if "metadata" not in f]
if not SQLITE_FILES:
    print("ERROR: aucun fichier SQLite local trouvé sous .wrangler/", file=sys.stderr)
    sys.exit(1)

DB_PATH = SQLITE_FILES[0]
print(f"-- Source : {DB_PATH}", file=sys.stderr)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row


def esc(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, bytes):
        v = v.decode("utf-8", errors="replace")
    return "'" + str(v).replace("'", "''") + "'"


def table_exists(name):
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    )
    return cur.fetchone() is not None


def get_columns(table):
    cur = conn.execute(f"PRAGMA table_info({table})")
    return [r[1] for r in cur.fetchall()]


def dump_table(table, columns=None, order_by="id", where=None):
    """Dump une table en INSERT OR IGNORE. Ne dump que les colonnes existantes."""
    if not table_exists(table):
        print(f"-- (table {table} absente, skip)")
        return 0
    existing_cols = get_columns(table)
    if columns is None:
        columns = existing_cols
    else:
        columns = [c for c in columns if c in existing_cols]
    if not columns:
        print(f"-- (aucune colonne valide dans {table}, skip)")
        return 0
    cols_sql = ", ".join(columns)
    sql = f"SELECT {cols_sql} FROM {table}"
    if where:
        sql += f" WHERE {where}"
    if order_by:
        # Vérifier que order_by existe
        ob_cols = [c.strip() for c in order_by.split(",")]
        valid = all(c.split()[0] in existing_cols for c in ob_cols)
        if valid:
            sql += f" ORDER BY {order_by}"
    try:
        rows = conn.execute(sql).fetchall()
    except sqlite3.Error as e:
        print(f"-- ERR dump {table}: {e}")
        return 0
    if not rows:
        print(f"-- (aucune ligne dans {table})")
        return 0
    print()
    print(f"-- ============================================================")
    print(f"-- {table.upper()} ({len(rows)} lignes)")
    print(f"-- ============================================================")
    for r in rows:
        vals = ", ".join(esc(r[c]) for c in columns)
        print(f"INSERT OR IGNORE INTO {table} ({cols_sql}) VALUES ({vals});")
    return len(rows)


print(
    """-- ============================================================
-- SEED PRODUCTION DROPEAT™ — Données complètes exportées
-- Généré le : """
    + datetime.now().isoformat()
    + """
-- Contient : superadmin + commerciaux + restaurants + marques + paliers
--            + tranches + commandes + commissions + checklist + documents
-- ============================================================
-- À appliquer après les migrations sur une base vide :
--   npx wrangler d1 execute webapp-production --remote --file=seed-production.sql
-- ============================================================
"""
)

total = 0

# 1. CONFIG (référentiel)
total += dump_table("config", order_by="cle")

# 2. PALIERS (référentiel critique commissions)
total += dump_table("paliers_commissions", order_by="type, ordre")

# 3. PROFIL SOCIETE (entité juridique factures)
total += dump_table("profils_societe")

# 4. COMPTEURS DE FACTURE
total += dump_table("facture_compteurs", order_by="annee, type_facture")

# 5. USERS (superadmin + 36 commerciaux)
total += dump_table("users")

# 6. RESTAURANTS
total += dump_table("restaurants")

# 7. MARQUES VIRTUELLES
total += dump_table("marques_virtuelles")

# 8. MARQUE PLATEFORMES (Deliveroo, JustEat, etc.)
total += dump_table("marque_plateformes")

# 9. TRANCHES + ELEMENTS (qualification 5e marque)
total += dump_table("tranches_attribution")
total += dump_table("tranche_elements", order_by="tranche_id, position_dans_tranche")
total += dump_table("demandes_attribution_marque")

# 10. COMPTES PLATEFORMES (accès Uber/Deliveroo/etc.)
total += dump_table("comptes_plateformes")

# 11. CHECKLIST RESTAURANT
total += dump_table("checklist_items", order_by="restaurant_id, code")
total += dump_table("restaurant_checklist", order_by="restaurant_id")

# 12. DOCUMENTS
total += dump_table("restaurant_documents")

# 13. CODES D'ACCES MLM
total += dump_table("codes_acces")
total += dump_table("invitations_agent")

# 14. COMMANDES + COMMISSIONS (historique pour audits)
total += dump_table("commandes", order_by="id")
total += dump_table("commissions_calculees")

# 15. FACTURES + LIGNES
total += dump_table("factures")
total += dump_table("facture_lignes", order_by="facture_id")

# 16. PAIEMENTS
total += dump_table("paiements")

# 17. PROSPECTS
total += dump_table("prospects")
total += dump_table("prospect_actions", order_by="prospect_id")

# 18. IMPORTS CSV
total += dump_table("imports_csv")

print(
    f"""
-- ============================================================
-- FIN DU SEED — {total} lignes au total
-- ============================================================"""
)

print(f"-- Total lignes exportées : {total}", file=sys.stderr)
conn.close()
