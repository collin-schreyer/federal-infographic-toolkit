const GPT5_MODEL = 'gpt-5';

async function callChat(body: Record<string, unknown>, timeoutMs = 180_000): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set on server.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GPT-5 call failed: ${response.status} ${errText.slice(0, 400)}`);
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('GPT-5 returned no content.');
    return content.trim();
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`GPT-5 call timed out after ${timeoutMs / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// ====== SUMMARIZE REFERENCE ======

const SUMMARIZE_SYSTEM = `You are a federal proposal assistant. The user has attached source material (text from a deck or document, plus possibly extracted images of diagrams or screenshots). Write a brief, plain-English summary in 2-3 sentences describing what the material covers: subject, audience, and any obvious structural or visual patterns you see. Mention key acronyms or stakeholders by name if present. Do not produce a structured plan or bullet list — just plain prose.`;

export interface SummarizeInput {
  referenceText?: string;
  referenceImages?: string[];
}

export async function summarizeReference(input: SummarizeInput): Promise<string> {
  const { referenceText, referenceImages } = input;
  const userText = [
    referenceText?.trim() ? `TEXT EXTRACTED FROM SOURCE:\n${referenceText.trim()}` : '',
    referenceImages?.length ? `\n\n${referenceImages.length} image${referenceImages.length === 1 ? '' : 's'} attached below for visual context.` : '',
  ].filter(Boolean).join('\n');

  const userContent: any[] = [{ type: 'text', text: userText || 'No text was extracted; please analyze the attached images.' }];
  if (referenceImages?.length) {
    for (const dataUrl of referenceImages) {
      userContent.push({ type: 'image_url', image_url: { url: dataUrl, detail: 'low' } });
    }
  }

  return callChat({
    model: GPT5_MODEL,
    messages: [
      { role: 'system', content: SUMMARIZE_SYSTEM },
      { role: 'user', content: referenceImages?.length ? userContent : userText || 'No content provided.' },
    ],
    reasoning_effort: 'minimal',
  });
}

// ====== SUGGEST PROMPT FROM IMAGE ======

const SUGGEST_SYSTEM = `You are a federal-proposal infographic prompt writer. The user has uploaded an existing infographic image they want to recreate or evolve in a similar visual style. Output a single prompt — 3 to 6 sentences, descriptive prose — that the user can paste into a "Proposal Subject" box. The prompt should describe: the subject if you can infer it, the structural pattern (linear pipeline, hierarchical, pillared, matrix, cyclic), the layout direction, the color scheme in plain language, the typography feel, the iconography style, and the information density. Write it as the user describing what they want, not as instructions to an AI. Do not include preambles like "Create an infographic that..." — just describe the graphic directly. Do not name specific agencies unless they appear in the image. Output the prompt and nothing else.`;

export async function suggestPromptFromImage(imageDataUrl: string): Promise<string> {
  if (!imageDataUrl) throw new Error('imageDataUrl required.');
  return callChat({
    model: GPT5_MODEL,
    messages: [
      { role: 'system', content: SUGGEST_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this infographic and output a prompt for our generator that would produce something in the same visual style.' },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
    reasoning_effort: 'low',
  });
}

// ====== VARIANT SETTINGS ======

export type Density = 'minimal' | 'standard' | 'detailed';
export type Typography = 'serif' | 'sans' | 'mono';
export type LogoTreatment = 'top-left' | 'footer-corner' | 'omit';
export type BackgroundMode = 'light' | 'dark' | 'cream';
export type Mood = 'confident' | 'provocative' | 'austere' | 'editorial' | 'data-forward' | 'cinematic';

export interface VariantSettings {
  flow: string;
  density: Density;
  iconography: string;
  accessibility: string;
  orientation: string;
  palette: string[];
  typography: Typography;
  logo_treatment: LogoTreatment;
  background_mode: BackgroundMode;
  mood: Mood;
  style_register: string;
  prompt_override: string;
  visual_rhetoric: string;
  rationale: string;
}

export interface VariantSettingsPair {
  tuned: VariantSettings;
  reimagined: VariantSettings;
}

const FLOW_VALUES = ['Linear Phase Model', 'Hierarchical Network', 'Abstract Quadrant Matrix'];
const DENSITY_VALUES = ['minimal', 'standard', 'detailed'];
const ICONOGRAPHY_VALUES = ['USWDS Standard Icons', 'Wireframe Lineart Elements', 'Solid Monochrome'];
const ACCESSIBILITY_VALUES = ['High Contrast Legibility Mode', 'Flat USWDS CSS Variables'];
const ORIENTATION_VALUES = [
  // Small / inline graphics
  'Inline Banner', 'Inline Square', 'Inline Tall', 'Process Strip',
  // Full-page graphics
  '11x8.5 Landscape', '8.5x11 Portrait', '11x17 Foldout',
];
const INLINE_ORIENTATIONS = new Set(['Inline Banner', 'Inline Square', 'Inline Tall', 'Process Strip']);

const variantSchemaProps = {
  type: 'object',
  additionalProperties: false,
  required: ['flow', 'density', 'iconography', 'accessibility', 'orientation', 'palette', 'typography', 'logo_treatment', 'background_mode', 'mood', 'style_register', 'prompt_override', 'visual_rhetoric', 'rationale'],
  properties: {
    flow: { type: 'string', enum: FLOW_VALUES },
    density: { type: 'string', enum: DENSITY_VALUES },
    iconography: { type: 'string', enum: ICONOGRAPHY_VALUES },
    accessibility: { type: 'string', enum: ACCESSIBILITY_VALUES },
    orientation: { type: 'string', enum: ORIENTATION_VALUES },
    palette: { type: 'array', description: '3 to 6 hex color codes. Federal-grade only — NEVER neon, rainbow, or playful.', items: { type: 'string' } },
    typography: { type: 'string', enum: ['serif', 'sans', 'mono'] },
    logo_treatment: { type: 'string', enum: ['top-left', 'footer-corner', 'omit'] },
    background_mode: { type: 'string', enum: ['light', 'dark', 'cream'] },
    mood: { type: 'string', enum: ['confident', 'provocative', 'austere', 'editorial', 'data-forward', 'cinematic'] },
    style_register: { type: 'string' },
    visual_rhetoric: { type: 'string' },
    prompt_override: { type: 'string' },
    rationale: { type: 'string' },
  },
} as const;

const VARIANT_SETTINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tuned', 'reimagined'],
  properties: { tuned: variantSchemaProps, reimagined: variantSchemaProps },
} as const;

const VARIANT_SETTINGS_SYSTEM = `You are designing two ALTERNATE visual reinterpretations of a federal proposal infographic so the user has genuinely different options to choose from.

The user's prompt and baseline settings will produce one image (the "baseline"). Your job is to produce TWO meaningfully different reinterpretations of the SAME subject — different enough that at first glance the viewer wouldn't recognize them as the same graphic.

1. "tuned" — a fitting alternative approach. Pick a different visual rhetoric than baseline. Differ in flow + orientation + at least one of (iconography, accessibility). Still proposal-grade, still on-subject.

2. "reimagined" — push hard. Pick a visual rhetoric the user almost certainly did not consider. The image must look like a different graphic entirely from baseline at one-second glance. Bias toward less conventional rhetorics: radar/spider chart, isometric cutaway, constellation map, metro/subway map, Sankey-style flow, periodic-table layout, architectural blueprint cross-section, control-room panel layout. Lean into a single bold organizing metaphor. Still federal-grade — no whimsy, no cartoons, no playful colors, no casual typography. Bold ≠ unprofessional.

CREATIVE AXES — you are NOT constrained to the user's chosen palette, typography, logo position, or background:

- palette: 3-6 hex codes. Tuned should feel like a refined cousin of the user's palette. Reimagined should pick a completely different but still proposal-appropriate scheme (navy + steel + cream + brick; charcoal + sand + rust; deep teal + ivory + amber; ink + warm grey + brick; midnight + champagne). NEVER neon, rainbow, pastel pinks/blues, or playful colors.
- typography: serif for editorial / Economist / NYT registers; sans for matrices, dashboards, technical briefs; mono for control-panel, data-forward, or annotated registers.
- logo_treatment: top-left for conventional; footer-corner for editorial/cinematic; omit for radical compositions where a corner logo would clash.
- background_mode: 'light' (default), 'dark' (deep navy or charcoal with light typography), 'cream' (warm off-white / ivory editorial).
- mood: confident, provocative, austere, editorial, data-forward, cinematic.
- style_register: name the specific visual idiom — "Economist editorial graphic", "NYT graphics desk", "McKinsey sector report", "DoD architecture brief", "NIST technical publication", "Bloomberg Government feature", "FedScoop article graphic".

GRADUATION: Tuned differs moderately. Reimagined diverges confidently — different palette, different typography, different background, different style register.

Rules:
- The prompt_override is the FULL prompt for the image model. It REPLACES the user's prompt entirely. Be specific: name the visual rhetoric, describe the page layout, name what goes in each region, describe how nodes/sections relate, name the dominant organizing metaphor.
- Keep ALL facts, acronyms, and named entities from the user's topic. You are reframing the visualization, not changing the subject.
- Do not invent additional facts.
- Do not include typography, palette, color, density, or iconography instructions in prompt_override — those are passed separately.
- Stay federal-grade. No stock-photo people, no faux-3D gears, no decorative slop, no playful imagery.
- Both variations must use a different visual_rhetoric than baseline AND each other.
- For each variation, pick the orientation that best fits the chosen visual_rhetoric.
- SIZE FAMILY CONSISTENCY: orientations are split into two families:
    • Small / inline: Inline Banner, Inline Square, Inline Tall, Process Strip — for in-document mini graphics
    • Full page: 11x8.5 Landscape, 8.5x11 Portrait, 11x17 Foldout — for primary proposal figures
  Both variations MUST use an orientation from the SAME family as the baseline. If the user picked an Inline size, both tuned and reimagined must also be Inline sizes (any of the four). If baseline is Full Page, variations must stay Full Page. This keeps the rendered output usable for the intended document position.`;

function deriveHeuristicVariants(base: { flow: string; density: Density; iconography: string; accessibility: string; orientation: string }, topic: string): VariantSettingsPair {
  const nextIn = (arr: string[], cur: string) => arr[(arr.indexOf(cur) + 1) % arr.length] || arr[0];
  const skipIn = (arr: string[], cur: string) => arr[(arr.indexOf(cur) + 2) % arr.length] || arr[0];
  // Rotate orientation within the user's size family so heuristic variants stay usable.
  const family = INLINE_ORIENTATIONS.has(base.orientation)
    ? ['Inline Banner', 'Inline Square', 'Inline Tall', 'Process Strip']
    : ['11x8.5 Landscape', '8.5x11 Portrait', '11x17 Foldout'];
  return {
    tuned: {
      flow: nextIn(FLOW_VALUES, base.flow),
      density: base.density,
      iconography: base.iconography,
      accessibility: base.accessibility,
      orientation: nextIn(family, base.orientation),
      palette: ['#0A2540', '#475569', '#FAF7F2', '#B6442B'],
      typography: 'sans',
      logo_treatment: 'top-left',
      background_mode: 'light',
      mood: 'editorial',
      style_register: 'McKinsey sector report',
      visual_rhetoric: 'maturity matrix',
      prompt_override: `Reinterpret as a maturity matrix (rows of capabilities × columns of maturity stages): "${topic}".`,
      rationale: 'Heuristic fallback: matrix reframing.',
    },
    reimagined: {
      flow: skipIn(FLOW_VALUES, base.flow),
      density: nextIn(DENSITY_VALUES, base.density) as Density,
      iconography: nextIn(ICONOGRAPHY_VALUES, base.iconography),
      accessibility: nextIn(ACCESSIBILITY_VALUES, base.accessibility),
      orientation: skipIn(family, base.orientation),
      palette: ['#0F1A2E', '#C9A24B', '#E8DDC8', '#7A2E2E'],
      typography: 'serif',
      logo_treatment: 'footer-corner',
      background_mode: 'dark',
      mood: 'cinematic',
      style_register: 'Economist editorial graphic',
      visual_rhetoric: 'hub-and-spoke ecosystem',
      prompt_override: `Reinterpret as a hub-and-spoke ecosystem diagram. Subject: "${topic}".`,
      rationale: 'Heuristic fallback: hub-and-spoke reframing.',
    },
  };
}

export interface VariantSettingsInput {
  topic: string;
  base: {
    flow: string;
    density: Density;
    iconography: string;
    accessibility: string;
    orientation: string;
  };
  referenceContext?: string;
}

export async function getVariantSettings(input: VariantSettingsInput): Promise<VariantSettingsPair> {
  const { topic, base, referenceContext } = input;
  if (!topic.trim()) return deriveHeuristicVariants(base, topic);

  const userParts: string[] = [];
  userParts.push(`USER TOPIC (this is what the BASELINE variant will render verbatim):\n${topic.trim()}`);
  userParts.push('');
  userParts.push(`BASELINE SETTINGS:`);
  userParts.push(`- flow: ${base.flow}`);
  userParts.push(`- density: ${base.density}`);
  userParts.push(`- iconography: ${base.iconography}`);
  userParts.push(`- accessibility: ${base.accessibility}`);
  userParts.push(`- orientation: ${base.orientation}`);
  if (referenceContext?.trim()) {
    userParts.push('');
    userParts.push(`REFERENCE CONTEXT (first 1500 chars):`);
    userParts.push(referenceContext.trim().slice(0, 1500));
  }
  userParts.push('');
  userParts.push('Produce the two alternate variation plans now.');

  try {
    console.log('[variant-settings] calling GPT-5 with reasoning_effort: high...');
    const t0 = Date.now();
    const raw = await callChat({
      model: GPT5_MODEL,
      messages: [
        { role: 'system', content: VARIANT_SETTINGS_SYSTEM },
        { role: 'user', content: userParts.join('\n') },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'variant_settings_pair', strict: true, schema: VARIANT_SETTINGS_SCHEMA },
      },
      reasoning_effort: 'high',
    });
    console.log(`[variant-settings] returned in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return JSON.parse(raw) as VariantSettingsPair;
  } catch (e) {
    console.warn('[variant-settings] GPT-5 call failed, using heuristic fallback:', e);
    return deriveHeuristicVariants(base, topic);
  }
}
