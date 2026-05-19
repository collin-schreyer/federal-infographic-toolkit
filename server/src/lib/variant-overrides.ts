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
  if (treatment === 'omit') return '';
  if (treatment === 'footer-corner') {
    return `\n\nCRITICAL: One of the attached images is the organization's logo. Place it discreetly in the bottom-right footer corner of the composition. Keep it small and unobtrusive.`;
  }
  return `\n\nCRITICAL: One of the attached images is the organization's logo. You MUST insert this exact logo prominently into the top left corner of the generated infographic.`;
};
