// Optional per-variant overrides that the image-generation engines accept.
// When present (Tuned and Reimagined slots), these replace the user's panel
// defaults for palette, typography, logo placement, background mode, mood,
// and stylistic register. Reimagined also gets `loose: true` which swaps
// the strict requirements block for lighter guardrails so the AI's
// prompt_override can actually drive the output.

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

// Helper: map a typography token to the descriptive font phrase the image
// model expects. Accepts either bare ('serif') or the panel's class-style
// value ('font-serif') so engines can use it for both the user's selection
// and a variant override.
export const fontDescriptor = (token: string): string => {
  const t = token.replace(/^font-/, '');
  if (t === 'serif') return 'Times New Roman (11pt/12pt)';
  if (t === 'sans') return 'Arial (10pt/11pt)';
  return 'Courier New (10pt)';
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

export const logoClause = (
  treatment: LogoTreatment | undefined,
  hasLogo: boolean,
): string => {
  if (!hasLogo) return '';
  if (treatment === 'omit') return ''; // logo not included in payload either
  if (treatment === 'footer-corner') {
    return `\n\nCRITICAL: One of the attached images is the organization's logo. Place it discreetly in the bottom-right footer corner of the composition. Keep it small and unobtrusive.`;
  }
  return `\n\nCRITICAL: One of the attached images is the organization's logo. You MUST insert this exact logo prominently into the top left corner of the generated infographic.`;
};
