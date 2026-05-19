import { Hono } from 'hono';
import { requireAuth } from '../auth.js';
import { summarizeReference, suggestPromptFromImage, getVariantSettings } from '../lib/gpt5.js';

const ai = new Hono();

ai.post('/summarize', requireAuth, async (c) => {
  let body: { referenceText?: string; referenceImages?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  try {
    const summary = await summarizeReference({
      referenceText: body.referenceText,
      referenceImages: body.referenceImages,
    });
    return c.json({ summary });
  } catch (err: any) {
    console.error('[summarize] failed:', err);
    return c.json({ error: err?.message || 'Summarize failed' }, 502);
  }
});

ai.post('/suggest-prompt', requireAuth, async (c) => {
  let body: { imageDataUrl?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.imageDataUrl) return c.json({ error: 'imageDataUrl required' }, 400);
  try {
    const prompt = await suggestPromptFromImage(body.imageDataUrl);
    return c.json({ prompt });
  } catch (err: any) {
    console.error('[suggest-prompt] failed:', err);
    return c.json({ error: err?.message || 'Suggest prompt failed' }, 502);
  }
});

ai.post('/plan', requireAuth, async (c) => {
  let body: { topic?: string; base?: any; referenceContext?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.topic || !body.base) {
    return c.json({ error: 'topic and base are required' }, 400);
  }
  try {
    const pair = await getVariantSettings({
      topic: body.topic,
      base: body.base,
      referenceContext: body.referenceContext,
    });
    return c.json({ pair });
  } catch (err: any) {
    console.error('[plan] failed:', err);
    return c.json({ error: err?.message || 'Plan failed' }, 502);
  }
});

export default ai;
