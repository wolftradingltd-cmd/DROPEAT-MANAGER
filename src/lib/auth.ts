// Module d'authentification (compatible Cloudflare Workers - Web Crypto API)
// Hashing : PBKDF2 avec salt (équivalent bcrypt en termes de sécurité)
// Sessions : tokens stockés en DB

const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16
const KEY_LENGTH = 32

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * Hash un mot de passe avec PBKDF2 + salt aléatoire
 * Format : "pbkdf2$iterations$salt$hash"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_LENGTH * 8
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bufferToHex(salt.buffer)}$${bufferToHex(bits)}`
}

/**
 * Vérifie un mot de passe contre un hash
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
    const iterations = parseInt(parts[1])
    const salt = hexToBuffer(parts[2])
    const expectedHash = parts[3]

    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      key,
      KEY_LENGTH * 8
    )
    const computedHash = bufferToHex(bits)
    // Comparaison à temps constant
    if (computedHash.length !== expectedHash.length) return false
    let diff = 0
    for (let i = 0; i < computedHash.length; i++) {
      diff |= computedHash.charCodeAt(i) ^ expectedHash.charCodeAt(i)
    }
    return diff === 0
  } catch {
    return false
  }
}

/**
 * Génère un token de session aléatoire (256 bits hex)
 */
export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bufferToHex(bytes.buffer)
}

/**
 * Crée une session en BDD et retourne le token
 * Session de 30 jours par défaut
 */
export async function createSession(
  db: D1Database,
  userId: number,
  ip?: string,
  userAgent?: string,
  daysValid: number = 30
): Promise<string> {
  const token = generateSessionToken()
  const expires = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString()
  await db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, ip, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).bind(token, userId, expires, ip || null, userAgent || null).run()
  return token
}

/**
 * Récupère l'utilisateur d'une session valide
 */
export async function getUserFromSession(db: D1Database, token: string): Promise<any | null> {
  if (!token) return null
  const result = await db.prepare(`
    SELECT u.* FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND s.expires_at > datetime('now') AND u.actif = 1
  `).bind(token).first() as any
  return result || null
}

/**
 * Détruit une session
 */
export async function destroySession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run()
}

/**
 * Nettoyage des sessions expirées
 */
export async function cleanupExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run()
}
