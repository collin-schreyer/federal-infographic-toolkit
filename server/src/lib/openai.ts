import type { VariantOverrides } from './variant-overrides.js';
import { fontDescriptor, backgroundClause, logoClause } from './variant-overrides.js';

const OPENAI_IMAGE_MODEL = 'gpt-image-2';

// Hard cap on any single image-generation call. gpt-image-2 normally finishes
// in 10-45s but dense reimaginings at large sizes can legitimately push past
// 90s. 150s gives slow-but-valid renders room to finish while still failing
// cleanly on a true upstream hang.
const IMAGE_TIMEOUT_MS = 150_000;

const fetchWithTimeout = async (url: string, init: RequestInit, ms: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header.match(/:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = Buffer.from(base64Data, 'base64');
  return new Blob([binary], { type: mimeType });
};

// All sizes must satisfy gpt-image-2 constraints: multiples of 16, long:short
// ratio ≤ 3:1, total pixels in [655,360, 8,294,400]. The "Inline" family is
// for small in-document graphics; the "Full Page" family is for primary
// proposal figures.
const orientationToSize = (orientation: string): string => {
  const o = orientation.toLowerCase();
  // Small / inline graphics
  if (o.includes('inline banner')) return '1280x528';      // ~2.42:1 — wide & short
  if (o.includes('inline square')) return '1024x1024';     // 1:1 — concept icon
  if (o.includes('inline tall')) return '800x1248';        // ~1:1.56 — column callout
  if (o.includes('process strip')) return '1504x512';      // ~2.94:1 — section divider
  // Full-page graphics
  if (o.includes('11x17')) return '1024x1584';
  if (o.includes('landscape')) return '1328x1024';
  if (o.includes('portrait')) return '1024x1328';
  return '1024x1024';
};

export interface OpenAIRenderInput {
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
  overrides?: VariantOverrides;
}

export async function generateInfographicImage(input: OpenAIRenderInput): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set on server.');

  const {
    topic, colors, fontFamily, logoUrl, density, flow, orientation,
    accessibility, iconography, isTransparent, imageToReviseBase64,
    revisionPrompt, contextText, overrides,
  } = input;

  const contextBlock = contextText && contextText.trim()
    ? `REFERENCE CONTEXT — the user attached the following source material to give you additional context for the subject. Use it to inform the infographic, but do not literally copy slides or paragraphs:\n\n${contextText.trim()}\n\n---\n\n`
    : '';

  const effectiveColors = overrides?.palette?.length ? overrides.palette : colors;
  const effectiveFontDesc = fontDescriptor(overrides?.typography ?? fontFamily);
  const includeLogo = !!logoUrl && overrides?.logoTreatment !== 'omit';
  const bgClause = backgroundClause(overrides?.backgroundMode, isTransparent);
  const moodLine = overrides?.mood ? `\n- Overall mood: ${overrides.mood}.` : '';
  const registerLine = overrides?.styleRegister ? `\n- Visual register: in the style of a ${overrides.styleRegister}.` : '';

  let densityDesc = '';
  if (density === 'minimal') {
    densityDesc = 'EXTREMELY minimalist. 2–5 large icons with single-word or 2-word labels. Heavy white space. NO paragraphs, NO bullet lists, NO descriptive sentences — labels only. Optimized for at-a-glance comprehension in under 2 seconds. Each node carries one short label and nothing more.';
  } else if (density === 'detailed') {
    densityDesc = 'Highly detailed layout. Comprehensive text blocks, dense analytical data, and sub-bullets thoroughly explaining each step.';
  } else {
    densityDesc = 'Balanced standard layout. Clear headers with brief 1-2 sentence descriptions per node.';
  }

  const requirementsBlock = overrides?.loose ? `
GUIDELINES (the prompt above is the primary direction — follow it; the items below are guardrails):
- Federal-grade, serious, professional. No whimsy, cartoons, or playful imagery.
- Color palette to draw from: ${effectiveColors.join(', ')}. Use freely as primary, accent, and support.
- Typography: ${effectiveFontDesc}.
- Information Density: ${densityDesc}
- ${bgClause}
- Accessibility & Contrast: ${accessibility}.
- Iconography Style: ${iconography} style elements only.${moodLine}${registerLine}
` : `
STRICT VISUAL REQUIREMENTS:
- Structure Flow: A highly formalized, ${flow} flow diagram or infographic.
- Layout Orientation: Ensure the composition tightly fits a standard ${orientation} format document bounds.
- Information Density: ${densityDesc}
- Typography: Must strictly use the typography family "${effectiveFontDesc}".
- Color Scheme: Must strictly utilize this exact palette of hex codes: ${effectiveColors.join(', ')}. Use the first hex as the primary dominant color and subsequent hexes for diverse visual data scaling (icons, timelines, borders). Do not invent colors outside this palette. Use pure white or black only for legibility against colored backgrounds.
- Background: ${bgClause}
- Accessibility & Contrast: ${accessibility}.
- Iconography Style: ${iconography} style elements ONLY. Must remain completely professional and non-cartoony.${moodLine}${registerLine}
`;

  let prompt = `${contextBlock}You are a visual data architect for government proposals.
Generate an infographic image for the following subject: "${topic}".

ABSOLUTE PROHIBITIONS (never include any of these):
- Stock-photo people or photographic faces
- Faux-3D gears, isometric cubes, or generic "AI tech" floating elements
- Clipart, emoji icons, or hand-drawn / sketch-look styling
- Rainbow gradients or neon glow effects
- Decorative shadows, bevels, or skeuomorphic textures
${requirementsBlock}
${revisionPrompt && imageToReviseBase64 ? `\nCRITICAL REVISION INSTRUCTION:\nThe user has requested an explicit revision to the attached current rendering. REVISION REQUEST: "${revisionPrompt}". You MUST output a new high-fidelity image that strictly incorporates this revision while perfectly maintaining the previously established structural compliance, typography, and palette restrictions.` : ''}
${includeLogo ? logoClause(overrides?.logoTreatment, true) : ''}
Output ONLY the high-fidelity image composition. No surrounding text.`;

  const size = orientationToSize(orientation);
  const hasInputImage = !!(imageToReviseBase64 || (includeLogo && logoUrl));

  if (hasInputImage) {
    const form = new FormData();
    form.append('model', OPENAI_IMAGE_MODEL);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('n', '1');
    if (isTransparent) form.append('background', 'transparent');

    if (imageToReviseBase64) {
      form.append('image[]', dataUrlToBlob(imageToReviseBase64), 'prior-render.png');
    }
    if (includeLogo && logoUrl) {
      form.append('image[]', dataUrlToBlob(logoUrl), 'logo.png');
    }

    let response: Response;
    try {
      response = await fetchWithTimeout('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      }, IMAGE_TIMEOUT_MS);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error(`OpenAI image edit timed out after ${IMAGE_TIMEOUT_MS / 1000}s. The upstream model is stuck; please re-run.`);
      }
      throw e;
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI image edit failed: ${response.status} ${errText.slice(0, 400)}`);
    }
    const result = await response.json();
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error('No image data returned from OpenAI image edit.');
    return `data:image/png;base64,${b64}`;
  }

  const body: Record<string, unknown> = { model: OPENAI_IMAGE_MODEL, prompt, n: 1, size };
  if (isTransparent) body.background = 'transparent';

  let response: Response;
  try {
    response = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }, IMAGE_TIMEOUT_MS);
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`OpenAI image generation timed out after ${IMAGE_TIMEOUT_MS / 1000}s. The upstream model is stuck; please re-run.`);
    }
    throw e;
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI image generate failed: ${response.status} ${errText.slice(0, 400)}`);
  }
  const result = await response.json();
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data returned from OpenAI image generation.');
  return `data:image/png;base64,${b64}`;
}
