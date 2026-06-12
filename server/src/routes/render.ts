import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { requireAuth } from '../auth.js';
import { db, UPLOADS_DIR, type PublicUser } from '../db.js';
import { generateInfographicImage as generateOpenAI } from '../lib/openai.js';
import { generateInfographicImage as generateGemini } from '../lib/gemini.js';
import { compositeLogo } from '../lib/composite.js';
import { projectRole } from './projects.js';
import type { VariantOverrides } from '../lib/variant-overrides.js';

const render = new Hono();

interface RenderBody {
  engine: 'openai' | 'gemini';
  topic: string;
  colors: string[];
  fontFamily: string;
  logoUrl: string | null;
  density: 'minimal' | 'standard' | 'detailed';
  flow: string;
  orientation: string;
  accessibility: string;
  iconography: string;
  isTransparent: boolean;
  imageToReviseBase64: string | null;
  revisionPrompt: string | null;
  contextText: string | null;
  referenceImageBase64?: string | null;
  overrides?: VariantOverrides;
  // Optional metadata for history persistence
  variation?: 'baseline' | 'tuned' | 'reimagined';
  visualRhetoric?: string;
  sourceName?: string;
  project_id?: string | null;
}

// Persist the generated image to disk + DB so it shows up in the user's history.
function persistRender(
  user: PublicUser,
  body: RenderBody,
  dataUrl: string,
): { id: string; createdAt: number } {
  const id = randomBytes(12).toString('hex');
  const userDir = join(UPLOADS_DIR, user.id);
  mkdirSync(userDir, { recursive: true });
  // Decode the base64 portion and write the raw bytes.
  const [, b64] = dataUrl.split(',');
  const filePath = join(userDir, `${id}.png`);
  writeFileSync(filePath, Buffer.from(b64, 'base64'));

  // Only tag with a project the user owns or is a member of; drop otherwise.
  let projectId: string | null = null;
  if (body.project_id && projectRole(body.project_id, user.id)) {
    projectId = body.project_id;
  }

  const createdAt = Date.now();
  db.prepare(`
    INSERT INTO renders (
      id, user_id, topic, variation, engine, visual_rhetoric,
      settings_json, source_name, image_path, thumbnail_path, created_at, project_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    id,
    user.id,
    body.topic,
    body.variation || 'baseline',
    body.engine,
    body.visualRhetoric || null,
    JSON.stringify({
      colors: body.colors,
      fontFamily: body.fontFamily,
      density: body.density,
      flow: body.flow,
      orientation: body.orientation,
      accessibility: body.accessibility,
      iconography: body.iconography,
      isTransparent: body.isTransparent,
      overrides: body.overrides,
    }),
    body.sourceName || null,
    filePath,
    createdAt,
    projectId,
  );

  return { id, createdAt };
}

render.post('/render', requireAuth, async (c) => {
  const user = c.get('user') as PublicUser;
  let body: RenderBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.engine || !body.topic?.trim()) {
    return c.json({ error: 'engine and topic are required' }, 400);
  }

  try {
    let dataUrl = body.engine === 'openai'
      ? await generateOpenAI(body)
      : await generateGemini(body);

    // Pixel-perfect logo: the model reserved a clean corner; now stamp the
    // user's actual logo file onto the render. The logo is never redrawn by
    // a model — it's the user's own pixels. Compositing failure must never
    // fail the render itself.
    const treatment = body.overrides?.logoTreatment ?? 'top-left';
    if (body.logoUrl && treatment !== 'omit') {
      try {
        dataUrl = await compositeLogo(
          dataUrl,
          body.logoUrl,
          treatment === 'footer-corner' ? 'footer-corner' : 'top-left',
        );
      } catch (e) {
        console.warn('[render] logo compositing failed; returning render without composite:', e);
      }
    }

    // Only persist initial renders, not revisions. A revision REPLACES an
    // existing render in the UI, so the history row stays attached to the
    // original render until the user explicitly saves the revised version.
    // For now, persist everything. We'll add an explicit "save to history"
    // model later if it gets noisy.
    const { id, createdAt } = persistRender(user, body, dataUrl);
    return c.json({ id, dataUrl, createdAt });
  } catch (err: any) {
    console.error('[render] failed:', err);
    return c.json({ error: err?.message || 'Render failed' }, 502);
  }
});

export default render;
