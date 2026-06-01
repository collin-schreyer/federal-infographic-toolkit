import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { requireAdmin, hashPassword } from '../auth.js';
import { db, toPublicUser, type DbUser, type PublicUser } from '../db.js';

const users = new Hono();

// Rough per-render cost estimate. Combines: one image generation call
// (gpt-image-2 ~$0.04 OR nano-banana ~$0.04), plus amortized GPT-5 planning
// when tuned/reimagined variants are involved. Document in the UI as a
// rough number, not an invoice line item.
const COST_PER_RENDER_USD = 0.04;

// Aggregate usage stats per user. Returned as both JSON (default) and CSV
// (when ?format=csv). Admin only — leaks user emails + activity.
users.get('/admin/usage', requireAdmin, (c) => {
  const rows = db.prepare(`
    SELECT
      u.id                                         as id,
      u.email                                      as email,
      u.name                                       as name,
      u.role                                       as role,
      u.created_at                                 as created_at,
      COALESCE(COUNT(r.id), 0)                     as total_renders,
      COALESCE(SUM(CASE WHEN r.engine = 'openai' THEN 1 ELSE 0 END), 0)  as renders_openai,
      COALESCE(SUM(CASE WHEN r.engine = 'gemini' THEN 1 ELSE 0 END), 0)  as renders_gemini,
      COALESCE(SUM(CASE WHEN r.variation = 'baseline'   THEN 1 ELSE 0 END), 0) as renders_baseline,
      COALESCE(SUM(CASE WHEN r.variation = 'tuned'      THEN 1 ELSE 0 END), 0) as renders_tuned,
      COALESCE(SUM(CASE WHEN r.variation = 'reimagined' THEN 1 ELSE 0 END), 0) as renders_reimagined,
      MAX(r.created_at)                            as last_active_at
    FROM users u
    LEFT JOIN renders r ON r.user_id = u.id
    GROUP BY u.id
    ORDER BY total_renders DESC, u.created_at DESC
  `).all() as Array<{
    id: string; email: string; name: string | null; role: string;
    created_at: number;
    total_renders: number; renders_openai: number; renders_gemini: number;
    renders_baseline: number; renders_tuned: number; renders_reimagined: number;
    last_active_at: number | null;
  }>;

  const usage = rows.map(r => ({
    ...r,
    estimated_spend_usd: Number((r.total_renders * COST_PER_RENDER_USD).toFixed(2)),
  }));

  const totals = usage.reduce(
    (acc, u) => {
      acc.total_renders += u.total_renders;
      acc.renders_openai += u.renders_openai;
      acc.renders_gemini += u.renders_gemini;
      acc.renders_baseline += u.renders_baseline;
      acc.renders_tuned += u.renders_tuned;
      acc.renders_reimagined += u.renders_reimagined;
      acc.estimated_spend_usd += u.estimated_spend_usd;
      return acc;
    },
    { total_renders: 0, renders_openai: 0, renders_gemini: 0, renders_baseline: 0, renders_tuned: 0, renders_reimagined: 0, estimated_spend_usd: 0 }
  );

  if (c.req.query('format') === 'csv') {
    const csvEscape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ['email', 'name', 'role', 'created_at_iso', 'last_active_iso', 'total_renders', 'renders_openai', 'renders_gemini', 'renders_baseline', 'renders_tuned', 'renders_reimagined', 'estimated_spend_usd'];
    const lines = [headers.join(',')];
    for (const u of usage) {
      lines.push([
        u.email,
        u.name || '',
        u.role,
        new Date(u.created_at).toISOString(),
        u.last_active_at ? new Date(u.last_active_at).toISOString() : '',
        u.total_renders,
        u.renders_openai,
        u.renders_gemini,
        u.renders_baseline,
        u.renders_tuned,
        u.renders_reimagined,
        u.estimated_spend_usd.toFixed(2),
      ].map(csvEscape).join(','));
    }
    return new Response(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="fit-usage-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return c.json({ usage, totals, cost_per_render_usd: COST_PER_RENDER_USD });
});

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
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
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
      'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?'
    ).run(passwordHash, id);
    // Bump all existing sessions so the user has to log in again with the new password.
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
