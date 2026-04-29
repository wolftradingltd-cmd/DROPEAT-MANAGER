// Middleware d'authentification pour les routes protégées
import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { getUserFromSession } from '../lib/auth'
import type { Bindings } from '../types'

export type AuthVariables = {
  user: {
    id: number
    email: string
    role: 'superadmin' | 'agent'
    nom: string
    prenom: string
    niveau: number | null
    parent_id: number | null
  }
}

/**
 * Vérifie qu'un utilisateur est connecté.
 * Renvoie 401 sinon.
 */
export async function requireAuth(
  c: Context<{ Bindings: Bindings; Variables: AuthVariables }>,
  next: Next
) {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ error: 'Non authentifié' }, 401)

  const user = await getUserFromSession(c.env.DB, token)
  if (!user) return c.json({ error: 'Session invalide ou expirée' }, 401)

  c.set('user', user)
  await next()
}

/**
 * Vérifie qu'un utilisateur est superadmin.
 * Renvoie 403 sinon.
 */
export async function requireSuperadmin(
  c: Context<{ Bindings: Bindings; Variables: AuthVariables }>,
  next: Next
) {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ error: 'Non authentifié' }, 401)

  const user = await getUserFromSession(c.env.DB, token)
  if (!user) return c.json({ error: 'Session invalide' }, 401)
  if (user.role !== 'superadmin') return c.json({ error: 'Accès refusé : superadmin requis' }, 403)

  c.set('user', user)
  await next()
}

/**
 * Vérifie qu'un utilisateur est connecté (admin ou agent).
 * Pour endpoints partagés.
 */
export async function requireAnyAuth(
  c: Context<{ Bindings: Bindings; Variables: AuthVariables }>,
  next: Next
) {
  return requireAuth(c, next)
}
