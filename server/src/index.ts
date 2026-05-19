import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { attachUser } from './auth.js';
import { seedAdminIfMissing } from './db.js';
import authRoutes from './routes/auth.js';

const app = new Hono();

app.use(logger());

// During local dev the Vite dev server runs on its own origin (3002) and
// proxies /api/* to us. In production the SPA is served from the same origin
// so CORS is moot. Allow localhost dev origins explicitly.
app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:3002', 'http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

// Every /api request gets the current user (if logged in) attached.
app.use('/api/*', attachUser);

app.get('/api/health', (c) =>
  c.json({ ok: true, time: new Date().toISOString() })
);

app.route('/api/auth', authRoutes);

// 404 fallback for unknown API routes (keeps SPA fallback clean).
app.notFound((c) => {
  const path = c.req.path;
  if (path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404);
  return c.text('Not found', 404);
});

app.onError((err, c) => {
  console.error('[server error]', err);
  return c.json({ error: err.message || 'Internal error' }, 500);
});

const port = parseInt(process.env.PORT || '8787', 10);

await seedAdminIfMissing();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
  console.log(`[server] health check: http://localhost:${info.port}/api/health`);
});
