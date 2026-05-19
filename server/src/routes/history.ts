import { Hono } from 'hono';
import { readFileSync, unlinkSync } from 'fs';
import { requireAuth } from '../auth.js';
import { db, type PublicUser } from '../db.js';

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
}

// Paginated list of current user's renders, newest first.
history.get('/renders', requireAuth, (c) => {
  const user = c.get('user') as PublicUser;
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const rows = db.prepare(`
    SELECT id, user_id, topic, variation, engine, visual_rhetoric,
           settings_json, source_name, image_path, thumbnail_path, created_at
    FROM renders
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(user.id, limit, offset) as RenderRow[];

  const total = (db.prepare('SELECT COUNT(*) as n FROM renders WHERE user_id = ?').get(user.id) as { n: number }).n;

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
    'SELECT image_path, user_id FROM renders WHERE id = ?'
  ).get(id) as { image_path: string; user_id: string } | undefined;

  if (!row) return c.text('Not found', 404);
  if (row.user_id !== user.id && user.role !== 'admin') return c.text('Forbidden', 403);

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
