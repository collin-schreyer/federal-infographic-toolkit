import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { requireAdmin, hashPassword } from '../auth.js';
import { db, toPublicUser, type DbUser, type PublicUser } from '../db.js';

const users = new Hono();

users.get('/users', requireAdmin, (c) => {
  const rows = db.prepare(
    `SELECT id, email, name, password_hash, role, must_change_password,
            created_at, created_by FROM users ORDER BY created_at DESC`
  ).all() as DbUser[];
  return c.json({ users: rows.map(toPublicUser) });
});

users.post('/users', requireAdmin, async (c) => {
  const admin = c.get('user') as PublicUser;
  let body: { email?: string; name?: string; role?: 'admin' | 'user'; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const email = body.email?.toLowerCase().trim();
  const name = body.name?.trim() || null;
  const role = body.role === 'admin' ? 'admin' : 'user';

  if (!email || !email.includes('@')) {
    return c.json({ error: 'Valid email required' }, 400);
  }
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return c.json({ error: 'A user with that email already exists.' }, 409);

  // Admin can supply a starter password or we generate one and return it
  // ONCE in the response so they can hand it to the user.
  const tempPassword = body.password?.trim() || `tmp-${randomBytes(6).toString('hex')}`;
  if (tempPassword.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters.' }, 400);
  }
  const passwordHash = await hashPassword(tempPassword);
  const id = randomBytes(16).toString('hex');

  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, role, must_change_password, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, email, name, passwordHash, role, Date.now(), admin.id);

  const created = db.prepare(
    'SELECT id, email, name, password_hash, role, must_change_password, created_at, created_by FROM users WHERE id = ?'
  ).get(id) as DbUser;

  return c.json({
    user: toPublicUser(created),
    temp_password: tempPassword, // returned ONCE so the admin can share it
  }, 201);
});

users.patch('/users/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  let body: { name?: string; role?: 'admin' | 'user'; new_password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return c.json({ error: 'Not found' }, 404);

  if (body.name !== undefined) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(body.name?.trim() || null, id);
  }
  if (body.role && (body.role === 'admin' || body.role === 'user')) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id);
  }
  let resetPassword: string | undefined;
  if (body.new_password) {
    if (body.new_password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters.' }, 400);
    }
    const passwordHash = await hashPassword(body.new_password);
    db.prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?'
    ).run(passwordHash, id);
    // Bump all existing sessions so the user is forced to log in again.
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    resetPassword = body.new_password;
  }

  const updated = db.prepare(
    'SELECT id, email, name, password_hash, role, must_change_password, created_at, created_by FROM users WHERE id = ?'
  ).get(id) as DbUser;
  return c.json({ user: toPublicUser(updated), reset_password: resetPassword });
});

users.delete('/users/:id', requireAdmin, (c) => {
  const admin = c.get('user') as PublicUser;
  const id = c.req.param('id');
  if (id === admin.id) return c.json({ error: 'You cannot delete yourself.' }, 400);
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return c.json({ error: 'Not found' }, 404);
  // CASCADE on sessions + renders handles cleanup. Note: this deletes the
  // user's image files from the renders table but NOT the bytes on disk.
  // Disk cleanup is a future janitor job.
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return c.json({ ok: true });
});

export default users;
