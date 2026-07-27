import type { VariantOverrides } from './variant-overrides.js';
import { fontDescriptor, backgroundClause, logoClause, resolveLogoPosition } from './variant-overrides.js';

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

export interface GeminiRenderInput {
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
  // The user-selected slide graphic (from a PPTX upload) used as the visual
  // starting point for the render.
  referenceImageBase64?: string | null;
  logoPosition?: string | null;
  overrides?: VariantOverrides;
}

export async function generateInfographicImage(input: GeminiRenderInput): Promise<string> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY not set on server.');

  const {
    topic, colors, fontFamily, logoUrl, density, flow, orientation,
    accessibility, iconography, isTransparent, imageToReviseBase64,
    revisionPrompt, contextText, referenceImageBase64, logoPosition, overrides,
  } = input;

  const contextBlock = contextText && contextText.trim()
    ? `REFERENCE CONTEXT — the user attached the following source material to give you additional context for the subject. Use it to inform the infographic, but do not literally copy slides or paragraphs:\n\n${contextText.trim()}\n\n---\n\n`
    : '';

  const effectiveColors = overrides?.palette?.length ? overrides.palette : colors;
  const effectiveFontDesc = fontDescriptor(overrides?.typography ?? fontFamily);
  const resolvedLogoPosition = resolveLogoPosition(overrides?.logoTreatment, logoPosition);
  const includeLogo = !!logoUrl && resolvedLogoPosition !== null;
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

Do NOT generate any text explanation. ONLY output the high-fidelity image composition.`;

  // Slide reference: attach the user's selected slide graphic as the visual
  // starting point. The logo (when present) is also attached, governed by the
  // strict reproduction contract in logoClause.
  if (referenceImageBase64) {
    prompt += `\n\nREFERENCE GRAPHIC: The attached image is an existing slide graphic the user selected as the visual starting point. Treat it as the base composition — preserve its core structure, content, and intent — and apply the subject instructions above as the changes to make. Re-set it cleanly in the requested style (palette, typography, iconography); evolve it, do not copy it pixel-for-pixel.`;
  }
  if (includeLogo && resolvedLogoPosition) {
    prompt += logoClause(resolvedLogoPosition);
  }

  const requestParts: any[] = [{ text: prompt }];

  if (imageToReviseBase64) {
    const [header, base64Data] = imageToReviseBase64.split(',');
    const mimeMatch = header.match(/:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    requestParts.push({ inlineData: { mimeType, data: base64Data } });
  }

  if (referenceImageBase64) {
    const [header, base64Data] = referenceImageBase64.split(',');
    const mimeMatch = header.match(/:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    requestParts.push({ inlineData: { mimeType, data: base64Data } });
  }

  if (includeLogo && logoUrl) {
    const [header, base64Data] = logoUrl.split(',');
    const mimeMatch = header.match(/:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    requestParts.push({ inlineData: { mimeType, data: base64Data } });
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: requestParts }], generationConfig: { temperature: 0.4 } }),
      },
      IMAGE_TIMEOUT_MS,
    );
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`Gemini image generation timed out after ${IMAGE_TIMEOUT_MS / 1000}s. Please re-run.`);
    }
    throw e;
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini image gen failed: ${response.status} ${errText.slice(0, 400)}`);
  }

  const result = await response.json();
  const resultParts = result.candidates?.[0]?.content?.parts || [];
  for (const part of resultParts) {
    if (part.inlineData?.data) {
      const mimeTypeOut = part.inlineData.mimeType || 'image/jpeg';
      return `data:${mimeTypeOut};base64,${part.inlineData.data}`;
    }
  }
  throw new Error('No image data returned from Gemini.');
}
