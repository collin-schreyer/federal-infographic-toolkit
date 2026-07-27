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

export type LogoPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right';

// Resolve where the logo goes for a given render. The AI variant plan can
// force bottom-right (its "footer-corner" editorial register) or omit the
// logo entirely; otherwise the user's chosen position wins.
export const resolveLogoPosition = (
  treatment: LogoTreatment | undefined,
  userPosition: string | null | undefined,
): LogoPosition | null => {
  if (treatment === 'omit') return null;
  if (treatment === 'footer-corner') return 'bottom-right';
  const p = (userPosition || 'top-left') as LogoPosition;
  return (['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-right'] as string[]).includes(p)
    ? p
    : 'top-left';
};

// The logo is attached to the model as a reference image with a STRICT
// reproduction contract: identical mark, no boxes/frames/outlines around it,
// color re-tint is the only permitted adaptation. (The earlier "reserve an
// empty rectangle" approach made models literally draw outlined boxes.)
export const logoClause = (position: LogoPosition): string => {
  const posText = position.replace('-', ' ');
  return `\n\nLOGO — STRICT REQUIREMENTS:
- One of the attached images is the organization's official logo. Place this exact logo in the ${posText} area of the composition.
- Reproduce the logo mark and any letterforms EXACTLY as provided: identical shapes, proportions, spacing, and details. Do not redesign, simplify, distort, or restyle it in any way.
- Do NOT draw any box, outline, frame, border, placeholder, panel, or background shape around or behind the logo. Absolutely no rectangular container of any kind — the logo sits directly on clean, open background space with a comfortable margin around it.
- The ONLY permitted adaptation is color: you may re-tint the logo (for example to the primary palette color, or to white for contrast on a dark background) so it harmonizes with the design — while keeping every shape identical to the reference.`;
};
