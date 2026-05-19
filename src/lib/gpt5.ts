const GPT5_MODEL = 'gpt-5';

async function callChat(apiKey: string, body: Record<string, unknown>, timeoutMs = 180_000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('GPT-5 error:', response.status, errText);
      throw new Error(`GPT-5 call failed: ${response.status} ${errText.slice(0, 300)}`);
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

// Short, human-readable summary of what the user uploaded. Shown as a
// "context captured" note so the user can confirm we understood the material.
export interface SummarizeInput {
  apiKey: string;
  referenceText?: string;
  referenceImages?: string[]; // data URLs
}

export async function summarizeReference(input: SummarizeInput): Promise<string> {
  const { apiKey, referenceText, referenceImages } = input;
  if (!apiKey) throw new Error('OpenAI API key is required.');

  const SYSTEM = `You are a federal proposal assistant. The user has attached source material (text from a deck or document, plus possibly extracted images of diagrams or screenshots). Write a brief, plain-English summary in 2-3 sentences describing what the material covers: subject, audience, and any obvious structural or visual patterns you see. Mention key acronyms or stakeholders by name if present. Do not produce a structured plan or bullet list — just plain prose.`;

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

  return callChat(apiKey, {
    model: GPT5_MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: referenceImages?.length ? userContent : userText || 'No content provided.' },
    ],
    reasoning_effort: 'minimal',
  });
}

// Style-reference: user uploads an existing infographic and we return a prompt
// they can paste into the Proposal Subject box to render something in a similar
// visual style.
export interface SuggestPromptInput {
  apiKey: string;
  imageDataUrl: string;
}

export async function suggestPromptFromImage(input: SuggestPromptInput): Promise<string> {
  const { apiKey, imageDataUrl } = input;
  if (!apiKey) throw new Error('OpenAI API key is required.');
  if (!imageDataUrl) throw new Error('Image data URL is required.');

  const SYSTEM = `You are a federal-proposal infographic prompt writer. The user has uploaded an existing infographic image they want to recreate or evolve in a similar visual style. Output a single prompt — 3 to 6 sentences, descriptive prose — that the user can paste into a "Proposal Subject" box. The prompt should describe: the subject if you can infer it, the structural pattern (linear pipeline, hierarchical, pillared, matrix, cyclic), the layout direction, the color scheme in plain language (e.g. "deep navy with muted orange accents"), the typography feel (serif/sans, weight), the iconography style (USWDS-style flat, wireframe, monochrome), and the information density. Write it as the user describing what they want, not as instructions to an AI. Do not include preambles like "Create an infographic that..." — just describe the graphic directly. Do not name specific agencies unless they appear in the image. Output the prompt and nothing else.`;

  return callChat(apiKey, {
    model: GPT5_MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
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

// Variant-settings picker: given a topic and the user's chosen settings, GPT-5
// returns two alternate setting bundles ("tuned" and "reimagined") so we can
// render three genuinely different variants per engine instead of three
// near-identical copies of the same.
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
  // Creative unlocks (A, B, D, E, F, G)
  palette: string[];
  typography: Typography;
  logo_treatment: LogoTreatment;
  background_mode: BackgroundMode;
  mood: Mood;
  style_register: string;
  // Existing rhetoric fields
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
const ORIENTATION_VALUES = ['11x8.5 Landscape', '8.5x11 Portrait', '11x17 Foldout'];

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
    palette: {
      type: 'array',
      description: '3 to 6 hex color codes for this variant (e.g., "#0A2540"). Federal-grade only — NEVER neon, rainbow, or playful. Conservative editorial / executive registers (navy + steel + cream, ink + warm grey, charcoal + brick, etc.).',
      items: { type: 'string' },
    },
    typography: { type: 'string', enum: ['serif', 'sans', 'mono'], description: 'serif for editorial registers, sans for matrices/dashboards, mono for data-forward / control-panel registers.' },
    logo_treatment: { type: 'string', enum: ['top-left', 'footer-corner', 'omit'], description: 'top-left = conventional, footer-corner = editorial register, omit = radical reimagining where the logo would disrupt composition.' },
    background_mode: { type: 'string', enum: ['light', 'dark', 'cream'], description: 'light = default professional, dark = executive-report cinematic register (deep navy/charcoal), cream = editorial register.' },
    mood: { type: 'string', enum: ['confident', 'provocative', 'austere', 'editorial', 'data-forward', 'cinematic'] },
    style_register: { type: 'string', description: 'Short phrase naming a specific visual reference idiom, e.g. "Economist editorial graphic", "NYT graphics desk", "McKinsey sector report", "DoD architecture brief", "NIST technical publication", "Bloomberg Government feature".' },
    visual_rhetoric: { type: 'string', description: 'Name of the visual structure used, e.g. "horizontal swimlane chart", "maturity matrix", "hub-and-spoke", "exploded layered architecture", "metro map". Single phrase.' },
    prompt_override: { type: 'string', description: 'A COMPLETE rewrite of the subject the image model should render. Re-describe what to draw using the chosen visual_rhetoric. Include layout, what occupies which region of the page, how elements relate. 4-8 sentences. REPLACES the user-provided topic. Do not include typography, palette, density, or iconography instructions here — those are passed separately.' },
    rationale: { type: 'string', description: 'One short sentence explaining why this approach fits the subject.' },
  },
} as const;

const VARIANT_SETTINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tuned', 'reimagined'],
  properties: {
    tuned: variantSchemaProps,
    reimagined: variantSchemaProps,
  },
} as const;

const VARIANT_SETTINGS_SYSTEM = `You are designing two ALTERNATE visual reinterpretations of a federal proposal infographic so the user has genuinely different options to choose from.

The user's prompt and baseline settings will produce one image (the "baseline"). Your job is to produce TWO meaningfully different reinterpretations of the SAME subject — different enough that at first glance the viewer wouldn't recognize them as the same graphic.

For each variation you must rewrite the prompt the image model receives so it actually draws something structurally different. Settings alone cannot override a detailed user prompt — the prompt itself has to change.

1. "tuned" — a fitting alternative approach. Pick a different visual rhetoric than baseline (e.g., if baseline is sequential phases, try a maturity matrix or capability dashboard). Differ in flow + orientation + at least one of (iconography, accessibility). Still proposal-grade, still on-subject. This one should feel like a confident "what if we showed it as ___ instead."

2. "reimagined" — push hard. The viewer should look at this and say "I would never have thought to show it this way — and it works." Pick a visual rhetoric the user almost certainly did not consider. This is your chance to do something genuinely fresh that a federal evaluator will remember after reading 200 pages of look-alike proposals.

REIMAGINED-SPECIFIC GUIDANCE:
- Bias toward LESS conventional rhetorics. If you were going to pick a basic matrix or pillared map for "tuned," pick something more ambitious for "reimagined" — a radar/spider chart, an isometric cutaway, a constellation map, a metro/subway map, a Sankey-style flow, a periodic-table layout, an architectural blueprint cross-section, a control-room panel layout.
- The reimagined image should look meaningfully different from baseline at a glance — different shape on the page, different reading direction, different geometric logic.
- Lean into a single bold organizing metaphor (e.g., "everything is a station on a metro line," "everything is a layer of an architectural cutaway," "everything is a node in a constellation"). Commit to it.
- Still must read as a serious federal proposal graphic. NO whimsy, NO cartoons, NO playful colors, NO casual typography. Bold ≠ unprofessional. Think editorial infographics from The Economist, NYT graphics desk, or McKinsey reports — clean, surprising, and deeply considered.
- Must remain compliant with USWDS / Section 508 expectations the user has set.

Visual rhetoric vocabulary (use as inspiration — invent new ones if a better fit exists):

CONVENTIONAL (good for "tuned"):
- horizontal swimlane chart
- vertical timeline / journey
- maturity matrix (rows × columns)
- pillared capability map
- hub-and-spoke ecosystem
- executive dashboard / scorecard
- before-and-after split panel
- comparison quadrants (2x2 grid)
- circular feedback loop
- value-chain horizontal stages with metrics

AMBITIOUS (good for "reimagined"):
- radar / spider chart with multiple overlays
- metro / subway map (lines = workstreams, stations = milestones)
- Sankey flow diagram (proportional flows between phases)
- isometric architectural cutaway (cross-section of the solution stack)
- constellation / star-map (nodes positioned by relationship, not grid)
- periodic-table layout (elements grouped by category)
- topological map / contour layers
- river-delta branching flow
- decision-tree fan
- nested-shell / matryoshka structure
- gauge-and-dial control panel layout
- exploded layered architecture (separated horizontal strata with labels)
- concentric rings / orbital framework
- iceberg / above-below the waterline
- stacked-bar timeline with capability rows
- waffle / unit-grid composition for proportional data
- horizon scan (foreground / midground / horizon time bands)
- mind-map with weighted edges

CREATIVE AXES — you are NOT constrained to the user's chosen palette, typography, logo position, or background. Tuned and Reimagined have permission to break out:

- palette — pick 3-6 hex codes that fit the visual rhetoric. Tuned should feel like a refined cousin of the user's palette (similar hue family, different ratios, maybe one swapped neutral). Reimagined should pick a completely different but still proposal-appropriate scheme. Good registers: navy + steel + cream + brick; charcoal + sand + rust; deep teal + ivory + amber; ink + warm grey + brick; midnight + champagne. NEVER neon, rainbow, pastel pinks/blues, or playful colors.

- typography — serif for editorial / Economist / NYT registers; sans for matrices, dashboards, technical briefs; mono for control-panel, data-forward, or annotated registers.

- logo_treatment — top-left for conventional layouts; footer-corner for editorial/cinematic registers; omit for radical compositions where a corner logo would clash (e.g. metro maps, concentric rings, full-bleed cinematic backgrounds).

- background_mode — 'light' (default), 'dark' (deep navy or charcoal background, light typography — works well for executive reports and cinematic registers), 'cream' (warm off-white / ivory editorial register).

- mood — pick the adjective that captures emotional register: confident, provocative, austere, editorial, data-forward, cinematic.

- style_register — name the specific visual idiom: "Economist editorial graphic", "NYT graphics desk", "McKinsey sector report", "DoD architecture brief", "NIST technical publication", "Bloomberg Government feature", "FedScoop article graphic", "Government Accountability Office report graphic".

GRADUATION between Tuned and Reimagined on these axes:
- Tuned should differ MODERATELY: probably keep light background, similar palette family, conventional logo, similar typography but maybe shift to serif for a quieter feel.
- Reimagined should diverge CONFIDENTLY: dark or cream background, completely different palette register, possibly omit logo, possibly switch typography family entirely, commit to a strong style_register.

Rules:
- The prompt_override is the FULL prompt for the image model. It REPLACES the user's prompt entirely. Be specific: name the visual rhetoric, describe the page layout, name what goes in each region, describe how nodes/sections relate, name the dominant organizing metaphor.
- Keep ALL facts, acronyms, and named entities from the user's topic. You are reframing the visualization, not changing the subject. Every entity the user named must still appear; you may regroup or relocate them.
- Do not invent additional facts.
- Do not include typography, palette, color, density, or iconography instructions in prompt_override — those are passed separately via the structured fields above.
- Stay federal-grade. No stock-photo people, no faux-3D gears, no decorative slop, no playful imagery.
- Both variations must use a different visual_rhetoric than baseline AND each other.
- For each variation, pick the orientation that best fits the chosen visual_rhetoric (swimlanes → 11x17 Foldout or Landscape; vertical journey → Portrait; matrix → Landscape; concentric rings → Portrait; isometric / cutaway → Landscape; metro map → Foldout or Landscape).`;

function deriveHeuristicVariants(
  base: { flow: string; density: Density; iconography: string; accessibility: string; orientation: string },
  topic: string,
): VariantSettingsPair {
  // Cheap fallback if GPT-5 is unavailable: rotate enums + simple prompt reframes.
  const nextIn = (arr: string[], cur: string) => arr[(arr.indexOf(cur) + 1) % arr.length] || arr[0];
  const skipIn = (arr: string[], cur: string) => arr[(arr.indexOf(cur) + 2) % arr.length] || arr[0];
  return {
    tuned: {
      flow: nextIn(FLOW_VALUES, base.flow),
      density: base.density,
      iconography: base.iconography,
      accessibility: base.accessibility,
      orientation: nextIn(ORIENTATION_VALUES, base.orientation),
      palette: ['#0A2540', '#475569', '#FAF7F2', '#B6442B'],
      typography: 'sans' as Typography,
      logo_treatment: 'top-left' as LogoTreatment,
      background_mode: 'light' as BackgroundMode,
      mood: 'editorial' as Mood,
      style_register: 'McKinsey sector report',
      visual_rhetoric: 'maturity matrix',
      prompt_override: `Reinterpret the following subject as a maturity matrix (rows of capabilities × columns of maturity stages from Traditional through Optimal): "${topic}". Each cell contains one short capability phrase. The Optimal column should be visually emphasized.`,
      rationale: 'Heuristic fallback: matrix reframing.',
    },
    reimagined: {
      flow: skipIn(FLOW_VALUES, base.flow),
      density: nextIn(DENSITY_VALUES, base.density) as Density,
      iconography: nextIn(ICONOGRAPHY_VALUES, base.iconography),
      accessibility: nextIn(ACCESSIBILITY_VALUES, base.accessibility),
      orientation: skipIn(ORIENTATION_VALUES, base.orientation),
      palette: ['#0F1A2E', '#C9A24B', '#E8DDC8', '#7A2E2E'],
      typography: 'serif' as Typography,
      logo_treatment: 'footer-corner' as LogoTreatment,
      background_mode: 'dark' as BackgroundMode,
      mood: 'cinematic' as Mood,
      style_register: 'Economist editorial graphic',
      visual_rhetoric: 'hub-and-spoke ecosystem',
      prompt_override: `Reinterpret the following subject as a hub-and-spoke ecosystem diagram. A central labeled hub anchors the page; six to eight spokes radiate outward to satellite nodes, each labeled with one short phrase representing a capability or stakeholder. Subject: "${topic}".`,
      rationale: 'Heuristic fallback: hub-and-spoke reframing.',
    },
  };
}

export interface VariantSettingsInput {
  apiKey: string;
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
  const { apiKey, topic, base, referenceContext } = input;
  if (!apiKey || !topic.trim()) return deriveHeuristicVariants(base, topic);

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
    userParts.push(`REFERENCE CONTEXT (from user-uploaded source material — first 1500 chars):`);
    userParts.push(referenceContext.trim().slice(0, 1500));
  }
  userParts.push('');
  userParts.push('Produce the two alternate variation plans now, each with its own visual_rhetoric and full prompt_override.');

  try {
    console.log('[variant-settings] calling GPT-5 with reasoning_effort: high...');
    const t0 = Date.now();
    const raw = await callChat(apiKey, {
      model: GPT5_MODEL,
      messages: [
        { role: 'system', content: VARIANT_SETTINGS_SYSTEM },
        { role: 'user', content: userParts.join('\n') },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'variant_settings_pair',
          strict: true,
          schema: VARIANT_SETTINGS_SCHEMA,
        },
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

// Stable hash of a string for caching keys. Not crypto, just dedupe.
export async function hashString(s: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(s));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
