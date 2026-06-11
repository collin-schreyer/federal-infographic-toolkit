import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { requireAuth } from '../auth.js';
import { db, type PublicUser } from '../db.js';

const projects = new Hono();

// List the current user's projects, newest first, with render counts so the
// UI can show "Solicitation X (14 images)".
projects.get('/projects', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const rows = db.prepare(`
    SELECT p.id, p.name, p.created_at, COUNT(r.id) as render_count
    FROM projects p
    LEFT JOIN renders r ON r.project_id = p.id AND r.user_id = p.user_id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(user.id);
  return c.json({ projects: rows });
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
  return c.json({ project: { id, name, created_at: createdAt, render_count: 0 } }, 201);
});

// Delete a project. Its renders are kept but untagged (moved to "No project")
// so nobody loses generated images by cleaning up a project list.
projects.delete('/projects/:id', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const id = c.req.param('id');
  const row = db.prepare('SELECT user_id FROM projects WHERE id = ?').get(id) as { user_id: string } | undefined;
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.user_id !== user.id && user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  db.prepare('UPDATE renders SET project_id = NULL WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return c.json({ ok: true });
});

export default projects;
