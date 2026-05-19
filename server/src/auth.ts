import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db, type DbUser, type PublicUser, toPublicUser } from './db.js';

const COOKIE_NAME = 'fit_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function verifyCredentials(email: string, password: string): Promise<DbUser | null> {
  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim()) as DbUser | undefined;
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? user : null;
}

export function createSession(userId: string): string {
  const id = randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, userId, now + SESSION_TTL_MS, now);
  return id;
}

export function destroySession(id: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function getUserBySessionId(id: string): PublicUser | null {
  const row = db
    .prepare(
      `SELECT u.* FROM users u
       JOIN sessions s ON s.user_id = u.id
       WHERE s.id = ? AND s.expires_at > ?`
    )
    .get(id, Date.now()) as DbUser | undefined;
  return row ? toPublicUser(row) : null;
}

export function setSessionCookie(c: Context, sessionId: string) {
  setCookie(c, COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, COOKIE_NAME);
}

// Hono middleware: attaches the authenticated user to c.var.user (or null).
// Use requireAuth / requireAdmin to gate specific routes.
export async function attachUser(c: Context, next: Next) {
  const sessionId = readSessionCookie(c);
  const user = sessionId ? getUserBySessionId(sessionId) : null;
  c.set('user', user);
  await next();
}

export async function requireAuth(c: Context, next: Next) {
  const user = c.get('user') as PublicUser | null;
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  await next();
}

export async function requireAdmin(c: Context, next: Next) {
  const user = c.get('user') as PublicUser | null;
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  await next();
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
