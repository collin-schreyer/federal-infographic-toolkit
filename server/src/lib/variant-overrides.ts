// Mirror of src/lib/variant-overrides.ts. Server-side copy so the engine modules
// here don't reach across the project boundary. Frontend keeps its copy too; we
// duplicate types deliberately to avoid setting up a shared package.

export type Typography = 'serif' | 'sans' | 'mono';
export type LogoTreatment = 'top-left' | 'footer-corner' | 'omit';
export type BackgroundMode = 'light' | 'dark' | 'cream';

export interface VariantOverrides {
  palette?: string[];
  typography?: Typography;
  logoTreatment?: LogoTreatment;
  backgroundMode?: BackgroundMode;
  mood?: string;
  styleRegister?: string;
  loose?: boolean;
}

// Legacy tokens ('font-serif', or the GPT-5 plan's 'serif'/'sans'/'mono')
// map to canonical families; anything else is a full font description from
// the expanded typography picker (e.g. "Calibri · 11pt body text, 14–16pt
// headers") and passes straight through to the prompt.
export const fontDescriptor = (token: string): string => {
  const t = token.replace(/^font-/, '');
  if (t === 'serif') return 'Times New Roman (11pt/12pt)';
  if (t === 'sans') return 'Arial (10pt/11pt)';
  if (t === 'mono') return 'Courier New (10pt)';
  return token;
};

export const backgroundClause = (mode: BackgroundMode | undefined, isTransparent: boolean): string => {
  if (isTransparent) {
    return 'CRITICAL: The background MUST be completely transparent (Alpha 0). Do not include any solid background block or fill.';
  }
  if (mode === 'dark') {
    return 'Use a deep navy or charcoal full-bleed background with light typography for an executive-report cinematic register.';
  }
  if (mode === 'cream') {
    return 'Use a warm off-white / ivory cream background for an editorial register.';
  }
  return 'Ensure a solid professional light background color.';
};

// The logo itself is no longer sent to the image models — models redraw
// reference images, which warps logo detail. Instead the model reserves a
// clean corner and the server composites the user's actual logo file onto
// the finished render (see composite.ts). Pixel-perfect by construction.
export const logoClause = (
  treatment: LogoTreatment | undefined,
  hasLogo: boolean,
): string => {
  if (!hasLogo) return '';
  if (treatment === 'omit') return '';
  if (treatment === 'footer-corner') {
    return `\n\nLOGO SPACE: Reserve a clean, completely empty rectangular area in the BOTTOM-RIGHT corner of the composition (roughly 18% of the canvas width and 12% of its height, with a comfortable margin from the edges). Do not place any text, icons, borders, or graphics in that area — the organization's official logo will be placed there after rendering.`;
  }
  return `\n\nLOGO SPACE: Reserve a clean, completely empty rectangular area in the TOP-LEFT corner of the composition (roughly 18% of the canvas width and 12% of its height, with a comfortable margin from the edges). Do not place any text, icons, borders, or graphics in that area — the organization's official logo will be placed there after rendering.`;
};
