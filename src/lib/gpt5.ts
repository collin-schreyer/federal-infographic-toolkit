// Thin client-side wrappers; all GPT-5 calls happen server-side.
import { api } from './api';

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
  palette: string[];
  typography: Typography;
  logo_treatment: LogoTreatment;
  background_mode: BackgroundMode;
  mood: Mood;
  style_register: string;
  prompt_override: string;
  visual_rhetoric: string;
  rationale: string;
}

export interface SummarizeInput {
  apiKey: string; // ignored; kept for signature parity
  referenceText?: string;
  referenceImages?: string[];
}

export async function summarizeReference(input: SummarizeInput): Promise<string> {
  const { summary } = await api.post<{ summary: string }>('/api/summarize', {
    referenceText: input.referenceText,
    referenceImages: input.referenceImages,
  });
  return summary;
}

export interface SuggestPromptInput {
  apiKey: string; // ignored
  imageDataUrl: string;
}

export async function suggestPromptFromImage(input: SuggestPromptInput): Promise<string> {
  const { prompt } = await api.post<{ prompt: string }>('/api/suggest-prompt', {
    imageDataUrl: input.imageDataUrl,
  });
  return prompt;
}

export interface VariantSettingsInput {
  apiKey: string; // ignored
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

export async function getVariantSettings(input: VariantSettingsInput): Promise<{ tuned: VariantSettings; reimagined: VariantSettings }> {
  const { pair } = await api.post<{ pair: { tuned: VariantSettings; reimagined: VariantSettings } }>('/api/plan', {
    topic: input.topic,
    base: input.base,
    referenceContext: input.referenceContext,
  });
  return pair;
}

export async function hashString(s: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(s));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
