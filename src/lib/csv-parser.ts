// Parser CSV simple et flexible pour fichiers Uber Eats (FR officiel + EN + autres)
// Supporte le format réel Uber Eats français : "Restaurant", "UUID de la commande",
// "Montant moyen des commandes", "Date de la commande", "Heure de la commande", etc.

export interface CsvRow {
  [key: string]: string
}

/**
 * Parse une ligne CSV en gérant les guillemets et virgules dans les valeurs
 */
function parseCsvLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Détecte automatiquement le délimiteur (virgule, point-virgule, tabulation)
 */
function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let maxCount = 0
  for (const d of candidates) {
    const count = firstLine.split(d).length
    if (count > maxCount) {
      maxCount = count
      best = d
    }
  }
  return best
}

/**
 * Parse un CSV complet en tableau d'objets.
 * Les en-têtes sont nettoyés (BOM UTF-8, espaces).
 */
export function parseCsv(content: string): { rows: CsvRow[]; headers: string[]; delimiter: string } {
  // Retire BOM UTF-8 éventuel
  if (content.charCodeAt(0) === 0xFEFF) content = content.substring(1)

  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return { rows: [], headers: [], delimiter: ',' }

  const delimiter = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delimiter).map(h => h.trim().replace(/^\uFEFF/, ''))

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter)
    const row: CsvRow = {}
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim()
    })
    rows.push(row)
  }

  return { rows, headers, delimiter }
}

/**
 * Mapping des colonnes Uber Eats — version étendue (FR officiel + EN + variantes)
 *
 * Ordre des candidats = ordre de priorité (le 1er trouvé gagne).
 * Pour Uber Eats FR officiel :
 *   - "UUID de la commande"      → uuid (anti-doublon strict)
 *   - "Id. de la commande"       → order_id court (lisible)
 *   - "Montant moyen des commandes" → montant brut (€)
 *   - "Date de la commande" + "Heure de la commande" → datetime
 *   - "Statut de la commande"    → status
 *   - "Restaurant"               → marque/store name
 *   - "Marque Eats"              → marque virtuelle (peut différer du restaurant)
 *   - "Type de commande honorée" → Pickup / Delivery / MULTI_MERCHANT
 */
const COLUMN_MAPPINGS = {
  uuid: [
    'uuid de la commande', 'order uuid', 'uuid', 'order id uuid'
  ],
  order_id: [
    'id. de la commande', 'id de la commande', 'order id',
    'commande id', 'id commande', 'order number',
    'numéro de commande', 'numero de commande'
  ],
  date: [
    'date de la commande', 'order date', 'date commande', 'date',
    'workflow date', 'order time', 'date/time', 'datetime'
  ],
  time: [
    "heure de la commande", 'order time', 'heure commande', 'time'
  ],
  total: [
    'montant moyen des commandes', 'order total', 'total commande',
    'sales (incl. tax)', 'gross sales', 'montant total', 'ventes', 'subtotal',
    'total', 'sales'
  ],
  uber_fee: [
    'uber service fee', 'service fee', 'uber fees', 'frais uber',
    'commission uber', 'marketplace fee', 'fees'
  ],
  net: [
    'net payout', 'restaurant payout', 'payout', 'your earnings',
    'paiement', 'montant net', 'amount due', 'earnings', 'net'
  ],
  status: [
    'statut de la commande', 'order status', 'statut', 'state', 'état', 'status'
  ],
  store_name: [
    'restaurant', 'store name', 'store', 'merchant name', 'nom du restaurant'
  ],
  store_uuid: [
    'id. externe du restaurant', 'store uuid', 'store id', 'restaurant id',
    'id externe du restaurant', 'merchant id', 'store_uuid'
  ],
  marque_eats: [
    'marque eats', 'marque virtuelle', 'virtual brand', 'eats brand'
  ],
  type_honoree: [
    'type de commande honorée', 'order type', 'fulfillment type',
    'type de commande', 'fulfillment'
  ],
  ville: [
    'ville', 'city'
  ]
}

function findColumn(headers: string[], candidates: string[]): string | null {
  // Comparaison normalisée : minuscule + suppression accents légers + trim
  const norm = (s: string) => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire accents
    .replace(/\s+/g, ' ').trim()

  const headersNorm = headers.map(h => norm(h))

  // 1) Match exact prioritaire
  for (const cand of candidates) {
    const cn = norm(cand)
    const idx = headersNorm.findIndex(h => h === cn)
    if (idx >= 0) return headers[idx]
  }
  // 2) Match "contient"
  for (const cand of candidates) {
    const cn = norm(cand)
    const idx = headersNorm.findIndex(h => h.includes(cn))
    if (idx >= 0) return headers[idx]
  }
  return null
}

export interface DetectedColumns {
  uuid: string | null
  order_id: string | null
  date: string | null
  time: string | null
  total: string | null
  uber_fee: string | null
  net: string | null
  status: string | null
  store_name: string | null
  store_uuid: string | null
  marque_eats: string | null
  type_honoree: string | null
  ville: string | null
}

export function detectColumns(headers: string[]): DetectedColumns {
  return {
    uuid: findColumn(headers, COLUMN_MAPPINGS.uuid),
    order_id: findColumn(headers, COLUMN_MAPPINGS.order_id),
    date: findColumn(headers, COLUMN_MAPPINGS.date),
    time: findColumn(headers, COLUMN_MAPPINGS.time),
    total: findColumn(headers, COLUMN_MAPPINGS.total),
    uber_fee: findColumn(headers, COLUMN_MAPPINGS.uber_fee),
    net: findColumn(headers, COLUMN_MAPPINGS.net),
    status: findColumn(headers, COLUMN_MAPPINGS.status),
    store_name: findColumn(headers, COLUMN_MAPPINGS.store_name),
    store_uuid: findColumn(headers, COLUMN_MAPPINGS.store_uuid),
    marque_eats: findColumn(headers, COLUMN_MAPPINGS.marque_eats),
    type_honoree: findColumn(headers, COLUMN_MAPPINGS.type_honoree),
    ville: findColumn(headers, COLUMN_MAPPINGS.ville)
  }
}

/**
 * Convertit une chaîne en nombre, gère les formats FR (virgule) et EN (point)
 * Supporte aussi les symboles monétaires.
 */
export function parseNumber(value: string): number {
  if (!value) return 0
  let cleaned = String(value).replace(/[€$£\s]/g, '').trim()
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.')
    } else {
      cleaned = cleaned.replace(/,/g, '')
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.')
  }
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

/**
 * Parse une date dans différents formats courants.
 * Si "time" séparé est fourni, le combine avec la date.
 */
export function parseDate(value: string, time?: string): string | null {
  if (!value) return null
  const v = value.trim()

  // ISO yyyy-mm-dd[Tabc]
  let d = new Date(v)
  if (!isNaN(d.getTime())) {
    // Si time séparé fourni et v ne contient pas déjà l'heure
    if (time && !v.includes(':') && !v.includes('T')) {
      const tMatch = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
      if (tMatch) {
        d.setUTCHours(parseInt(tMatch[1]), parseInt(tMatch[2]), parseInt(tMatch[3] || '0'))
      }
    }
    return d.toISOString()
  }

  // Format FR: dd/mm/yyyy ou dd/mm/yyyy HH:MM
  const frMatch = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (frMatch) {
    const [, day, month, year, h, m, s] = frMatch
    const yr = year.length === 2 ? '20' + year : year
    let isoH = (h || '00').padStart(2, '0')
    let isoM = m || '00'
    let isoS = s || '00'
    // Si time externe et pas d'heure dans la date
    if (time && !h) {
      const tMatch = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
      if (tMatch) { isoH = tMatch[1].padStart(2, '0'); isoM = tMatch[2]; isoS = tMatch[3] || '00' }
    }
    const iso = `${yr}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${isoH}:${isoM}:${isoS}`
    d = new Date(iso)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  return null
}

/**
 * Statut Uber Eats → statut interne DropEat
 * "completed" / "cancelled" / etc. → "completee" / "annulee"
 */
export function normalizeStatus(raw: string | null | undefined): string {
  if (!raw) return 'completee'
  const v = raw.toLowerCase().trim()
  if (v.includes('cancel') || v.includes('annul')) return 'annulee'
  if (v.includes('refund') || v.includes('rembour')) return 'remboursee'
  // Impayé : "unpaid", "impaye", "chargeback", "dispute"
  if (v.includes('unpaid') || v.includes('impay') || v.includes('chargeback') || v.includes('dispute')) return 'impayee'
  // Résilié : "terminated", "resilie", "ended", "closed"
  if (v.includes('terminat') || v.includes('resili') || v.includes('résili')) return 'resiliee'
  if (v.includes('complet') || v.includes('termin') || v.includes('deliver')) return 'completee'
  return 'completee'
}
