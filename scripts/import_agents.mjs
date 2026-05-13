#!/usr/bin/env node
// ============================================================
// IMPORT DES AGENTS COMMERCIAUX + SOUS-AGENTS DANS DROPEAT
// ============================================================
// - Lit scripts/agents_source.tsv (export de la base externe)
// - Déduplique (même seller_code OU même email)
// - Calcule le niveau MLM (0 = agent commercial, 1 = sous-agent N1, 2 = N2, …)
// - Hash le password = seller_code (PBKDF2 SHA-256, 100k iter, compatible auth.ts)
// - Génère scripts/import_agents.sql qui :
//     • Insère chaque agent dans users (avec un mapping uuid→nouvel id)
//     • Met à jour parent_id en 2ᵉ passe
//     • Insère un enregistrement codes_acces avec le code en clair
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { webcrypto as crypto } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, 'agents_source.tsv')
const OUT = path.join(__dirname, 'import_agents.sql')
const REPORT = path.join(__dirname, 'import_agents_report.txt')

const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16
const KEY_LENGTH = 32

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key, KEY_LENGTH * 8
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bufferToHex(salt.buffer)}$${bufferToHex(bits)}`
}

// Échappe une chaîne pour SQL standard (D1/SQLite)
function sql(v) {
  if (v === null || v === undefined || v === '' || v === '-') return 'NULL'
  if (typeof v === 'number') return String(v)
  return "'" + String(v).replace(/'/g, "''") + "'"
}

// ============================================================
// 1) PARSE TSV
// ============================================================
const raw = readFileSync(SRC, 'utf8').replace(/^\uFEFF/, '')
const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0)
const header = lines.shift().split('\t').map(h => h.trim())
const COL = Object.fromEntries(header.map((h, i) => [h, i]))

const allRows = lines.map(line => {
  const cols = line.split('\t')
  const get = (k) => (cols[COL[k]] ?? '').trim()
  return {
    uuid: get('id'),
    first_name: get('first_name'),
    last_name: get('last_name'),
    seller_code: get('seller_code'),
    email: get('email').toLowerCase(),
    phone: get('phone'),
    parent_uuid: get('parent_agent_id') === '-' ? '' : get('parent_agent_id'),
    created_date: get('created_date'),
    markets: get('markets') === '-' ? '' : get('markets'),
    hide_upline: get('hide_upline') === 'true' ? 1 : 0
  }
})

// ============================================================
// 2) DÉDUPLICATION
// ============================================================
// On garde la 1ère occurrence (la plus récente) sur la clé (email + seller_code).
// Les doublons stricts (même UUID) sont aussi supprimés.
// Pour les UUIDs dupliqués pointant sur le même agent, on garde l'UUID
// le plus ancien (celui qui sera référencé par les enfants).
const dedupReport = []
const seenEmailCode = new Map() // "email|code" -> kept uuid
const uuidAliases = new Map()   // uuid_supprimé -> uuid_conservé

// Tri : on garde celui dont l'UUID a déjà des enfants en priorité, sinon le 1er
// rencontré (les lignes sont triées par created_date desc dans la source).
// On fait d'abord une carte uuid -> a-t-il des enfants ?
const hasChildren = new Set()
for (const r of allRows) {
  if (r.parent_uuid) hasChildren.add(r.parent_uuid)
}

// Tri : enfants-référencés d'abord, puis ordre original
const sorted = [...allRows].sort((a, b) => {
  const ah = hasChildren.has(a.uuid) ? 0 : 1
  const bh = hasChildren.has(b.uuid) ? 0 : 1
  if (ah !== bh) return ah - bh
  return 0
})

const rows = []
for (const r of sorted) {
  const key = (r.email || '∅') + '|' + (r.seller_code || '∅')
  if (seenEmailCode.has(key)) {
    const keptUuid = seenEmailCode.get(key)
    uuidAliases.set(r.uuid, keptUuid)
    dedupReport.push(`  Doublon ignoré: ${r.first_name} ${r.last_name} (${r.uuid.slice(0,8)}) → fusionné avec ${keptUuid.slice(0,8)}`)
    continue
  }
  seenEmailCode.set(key, r.uuid)
  rows.push(r)
}

// Résolution des emails partagés (même email pour 2 codes vendeurs distincts).
// Stratégie : on suffixe l'email avec "+codeVendeur" pour garantir l'unicité
// dans users.email tout en restant routable (Gmail+alias) et identifiable.
const emailCount = new Map()
for (const r of rows) {
  if (!r.email) continue
  emailCount.set(r.email, (emailCount.get(r.email) || 0) + 1)
}
const emailAdjust = []
for (const r of rows) {
  if (r.email && emailCount.get(r.email) > 1) {
    const local = r.email.split('@')[0]
    const domain = r.email.split('@')[1] || 'dropeat.import'
    const safeCode = r.seller_code.toLowerCase().replace(/[^a-z0-9]/g, '') || 'x'
    const newEmail = `${local}+${safeCode}@${domain}`
    emailAdjust.push(`  Email ajusté: ${r.first_name} ${r.last_name} (${r.seller_code}) → ${newEmail}`)
    r.email_original = r.email
    r.email = newEmail
  }
}

// Remappe les parent_uuid via les alias
for (const r of rows) {
  if (r.parent_uuid && uuidAliases.has(r.parent_uuid)) {
    r.parent_uuid = uuidAliases.get(r.parent_uuid)
  }
}

// ============================================================
// 3) CALCUL DU NIVEAU MLM (0 = racine, 1, 2, …)
// ============================================================
const byUuid = new Map(rows.map(r => [r.uuid, r]))
function computeLevel(uuid, visited = new Set()) {
  if (!uuid) return 0
  if (visited.has(uuid)) return 0 // cycle protection
  visited.add(uuid)
  const r = byUuid.get(uuid)
  if (!r || !r.parent_uuid) return 0
  return 1 + computeLevel(r.parent_uuid, visited)
}
for (const r of rows) {
  r.niveau = computeLevel(r.uuid)
}

// Les niveaux DropEat vont jusqu'à 2 (0/1/2). Au-delà on plafonne à 2
// (les sous-sous-sous-agents sont rares — le système MLM commission est sur 2 niveaux).
// Mais on conserve la vraie chaîne parent_id pour l'arborescence.
for (const r of rows) {
  r.niveau_stocke = Math.min(r.niveau, 2)
}

// ============================================================
// 4) GÉNÉRATION DU SQL
// ============================================================
const out = []
out.push('-- ============================================================')
out.push('-- IMPORT AGENTS COMMERCIAUX (auto-généré)')
out.push(`-- Source : ${rows.length} agents uniques`)
out.push(`-- Mot de passe = seller_code (à transmettre à chaque agent)`)
out.push('-- ============================================================')
out.push('')
out.push('-- Désactiver temporairement la contrainte parent_id : on insère')
out.push('-- d\'abord tous les agents avec parent_id NULL, puis on patche en 2ᵉ passe.')
out.push('')
// ============================================================
// STRATÉGIE : table temporaire de mapping uuid → user_id
// ============================================================
// SQLite refuse les patterns LIKE longs (limite 50 chars). On utilise donc
// une table TEMP qui stocke uuid_source → id INSERTé. Les passes 2 et 3
// font de simples JOIN sur cette table de mapping.
// ============================================================

out.push('BEGIN TRANSACTION;')
out.push('')
out.push('-- Table permanente de mapping UUID_source → user_id local')
out.push('-- (D1 n\'autorise pas les TEMP tables — on en crée une normale, droppée en fin de transaction)')
out.push('DROP TABLE IF EXISTS _import_map;')
out.push('CREATE TABLE _import_map (')
out.push('  uuid_source TEXT PRIMARY KEY,')
out.push('  user_id     INTEGER NOT NULL,')
out.push('  seller_code TEXT NOT NULL,')
out.push('  parent_uuid TEXT')
out.push(');')
out.push('')

// PASSE 1 : INSERT users (parent_id = NULL pour l'instant) + remplissage du map
out.push('-- ===== PASSE 1 : insertion des users (parent_id NULL temporairement) =====')
for (const r of rows) {
  const niveau = r.niveau_stocke
  const email = r.email || `${r.seller_code.toLowerCase().replace(/[^a-z0-9]/g, '')}@dropeat.import`
  const note = `Import ${new Date().toISOString().slice(0,10)} | uuid:${r.uuid}` +
               (r.markets ? ` | markets:${r.markets}` : '') +
               (r.hide_upline ? ' | hide_upline' : '') +
               (r.email_original ? ` | email_orig:${r.email_original}` : '')
  out.push(
    `INSERT INTO users (email, password_hash, role, nom, prenom, telephone, niveau, parent_id, actif, notes, created_at) ` +
    `VALUES (${sql(email)}, '__HASH_${r.uuid}__', 'agent', ${sql(r.last_name)}, ${sql(r.first_name)}, ` +
    `${sql(r.phone)}, ${niveau}, NULL, 1, ${sql(note)}, ${sql(r.created_date.replace('T',' ').replace('Z',''))});`
  )
  out.push(
    `INSERT INTO _import_map (uuid_source, user_id, seller_code, parent_uuid) ` +
    `VALUES (${sql(r.uuid)}, last_insert_rowid(), ${sql(r.seller_code)}, ${sql(r.parent_uuid)});`
  )
}
out.push('')

// PASSE 2 : UPDATE parent_id en un seul UPDATE … FROM (mapping)
out.push('-- ===== PASSE 2 : rétablit la hiérarchie parent_id via le mapping =====')
out.push(`UPDATE users
   SET parent_id = (
     SELECT pm.user_id
       FROM _import_map cm
       JOIN _import_map pm ON pm.uuid_source = cm.parent_uuid
      WHERE cm.user_id = users.id
   )
 WHERE users.id IN (
   SELECT user_id FROM _import_map WHERE parent_uuid IS NOT NULL
 );`)
out.push('')

// PASSE 3 : INSERT codes_acces (password en clair = seller_code, pour audit)
out.push('-- ===== PASSE 3 : enregistre le seller_code comme code d\'accès =====')
out.push(`INSERT INTO codes_acces (user_id, cree_par_id, password_temporaire, affiche, utilise, expire_at, created_at)
SELECT user_id, NULL, seller_code, 0, 0, datetime('now', '+365 day'), CURRENT_TIMESTAMP
  FROM _import_map;`)
out.push('')

// PASSE 4 : audit log
out.push('-- ===== PASSE 4 : audit log de l\'import =====')
out.push(`INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
SELECT 1, 'import_agents', 'user', user_id,
       '{"source":"agents_externes","uuid":"' || uuid_source || '","seller_code":"' || seller_code || '"}'
  FROM _import_map;`)
out.push('')

out.push('DROP TABLE _import_map;')
out.push('COMMIT;')
out.push('')

// ============================================================
// 5) HASH DES MOTS DE PASSE (séquentiel, ~100ms chacun)
// ============================================================
console.log(`Hashage de ${rows.length} mots de passe (PBKDF2-100k)…`)
const hashes = new Map()
for (const r of rows) {
  const h = await hashPassword(r.seller_code)
  hashes.set(r.uuid, h)
}

let finalSql = out.join('\n')
for (const r of rows) {
  finalSql = finalSql.replace(`__HASH_${r.uuid}__`, hashes.get(r.uuid).replace(/'/g, "''"))
}

writeFileSync(OUT, finalSql, 'utf8')

// ============================================================
// 6) RAPPORT
// ============================================================
const lvls = { 0: 0, 1: 0, 2: 0, 3: 0 }
for (const r of rows) lvls[Math.min(r.niveau, 3)]++

const report = []
report.push('============================================================')
report.push('   RAPPORT D\'IMPORT AGENTS DROPEAT')
report.push('============================================================')
report.push(`Source         : ${SRC}`)
report.push(`SQL généré     : ${OUT}`)
report.push(`Total lignes   : ${allRows.length}`)
report.push(`Total uniques  : ${rows.length}`)
report.push(`Doublons fusionnés : ${dedupReport.length}`)
report.push('')
report.push('Répartition par niveau MLM :')
report.push(`  Niveau 0 (agents commerciaux indép.) : ${lvls[0]}`)
report.push(`  Niveau 1 (sous-agents N+1)            : ${lvls[1]}`)
report.push(`  Niveau 2 (sous-agents N+2)            : ${lvls[2]}`)
if (lvls[3] > 0) report.push(`  Niveau 3+ (plafonné à 2 dans users)   : ${lvls[3]}`)
report.push('')
if (dedupReport.length) {
  report.push('Doublons fusionnés :')
  report.push(...dedupReport)
  report.push('')
}
if (emailAdjust.length) {
  report.push('Emails ajustés (alias +code pour collisions) :')
  report.push(...emailAdjust)
  report.push('')
}
report.push('Arborescence MLM :')
function buildTree(parentUuid, indent) {
  const children = rows.filter(r => (r.parent_uuid || '') === (parentUuid || ''))
  for (const c of children) {
    report.push(
      indent +
      (parentUuid ? '└─ ' : '◆ ') +
      `[N${c.niveau}] ${c.first_name} ${c.last_name} (${c.seller_code}) — ${c.email || 'sans email'}`
    )
    buildTree(c.uuid, indent + '   ')
  }
}
buildTree('', '')
report.push('')
report.push('Pour appliquer en local :')
report.push('   npx wrangler d1 execute webapp-production --local --file=./scripts/import_agents.sql')
report.push('Pour appliquer en prod (après vérification) :')
report.push('   npx wrangler d1 execute webapp-production --remote --file=./scripts/import_agents.sql')
report.push('')

const reportText = report.join('\n')
writeFileSync(REPORT, reportText, 'utf8')
console.log(reportText)
