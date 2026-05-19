import type { VariantOverrides } from './variant-overrides';
import { fontDescriptor, backgroundClause, logoClause } from './variant-overrides';

export const generateInfographicImage = async (
  topic: string,
  apiKey: string,
  colors: string[], // Full array of extracted palette hexes
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
  contextText: string | null = null,
  overrides?: VariantOverrides
): Promise<string> => {

  const contextBlock = contextText && contextText.trim()
    ? `REFERENCE CONTEXT — the user attached the following source material to give you additional context for the subject. Use it to inform the infographic, but do not literally copy slides or paragraphs:\n\n${contextText.trim()}\n\n---\n\n`
    : '';

  // Apply per-variant overrides where present.
  const effectiveColors = overrides?.palette?.length ? overrides.palette : colors;
  const effectiveFontDesc = fontDescriptor(overrides?.typography ?? fontFamily);
  const includeLogo = !!logoUrl && overrides?.logoTreatment !== 'omit';
  const bgClause = backgroundClause(overrides?.backgroundMode, isTransparent);
  const moodLine = overrides?.mood ? `\n- Overall mood: ${overrides.mood}.` : '';
  const registerLine = overrides?.styleRegister ? `\n- Visual register: in the style of a ${overrides.styleRegister}.` : '';

  let densityDesc = "";
  if (density === 'minimal') {
    densityDesc = "Strictly minimalist design. Extremely sparse text. Heavy emphasis on white space, large icons, and minimal words.";
  } else if (density === 'detailed') {
    densityDesc = "Highly detailed layout. Comprehensive text blocks, dense analytical data, and sub-bullets thoroughly explaining each step.";
  } else {
    densityDesc = "Balanced standard layout. Clear headers with brief 1-2 sentence descriptions per node.";
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

  const requestParts: any[] = [{ text: prompt }];

  // If revising, pass the previous image into context
  if (imageToReviseBase64) {
    const [header, base64Data] = imageToReviseBase64.split(',');
    const mimeMatch = header.match(/:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    requestParts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data
      }
    });
  }

  // If a logo is provided AND treatment isn't 'omit', append it.
  if (includeLogo && logoUrl) {
    const logoInstruction = logoClause(overrides?.logoTreatment, true);
    prompt += logoInstruction;
    requestParts[0].text = prompt;

    const [header, base64Data] = logoUrl.split(',');
    const mimeMatch = header.match(/:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

    requestParts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data
      }
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: requestParts }],
        generationConfig: { temperature: 0.4 },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("Gemini Error:", response.status, errText);
    throw new Error(`Failed to fetch from Gemini Image Generation: ${response.status} ${errText}`);
  }

  const result = await response.json();
  const resultParts = result.candidates[0].content.parts;

  let base64Image = null;
  let mimeTypeOut = 'image/jpeg';

  for (const part of resultParts) {
    if (part.inlineData && part.inlineData.data) {
      base64Image = part.inlineData.data;
      mimeTypeOut = part.inlineData.mimeType || 'image/jpeg';
      break;
    }
  }

  if (!base64Image) {
    throw new Error("No image data returned from Nano Banana Pro Preview.");
  }

  return `data:${mimeTypeOut};base64,${base64Image}`;
};
