// Parser CSV simple et flexible pour fichiers Uber Eats
// Détecte automatiquement les colonnes courantes en FR et EN

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
 * Parse un CSV complet en tableau d'objets
 */
export function parseCsv(content: string): { rows: CsvRow[]; headers: string[]; delimiter: string } {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) return { rows: [], headers: [], delimiter: ',' }

  const delimiter = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delimiter).map(h => h.trim())

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
 * Mapping des colonnes Uber Eats (FR + EN)
 * On cherche dans les headers les mots-clés correspondants
 */
const COLUMN_MAPPINGS = {
  order_id: ['order id', 'order uuid', 'commande id', 'id commande', 'order number', 'numéro de commande', 'numero de commande', 'uuid'],
  date: ['date', 'order date', 'date de commande', 'date commande', 'workflow date', 'order time', 'date/time', 'datetime'],
  total: ['order total', 'total commande', 'total', 'sales (incl. tax)', 'sales', 'gross sales', 'montant total', 'ventes', 'subtotal'],
  uber_fee: ['uber service fee', 'service fee', 'uber fees', 'frais uber', 'commission uber', 'marketplace fee', 'fees'],
  net: ['payout', 'net payout', 'payment', 'paiement', 'net', 'montant net', 'restaurant payout', 'amount due', 'your earnings', 'earnings'],
  status: ['status', 'statut', 'order status', 'state', 'état']
}

function findColumn(headers: string[], candidates: string[]): string | null {
  const lower = headers.map(h => h.toLowerCase())
  for (const cand of candidates) {
    const idx = lower.findIndex(h => h.includes(cand.toLowerCase()))
    if (idx >= 0) return headers[idx]
  }
  return null
}

export interface DetectedColumns {
  order_id: string | null
  date: string | null
  total: string | null
  uber_fee: string | null
  net: string | null
  status: string | null
}

export function detectColumns(headers: string[]): DetectedColumns {
  return {
    order_id: findColumn(headers, COLUMN_MAPPINGS.order_id),
    date: findColumn(headers, COLUMN_MAPPINGS.date),
    total: findColumn(headers, COLUMN_MAPPINGS.total),
    uber_fee: findColumn(headers, COLUMN_MAPPINGS.uber_fee),
    net: findColumn(headers, COLUMN_MAPPINGS.net),
    status: findColumn(headers, COLUMN_MAPPINGS.status)
  }
}

/**
 * Convertit une chaîne en nombre, gère les formats FR (virgule) et EN (point)
 * Supporte aussi les symboles monétaires
 */
export function parseNumber(value: string): number {
  if (!value) return 0
  // Retirer symboles monétaires et espaces
  let cleaned = String(value).replace(/[€$£\s]/g, '').trim()
  // Si contient à la fois , et . - le dernier est le séparateur décimal
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
 * Parse une date dans différents formats courants
 */
export function parseDate(value: string): string | null {
  if (!value) return null
  const v = value.trim()

  // ISO yyyy-mm-dd ou yyyy-mm-ddTHH:MM:SS
  let d = new Date(v)
  if (!isNaN(d.getTime())) {
    return d.toISOString()
  }

  // Format FR: dd/mm/yyyy ou dd/mm/yyyy HH:MM
  const frMatch = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (frMatch) {
    const [, day, month, year, h, m, s] = frMatch
    const yr = year.length === 2 ? '20' + year : year
    const iso = `${yr}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${(h || '00').padStart(2, '0')}:${m || '00'}:${s || '00'}`
    d = new Date(iso)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  return null
}
