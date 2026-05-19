import { Hono } from 'hono';
import {
  verifyCredentials,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  readSessionCookie,
  requireAuth,
  hashPassword,
} from '../auth.js';
import { db, type DbUser, toPublicUser } from '../db.js';

const auth = new Hono();

auth.post('/login', async (c) => {
  let body: { email?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const email = body?.email?.trim();
  const password = body?.password;
  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400);
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    return c.json({ error: 'Invalid email or password.' }, 401);
  }

  const sessionId = createSession(user.id);
  setSessionCookie(c, sessionId);
  return c.json({ user: toPublicUser(user) });
});

auth.post('/logout', (c) => {
  const sessionId = readSessionCookie(c);
  if (sessionId) destroySession(sessionId);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

auth.get('/me', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// Self-service password change for the currently-authenticated user.
// Used both for the initial admin's must_change_password and for any
// user who wants to rotate their own password.
auth.post('/change-password', requireAuth, async (c) => {
  const user = c.get('user') as ReturnType<typeof toPublicUser>;
  let body: { current_password?: string; new_password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const { current_password, new_password } = body;
  if (!current_password || !new_password) {
    return c.json({ error: 'current_password and new_password are required' }, 400);
  }
  if (new_password.length < 8) {
    return c.json({ error: 'New password must be at least 8 characters.' }, 400);
  }

  const ok = await verifyCredentials(user.email, current_password);
  if (!ok) return c.json({ error: 'Current password is incorrect.' }, 401);

  const newHash = await hashPassword(new_password);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(newHash, user.id);
  return c.json({ ok: true });
});

export default auth;
