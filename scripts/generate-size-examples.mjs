#!/usr/bin/env node
// One-time generator: produces one generic federal-flavored example image
// per Page Size & Layout preset. Outputs land in public/examples/<slug>.png
// so they ship as static assets with the SPA build.
//
// Cost: ~$0.04 per image × 7 = ~$0.28 total. Runtime ~3-4 min.
//
// Run: OPENAI_API_KEY=sk-... node scripts/generate-size-examples.mjs
// Or:  load from .env automatically (this script reads .env in repo root).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// Allow .env in repo root to provide OPENAI_API_KEY
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY not set (looked in env and ./.env)');
  process.exit(1);
}

const PALETTE = '#0A2540 (federal navy), #C5A572 (warm gold), #FAF7F2 (cream), #475569 (steel grey)';

const FAMILIES = [
  {
    key: 'inline-banner',
    size: '1280x528',
    prompt: `A clean inline-banner mini infographic showing three sequential phases — "Discover", "Validate", "Deploy" — each with a small flat USWDS-style icon and a one-line caption. Strong left-to-right arrow flow. Federal-grade typography (Arial). Palette: ${PALETTE}. Solid light background, no shadows, no decorative flourishes. Mock proposal content; do not include any real agency names. Wide and short — designed to fit inline within proposal body text.`,
  },
  {
    key: 'inline-square',
    size: '1024x1024',
    prompt: `A clean square concept-icon infographic with a central shield labeled "Zero Trust" surrounded by four small radial nodes labeled "Identity", "Devices", "Networks", "Data". Each node has a small flat USWDS-style icon. Federal-grade typography (Arial). Palette: ${PALETTE}. Solid light background, no shadows, no decorative flourishes. Mock proposal content.`,
  },
  {
    key: 'inline-tall',
    size: '800x1248',
    prompt: `A clean vertical column-style infographic showing a four-step process top to bottom — "Discover", "Plan", "Execute", "Sustain" — connected by downward arrows. Each step has a small flat USWDS-style icon, the step name, and a one-line description. Federal-grade typography (Arial). Palette: ${PALETTE}. Solid light background, no shadows. Mock proposal content. Designed to fit as a sidebar or column callout.`,
  },
  {
    key: 'process-strip',
    size: '1504x512',
    prompt: `A clean horizontal process-strip banner showing five equal-width stages left to right — "Inventory", "Assess", "Design", "Implement", "Monitor" — each with a small flat USWDS-style icon, the stage name in bold, and a 4-6 word descriptor. Connecting chevrons or arrows between stages. Federal-grade typography (Arial). Palette: ${PALETTE}. Solid light background, no shadows. Mock proposal content. Designed as a section-divider band.`,
  },
  {
    key: '11x85-landscape',
    size: '1328x1024',
    prompt: `A clean executive-grade landscape infographic titled "Capability Framework" showing five vertical pillar columns labeled "Identity", "Devices", "Networks", "Applications", "Data". Each pillar has a top icon and three sub-capabilities listed beneath it. A horizontal "Cross-Cutting Controls" band runs across the bottom with three short labels. Federal-grade typography (Arial). Palette: ${PALETTE}. Solid light background. Mock proposal content.`,
  },
  {
    key: '85x11-portrait',
    size: '1024x1328',
    prompt: `A clean portrait-orientation infographic titled "Implementation Approach" showing a vertical journey of five phases stacked top to bottom — "Discovery", "Planning", "Build", "Validate", "Operate". Each phase is a horizontal swim-lane with the phase number, name, and three short bulleted activities. Federal-grade typography (Arial). Palette: ${PALETTE}. Solid light background. Mock proposal content.`,
  },
  {
    key: '11x17-foldout',
    size: '1024x1584',
    prompt: `A clean tabloid-foldout infographic titled "Reference Architecture" showing three horizontal layers stacked top to bottom — "User Experience", "Application Services", "Foundation". Each layer contains four labeled component blocks with small flat USWDS-style icons. Subtle vertical connectors between layers. Federal-grade typography (Arial). Palette: ${PALETTE}. Solid light background. Mock proposal content.`,
  },
];

const OUT_DIR = path.join(ROOT, 'public', 'examples');
fs.mkdirSync(OUT_DIR, { recursive: true });

let made = 0;
for (const { key, size, prompt } of FAMILIES) {
  const outPath = path.join(OUT_DIR, `${key}.png`);
  if (fs.existsSync(outPath) && !process.env.FORCE) {
    console.log(`✓ ${key}.png already exists (skipping; set FORCE=1 to regenerate)`);
    continue;
  }
  console.log(`→ generating ${key} (${size})...`);
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, n: 1, size }),
  });
  if (!res.ok) {
    console.error(`  ✗ failed (${res.status}):`, (await res.text()).slice(0, 300));
    continue;
  }
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) { console.error(`  ✗ no image returned`); continue; }
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ✓ wrote ${path.relative(ROOT, outPath)} in ${sec}s`);
  made++;
}
console.log(`\nDone. Generated ${made} new example(s) in ${path.relative(ROOT, OUT_DIR)}/.`);
