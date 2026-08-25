import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { attachUser } from './auth.js';
import { seedAdminIfMissing } from './db.js';
import authRoutes from './routes/auth.js';
import renderRoutes from './routes/render.js';
import aiRoutes from './routes/ai.js';
import historyRoutes from './routes/history.js';
import userRoutes from './routes/users.js';
import projectRoutes from './routes/projects.js';
import { migrationNoticeEnabled, migrationNoticeHtml } from './migration-notice.js';
import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import { resolve } from 'path';

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

// Sunset mode (Fly only, via MIGRATED_NOTICE=1): the deployment stops serving
// the app and explains where it went. Health stays live above so monitoring
// still works. Unset the variable to bring it back instantly.
if (migrationNoticeEnabled()) {
  const noticeHtml = migrationNoticeHtml();
  app.all('/api/*', (c) =>
    c.json(
      { error: 'This deployment has been retired. The Federal Infographic Toolkit has moved to AWS — contact Collin Schreyer for the new address.' },
      410,
    ),
  );
  app.get('*', (c) => c.html(noticeHtml, 410));
}

app.route('/api/auth', authRoutes);
app.route('/api', renderRoutes);
app.route('/api', aiRoutes);
app.route('/api', historyRoutes);
app.route('/api', userRoutes);
app.route('/api', projectRoutes);

// In production we bundle the built SPA into ./public and serve it from this
// same process. The static middleware handles /assets/*; everything else that
// isn't an /api/* route falls back to index.html for SPA client-side routing.
const PUBLIC_DIR = process.env.PUBLIC_DIR || './public';
if (existsSync(PUBLIC_DIR)) {
  // Cache policy matters here: Vite asset filenames are content-hashed, so
  // /assets/* can be cached forever. index.html must NEVER be cached — a
  // browser holding a stale index.html keeps requesting old (deleted) bundles
  // after each deploy, which is exactly how users end up on broken builds.
  app.use('/*', serveStatic({
    root: PUBLIC_DIR,
    onFound: (path, c) => {
      if (path.includes('/assets/')) {
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        c.header('Cache-Control', 'no-cache');
      }
    },
  }));
  const indexHtmlPath = resolve(PUBLIC_DIR, 'index.html');
  if (existsSync(indexHtmlPath)) {
    const indexHtml = readFileSync(indexHtmlPath, 'utf-8');
    app.get('*', (c) => {
      if (c.req.path.startsWith('/api/')) return c.notFound();
      c.header('Cache-Control', 'no-cache');
      return c.html(indexHtml);
    });
  }
}

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
