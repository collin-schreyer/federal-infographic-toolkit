import { Hono } from 'hono';
import { readFileSync, unlinkSync } from 'fs';
import { requireAuth } from '../auth.js';
import { db, type PublicUser } from '../db.js';
import { projectRole } from './projects.js';

const history = new Hono();

interface RenderRow {
  id: string;
  user_id: string;
  topic: string;
  variation: string;
  engine: string;
  visual_rhetoric: string | null;
  settings_json: string;
  source_name: string | null;
  image_path: string;
  thumbnail_path: string | null;
  created_at: number;
  project_id: string | null;
  creator_email: string;
}

// Paginated list of current user's renders, newest first. Optional ?project=
// filter scopes to one project ('none' = untagged renders only).
history.get('/renders', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const project = c.req.query('project');

  // Personal views ('' = all mine, 'none' = my unfiled) scope to the
  // requester's own renders. A specific project id shows EVERY participant's
  // renders in that project — but only for its owner/members (or an admin).
  let where: string;
  const params: unknown[] = [];
  if (project && project !== 'none') {
    const role = projectRole(project, user.id);
    if (!role && user.role !== 'admin') {
      return c.json({ error: 'You are not a member of that project.' }, 403);
    }
    where = 'r.project_id = ?';
    params.push(project);
  } else if (project === 'none') {
    where = 'r.user_id = ? AND r.project_id IS NULL';
    params.push(user.id);
  } else {
    where = 'r.user_id = ?';
    params.push(user.id);
  }

  const rows = db.prepare(`
    SELECT r.id, r.user_id, r.topic, r.variation, r.engine, r.visual_rhetoric,
           r.settings_json, r.source_name, r.image_path, r.thumbnail_path, r.created_at, r.project_id,
           u.email as creator_email
    FROM renders r
    JOIN users u ON u.id = r.user_id
    WHERE ${where}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as RenderRow[];

  const total = (db.prepare(`SELECT COUNT(*) as n FROM renders r WHERE ${where}`).get(...params) as { n: number }).n;

  return c.json({
    total,
    limit,
    offset,
    renders: rows.map(r => ({
      id: r.id,
      topic: r.topic,
      variation: r.variation,
      engine: r.engine,
      visual_rhetoric: r.visual_rhetoric,
      source_name: r.source_name,
      created_at: r.created_at,
      project_id: r.project_id,
      creator_email: r.creator_email,
      // Don't ship the image bytes in the list response; client fetches each as needed.
      image_url: `/api/renders/${r.id}/image`,
      settings: JSON.parse(r.settings_json),
    })),
  });
});

// Serve the image bytes (auth-checked — only the owner can read their own).
history.get('/renders/:id/image', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const id = c.req.param('id');
  const row = db.prepare(
    'SELECT image_path, user_id, project_id FROM renders WHERE id = ?'
  ).get(id) as { image_path: string; user_id: string; project_id: string | null } | undefined;

  if (!row) return c.text('Not found', 404);
  const sharedAccess = row.project_id ? projectRole(row.project_id, user.id) !== null : false;
  if (row.user_id !== user.id && user.role !== 'admin' && !sharedAccess) return c.text('Forbidden', 403);

  try {
    const bytes = readFileSync(row.image_path);
    return new Response(bytes as any, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return c.text('Image file missing on disk', 410);
  }
});

history.delete('/renders/:id', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const id = c.req.param('id');
  const row = db.prepare(
    'SELECT image_path, user_id FROM renders WHERE id = ?'
  ).get(id) as { image_path: string; user_id: string } | undefined;
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (row.user_id !== user.id && user.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }
  try { unlinkSync(row.image_path); } catch { /* file may already be gone */ }
  db.prepare('DELETE FROM renders WHERE id = ?').run(id);
  return c.json({ ok: true });
});

export default history;
