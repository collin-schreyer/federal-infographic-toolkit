// Thin client-side wrapper: actual OpenAI call happens on the server so the
// API key never leaves the backend. Same signature as before so App.tsx
// doesn't need to change how it calls this function.
import type { VariantOverrides } from './variant-overrides';
import { api } from './api';

interface RenderResponse {
  id: string;
  dataUrl: string;
  createdAt: number;
}

export const generateInfographicImage = async (
  topic: string,
  _apiKey: string, // ignored; server reads from env. Kept for signature parity.
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
  contextText: string | null = null,
  overrides?: VariantOverrides,
  meta?: { variation?: 'baseline' | 'tuned' | 'reimagined'; visualRhetoric?: string; sourceName?: string; referenceImageBase64?: string | null; projectId?: string | null; logoPosition?: string | null },
  signal?: AbortSignal,
): Promise<string> => {
  const { dataUrl } = await api.post<RenderResponse>('/api/render', {
    engine: 'openai',
    topic,
    colors,
    fontFamily,
    logoUrl,
    density,
    flow,
    orientation,
    accessibility,
    iconography,
    isTransparent,
    imageToReviseBase64,
    revisionPrompt,
    contextText,
    overrides,
    variation: meta?.variation,
    visualRhetoric: meta?.visualRhetoric,
    sourceName: meta?.sourceName,
    referenceImageBase64: meta?.referenceImageBase64 ?? null,
    project_id: meta?.projectId ?? null,
    logoPosition: meta?.logoPosition ?? null,
  }, signal);
  return dataUrl;
};
