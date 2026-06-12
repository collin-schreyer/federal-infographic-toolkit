import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { requireAuth } from '../auth.js';
import { db, type PublicUser } from '../db.js';

const projects = new Hono();

// What relationship does this user have to the project? Used here and by the
// history/render routes to authorize shared-project access.
export function projectRole(projectId: string, userId: string): 'owner' | 'member' | null {
  const proj = db.prepare('SELECT user_id FROM projects WHERE id = ?').get(projectId) as { user_id: string } | undefined;
  if (!proj) return null;
  if (proj.user_id === userId) return 'owner';
  const m = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  return m ? 'member' : null;
}

// List every project the user owns OR has been added to, with render counts
// (all participants' renders) and member counts so shared projects read as
// "Pursuit X · shared by carl@… · 3 members · 14 images".
projects.get('/projects', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const rows = db.prepare(`
    SELECT p.id, p.name, p.created_at, p.user_id,
           u.email as owner_email,
           (SELECT COUNT(*) FROM renders r WHERE r.project_id = p.id) as render_count,
           (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as member_count
    FROM projects p
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?
       OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?)
    ORDER BY p.created_at DESC
  `).all(user.id, user.id) as Array<{
    id: string; name: string; created_at: number; user_id: string;
    owner_email: string; render_count: number; member_count: number;
  }>;

  return c.json({
    projects: rows.map(r => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      render_count: r.render_count,
      member_count: r.member_count,
      owner_email: r.owner_email,
      is_owner: r.user_id === user.id,
    })),
  });
});

projects.post('/projects', requireAuth, async (c) => {
  const user = c.get('user') as PublicUser;
  let body: { name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const name = body.name?.trim();
  if (!name) return c.json({ error: 'Project name is required.' }, 400);
  if (name.length > 120) return c.json({ error: 'Project name must be 120 characters or fewer.' }, 400);

  const id = randomBytes(12).toString('hex');
  const createdAt = Date.now();
  db.prepare('INSERT INTO projects (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
    .run(id, user.id, name, createdAt);
  return c.json({
    project: { id, name, created_at: createdAt, render_count: 0, member_count: 0, owner_email: user.email, is_owner: true },
  }, 201);
});

// Delete a project. Owner or admin only. Renders are kept but untagged so
// nobody loses generated images. Membership rows cascade away.
projects.delete('/projects/:id', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const id = c.req.param('id') ?? '';
  const row = db.prepare('SELECT user_id FROM projects WHERE id = ?').get(id) as { user_id: string } | undefined;
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.user_id !== user.id && user.role !== 'admin') return c.json({ error: 'Only the project owner can delete it.' }, 403);
  db.prepare('UPDATE renders SET project_id = NULL WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return c.json({ ok: true });
});

// ----- Members -----

projects.get('/projects/:id/members', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const id = c.req.param('id') ?? '';
  const role = projectRole(id, user.id);
  if (!role && user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  const owner = db.prepare(`
    SELECT u.id, u.email, u.name FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(id) as { id: string; email: string; name: string | null } | undefined;
  if (!owner) return c.json({ error: 'Not found' }, 404);

  const members = db.prepare(`
    SELECT u.id, u.email, u.name FROM project_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ? ORDER BY pm.created_at ASC
  `).all(id) as Array<{ id: string; email: string; name: string | null }>;

  return c.json({ owner, members, your_role: role ?? 'admin' });
});

// Add a teammate by email. Owner (or admin) only.
projects.post('/projects/:id/members', requireAuth, async (c) => {
  const user = c.get('user') as PublicUser;
  const id = c.req.param('id') ?? '';
  const role = projectRole(id, user.id);
  if (role !== 'owner' && user.role !== 'admin') {
    return c.json({ error: 'Only the project owner can add members.' }, 403);
  }

  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const email = body.email?.toLowerCase().trim();
  if (!email) return c.json({ error: 'email is required' }, 400);

  const target = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email) as
    | { id: string; email: string; name: string | null } | undefined;
  if (!target) return c.json({ error: `No account exists for ${email}. An admin needs to create their account first.` }, 404);

  const proj = db.prepare('SELECT user_id FROM projects WHERE id = ?').get(id) as { user_id: string } | undefined;
  if (!proj) return c.json({ error: 'Not found' }, 404);
  if (proj.user_id === target.id) return c.json({ error: 'That user owns this project already.' }, 400);

  db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, added_by, created_at) VALUES (?, ?, ?, ?)')
    .run(id, target.id, user.id, Date.now());
  return c.json({ member: target }, 201);
});

projects.delete('/projects/:id/members/:userId', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const id = c.req.param('id') ?? '';
  const memberId = c.req.param('userId') ?? '';
  const role = projectRole(id, user.id);
  // Owner/admin can remove anyone; a member can remove themself (leave).
  const isSelf = memberId === user.id;
  if (role !== 'owner' && user.role !== 'admin' && !isSelf) {
    return c.json({ error: 'Only the project owner can remove members.' }, 403);
  }
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(id, memberId);
  return c.json({ ok: true });
});

export default projects;
