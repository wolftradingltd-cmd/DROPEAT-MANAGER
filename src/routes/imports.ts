import { Hono } from 'hono'
import type { Bindings } from '../types'
import { parseCsv, detectColumns, parseNumber, parseDate } from '../lib/csv-parser'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * POST /api/imports/preview
 * Reçoit le contenu CSV, détecte les colonnes et renvoie un aperçu
 * Body: { csv: string }
 */
app.post('/preview', async (c) => {
  const { csv } = await c.req.json()
  if (!csv) return c.json({ error: 'CSV requis' }, 400)

  const { rows, headers, delimiter } = parseCsv(csv)
  const detected = detectColumns(headers)

  return c.json({
    headers,
    delimiter,
    detected,
    nb_lignes: rows.length,
    apercu: rows.slice(0, 5)
  })
})

/**
 * POST /api/imports
 * Importe les commandes pour une marque virtuelle donnée
 * Body: {
 *   marque_id: number,
 *   csv: string,
 *   nom_fichier?: string,
 *   mapping: { order_id, date, total, uber_fee, net, status }
 * }
 */
app.post('/', async (c) => {
  const body = await c.req.json()
  const { marque_id, csv, nom_fichier, mapping } = body

  if (!marque_id || !csv) {
    return c.json({ error: 'marque_id et csv requis' }, 400)
  }

  const { rows, headers } = parseCsv(csv)
  if (rows.length === 0) return c.json({ error: 'CSV vide' }, 400)

  // Mapping : utiliser celui fourni ou détecter automatiquement
  const cols = mapping || detectColumns(headers)

  // Validation : il faut au minimum date + (total OU net)
  if (!cols.date) return c.json({ error: 'Colonne date introuvable' }, 400)
  if (!cols.total && !cols.net) {
    return c.json({ error: 'Au moins une colonne montant (total ou net) requise' }, 400)
  }

  let nb_importees = 0
  let nb_doublons = 0
  let nb_erreurs = 0
  let total_montant = 0
  let date_min: string | null = null
  let date_max: string | null = null

  // Créer l'enregistrement d'import
  const importRes = await c.env.DB.prepare(`
    INSERT INTO imports_csv (marque_id, nom_fichier, nb_lignes, statut)
    VALUES (?, ?, ?, 'en_cours')
  `).bind(marque_id, nom_fichier || null, rows.length).run()

  const import_id = importRes.meta.last_row_id

  // Traiter chaque ligne
  for (const row of rows) {
    try {
      const date = cols.date ? parseDate(row[cols.date]) : null
      if (!date) {
        nb_erreurs++
        continue
      }

      const total = cols.total ? parseNumber(row[cols.total]) : 0
      const uber_fee = cols.uber_fee ? parseNumber(row[cols.uber_fee]) : 0
      let net = cols.net ? parseNumber(row[cols.net]) : 0

      // Si pas de net, calculer : total - uber_fee
      if (!net && total) net = total - uber_fee

      const order_id = cols.order_id ? row[cols.order_id] : null
      const statut = cols.status ? row[cols.status] : 'completee'

      // Vérifier doublon par order_id si dispo
      if (order_id) {
        const existing = await c.env.DB.prepare(
          'SELECT id FROM commandes WHERE marque_id = ? AND uber_order_id = ?'
        ).bind(marque_id, order_id).first()

        if (existing) {
          nb_doublons++
          continue
        }
      }

      await c.env.DB.prepare(`
        INSERT INTO commandes (marque_id, uber_order_id, date_commande, montant_brut, frais_uber, montant_net, statut, raw_data, import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        marque_id,
        order_id || null,
        date,
        total,
        uber_fee,
        net,
        statut || 'completee',
        JSON.stringify(row),
        import_id
      ).run()

      nb_importees++
      total_montant += net

      if (!date_min || date < date_min) date_min = date
      if (!date_max || date > date_max) date_max = date
    } catch (e) {
      nb_erreurs++
    }
  }

  // Mise à jour de l'import
  await c.env.DB.prepare(`
    UPDATE imports_csv
    SET nb_lignes_importees = ?, nb_doublons = ?, montant_total = ?,
        periode_debut = ?, periode_fin = ?, statut = ?
    WHERE id = ?
  `).bind(
    nb_importees, nb_doublons, total_montant,
    date_min ? date_min.substring(0, 10) : null,
    date_max ? date_max.substring(0, 10) : null,
    nb_erreurs > 0 ? 'partiel' : 'complete',
    import_id
  ).run()

  return c.json({
    success: true,
    import_id,
    nb_lignes: rows.length,
    nb_importees,
    nb_doublons,
    nb_erreurs,
    montant_total: total_montant,
    periode: { debut: date_min, fin: date_max }
  })
})

// GET historique des imports
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT i.*, m.nom as marque_nom, r.nom as restaurant_nom
    FROM imports_csv i
    JOIN marques_virtuelles m ON i.marque_id = m.id
    JOIN restaurants r ON m.restaurant_id = r.id
    ORDER BY i.created_at DESC
    LIMIT 100
  `).all()
  return c.json({ imports: results })
})

// DELETE un import (et toutes ses commandes)
app.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM commandes WHERE import_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM imports_csv WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default app
