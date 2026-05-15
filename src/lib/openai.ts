import type { InfographicSpec } from './spec';
import { specToPromptBlock } from './spec';

// OpenAI's state-of-the-art image model (per developers.openai.com/api/docs/models/gpt-image-2).
// Swap to a timestamped snapshot like 'gpt-image-2-2026-04-21' if you need pinning.
const OPENAI_IMAGE_MODEL = 'gpt-image-2';

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header.match(/:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
};

// gpt-image-2 accepts flexible sizes (multiples of 16, long:short ratio ≤ 3:1,
// max edge ≤ 3840, total pixels 655,360-8,294,400). These match the actual page
// aspect ratios more closely than gpt-image-1's fixed set.
const orientationToSize = (orientation: string): string => {
  const o = orientation.toLowerCase();
  if (o.includes('11x17')) return '1024x1584';      // 11:17 foldout, portrait
  if (o.includes('landscape')) return '1328x1024';   // 11:8.5
  if (o.includes('portrait')) return '1024x1328';    // 8.5:11
  return '1024x1024';
};

export const generateInfographicImage = async (
  topic: string,
  apiKey: string,
  colors: string[],
  fontFamily: string,
  logoUrl: string | null = null,
  density: 'minimal' | 'standard' | 'detailed' = 'standard',
  flow: string = 'linear',
  orientation: string = '11x8.5 Landscape',
  accessibility: string = 'Standard',
  iconography: string = 'USWDS Default',
  isTransparent: boolean = false,
  imageToReviseBase64: string | null = null,
  revisionPrompt: string | null = null,
  infographicSpec: InfographicSpec | null = null
): Promise<string> => {

  const specBlock = infographicSpec ? specToPromptBlock(infographicSpec) : '';

  const fontDesc = fontFamily === 'font-serif' ? "Times New Roman (11pt/12pt)" :
    fontFamily === 'font-sans' ? "Arial (10pt/11pt)" :
      "Courier New (10pt)";

  let densityDesc = "";
  if (density === 'minimal') {
    densityDesc = "Strictly minimalist design. Extremely sparse text. Heavy emphasis on white space, large icons, and minimal words.";
  } else if (density === 'detailed') {
    densityDesc = "Highly detailed layout. Comprehensive text blocks, dense analytical data, and sub-bullets thoroughly explaining each step.";
  } else {
    densityDesc = "Balanced standard layout. Clear headers with brief 1-2 sentence descriptions per node.";
  }

  let prompt = `${specBlock}You are a visual data architect for government proposals.
Generate an infographic image for the following subject: "${topic}".

ABSOLUTE PROHIBITIONS (never include any of these):
- Stock-photo people or photographic faces
- Faux-3D gears, isometric cubes, or generic "AI tech" floating elements
- Clipart, emoji icons, or hand-drawn / sketch-look styling
- Rainbow gradients or neon glow effects
- Decorative shadows, bevels, or skeuomorphic textures

STRICT VISUAL REQUIREMENTS:
- Structure Flow: A highly formalized, ${flow} flow diagram or infographic.
- Layout Orientation: Ensure the composition tightly fits a standard ${orientation} format document bounds.
- Information Density: ${densityDesc}
- Typography: Must strictly use the typography family "${fontDesc}".
- Color Scheme: Must strictly utilize this exact palette of hex codes: ${colors.join(', ')}. Use the first hex as the primary dominant color and subsequent hexes for diverse visual data scaling (icons, timelines, borders). Do not invent colors outside this palette. Use pure white or black only for legibility against colored backgrounds.
- Background Transparency: ${isTransparent ? 'CRITICAL: The background MUST be completely transparent (Alpha 0). Do not include any solid background block or fill.' : 'Ensure a solid professional background color.'}
- Accessibility & Contrast: ${accessibility}.
- Iconography Style: ${iconography} style elements ONLY. Must remain completely professional and non-cartoony.

${revisionPrompt && imageToReviseBase64 ? `\nCRITICAL REVISION INSTRUCTION:\nThe user has requested an explicit revision to the attached current rendering. REVISION REQUEST: "${revisionPrompt}". You MUST output a new high-fidelity image that strictly incorporates this revision while perfectly maintaining the previously established structural compliance, typography, and palette restrictions.` : ''}

${logoUrl ? `\nCRITICAL: One of the attached images is the organization's logo. You MUST insert this exact logo prominently into the top left corner of the generated infographic.` : ''}

Output ONLY the high-fidelity image composition. No surrounding text.`;

  const size = orientationToSize(orientation);
  const hasInputImage = !!(imageToReviseBase64 || logoUrl);

  if (hasInputImage) {
    // Image edit: accepts reference images (prior render and/or logo)
    const form = new FormData();
    form.append('model', OPENAI_IMAGE_MODEL);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('n', '1');
    if (isTransparent) {
      form.append('background', 'transparent');
    }

    if (imageToReviseBase64) {
      form.append('image[]', dataUrlToBlob(imageToReviseBase64), 'prior-render.png');
    }
    if (logoUrl) {
      form.append('image[]', dataUrlToBlob(logoUrl), 'logo.png');
    }

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI Error:", response.status, errText);
      throw new Error(`Failed to fetch from OpenAI Image Edits: ${response.status} ${errText}`);
    }

    const result = await response.json();
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("No image data returned from OpenAI image edit.");
    }
    return `data:image/png;base64,${b64}`;
  }

  // Pure text-to-image
  const body: Record<string, unknown> = {
    model: OPENAI_IMAGE_MODEL,
    prompt,
    n: 1,
    size,
  };
  if (isTransparent) {
    body.background = 'transparent';
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("OpenAI Error:", response.status, errText);
    throw new Error(`Failed to fetch from OpenAI Image Generations: ${response.status} ${errText}`);
  }

  const result = await response.json();
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("No image data returned from OpenAI image generation.");
  }
  return `data:image/png;base64,${b64}`;
};
