import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateInfographicImage as generateGeminiImage } from './lib/gemini';
import { generateInfographicImage as generateOpenAIImage } from './lib/openai';
import { parsePptx } from './lib/parse-pptx';
import { summarizeReference, suggestPromptFromImage, getVariantSettings } from './lib/gpt5';
import type { VariantSettings as GptVariantSettings } from './lib/gpt5';
import type { VariantOverrides } from './lib/variant-overrides';
import {
  PaperPlaneTilt,
  CircleNotch,
  UploadSimple,
  Article,
  Palette,
  TextAa,
  ImageIcon,
  Image as PhosphorImage,
  Trash,
  Faders,
  FrameCorners,
  Eye,
  Shapes,
  CaretLeft,
  CaretDown,
  Cpu,
  WarningCircle,
  FilePpt,
  TextT,
  Sparkle,
  ArrowDown,
} from '@phosphor-icons/react';

import Landing from './Landing';

const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY || "";
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";

type Engine = 'openai' | 'gemini';
type GenerationMode = Engine | 'both';
type Variation = 'baseline' | 'tuned' | 'reimagined';

interface SlotSettings {
  flow: string;
  density: 'minimal' | 'standard' | 'detailed';
  iconography: string;
  accessibility: string;
  orientation: string;
}

type SlotStatus = 'planning' | 'rendering' | 'done' | 'error';

interface VariantSlot {
  engine: Engine;
  variation: Variation;
  settings: SlotSettings;
  topicOverride?: string;     // for Tuned/Reimagined: the fully rewritten prompt
  visualRhetoric?: string;    // e.g., "maturity matrix", "hub-and-spoke"
  rationale?: string;         // why GPT-5 picked this approach
  overrides?: VariantOverrides; // creative unlocks: palette, typography, logo, bg, mood, register, loose
  status: SlotStatus;
  url?: string;
  error?: string;
}

const engineLabel = (e: Engine) => e === 'openai' ? 'GPT-Image' : 'Nano Banana';
const engineShort = (e: Engine) => e === 'openai' ? 'GPT' : 'GEM';
const variationLabel = (v: Variation) => v === 'baseline' ? 'Baseline' : v === 'tuned' ? 'Tuned' : 'Reimagined';

// Short, human-readable summary of what differs from a base settings bundle.
const settingsDelta = (base: SlotSettings, s: SlotSettings): string => {
  const diffs: string[] = [];
  const shortFlow = (f: string) => f.replace(' Phase Model', '').replace(' Network', '').replace('Abstract Quadrant ', '');
  const shortIco = (i: string) => i.replace(' Icons', '').replace(' Lineart Elements', '').replace('Solid ', '');
  const shortAcc = (a: string) => a.includes('High') ? 'High Contrast' : 'Flat USWDS';
  const shortOri = (o: string) => o.includes('Landscape') ? 'Landscape' : o.includes('Portrait') ? 'Portrait' : 'Foldout';
  if (s.flow !== base.flow) diffs.push(shortFlow(s.flow));
  if (s.density !== base.density) diffs.push(s.density);
  if (s.iconography !== base.iconography) diffs.push(shortIco(s.iconography));
  if (s.accessibility !== base.accessibility) diffs.push(shortAcc(s.accessibility));
  if (s.orientation !== base.orientation) diffs.push(shortOri(s.orientation));
  return diffs.join(' · ');
};

// Lightweight collapsible drawer used in the customization panel.
const Drawer: React.FC<{ title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, icon, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-zinc-50 transition-colors"
      >
        <span className="text-[11px] font-bold text-zinc-900 tracking-widest uppercase flex items-center gap-2.5">
          {icon}
          {title}
        </span>
        <CaretDown weight="bold" className={`w-3 h-3 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 pt-3 flex flex-col gap-6 border-t border-zinc-100">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [topic, setTopic] = useState('');
  const [slots, setSlots] = useState<VariantSlot[]>([]);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number>(0);
  const [error, setError] = useState('');
  const [isRevising, setIsRevising] = useState<boolean>(false);
  const [revisionPrompt, setRevisionPrompt] = useState<string>('');
  const [isReviseLoading, setIsReviseLoading] = useState<boolean>(false);


  // Customization state
  const [primaryColor, setPrimaryColor] = useState('#09090b');
  const [accentColor, setAccentColor] = useState('#71717a');
  const [selectedFont, setSelectedFont] = useState('font-serif');
  const [extractedPalette, setExtractedPalette] = useState<string[]>([]);
  const [headerLogo, setHeaderLogo] = useState<string | null>(null);
  const [density, setDensity] = useState<'minimal' | 'standard' | 'detailed'>('standard');
  const [flow, setFlow] = useState('Linear Phase Model');
  const [orientation, setOrientation] = useState('11x8.5 Landscape');
  const [accessibility, setAccessibility] = useState('High Contrast Legibility Mode');
  const [iconography, setIconography] = useState('USWDS Standard Icons');
  const [isTransparent, setIsTransparent] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('both');

  // Reference Material: source text + a short GPT-5 summary the user can see.
  type SourceKind = 'pptx' | 'text';
  const [sourceKind, setSourceKind] = useState<SourceKind>('pptx');
  const [sourceText, setSourceText] = useState<string>('');
  const [sourceName, setSourceName] = useState<string>('');
  const [sourceMeta, setSourceMeta] = useState<string>('');
  const [sourceParseLoading, setSourceParseLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [contextSummary, setContextSummary] = useState<string>('');
  const [contextSummaryLoading, setContextSummaryLoading] = useState(false);

  // Style Reference: upload an existing graphic, get a suggested Proposal Subject.
  const [styleRefDataUrl, setStyleRefDataUrl] = useState<string | null>(null);
  const [styleRefName, setStyleRefName] = useState<string>('');
  const [styleSuggestion, setStyleSuggestion] = useState<string>('');
  const [styleSuggestionLoading, setStyleSuggestionLoading] = useState(false);
  const [styleSuggestionError, setStyleSuggestionError] = useState('');

  const colorFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);
  const styleRefInputRef = useRef<HTMLInputElement>(null);

  // Derived state
  const isGenerating = slots.some(s => s.status === 'rendering' || s.status === 'planning');
  const isPlanningAny = slots.some(s => s.status === 'planning');
  const doneCount = slots.filter(s => s.status === 'done').length;
  const errorCount = slots.filter(s => s.status === 'error').length;
  const selectedSlot = slots[selectedSlotIndex];

  // Auto-select first done slot if currently-selected slot isn't done yet.
  useEffect(() => {
    if (slots.length === 0) return;
    const sel = slots[selectedSlotIndex];
    if (!sel || sel.status === 'done') return;
    const firstDone = slots.findIndex(s => s.status === 'done');
    if (firstDone !== -1) setSelectedSlotIndex(firstDone);
  }, [slots, selectedSlotIndex]);

  const fonts = [
    { label: 'Times New Roman (11pt/12pt)', value: 'font-serif' },
    { label: 'Arial (10pt/11pt)', value: 'font-sans' },
    { label: 'Courier New (10pt)', value: 'font-mono' },
  ];

  const densities = [
    { label: 'Minimal', value: 'minimal', desc: 'Sparse text, big icons' },
    { label: 'Standard', value: 'standard', desc: 'Balanced description' },
    { label: 'Detailed', value: 'detailed', desc: 'Dense analytics' },
  ];

  const flows = [
    { label: 'Linear Phase', value: 'Linear Phase Model', desc: 'Sequential format.' },
    { label: 'Hierarchical', value: 'Hierarchical Network', desc: 'Top-down organization.' },
    { label: 'Abstract Matrix', value: 'Abstract Quadrant Matrix', desc: 'Relational data grids.' },
  ];

  const orientations = [
    { label: '11x8.5 Landscape', value: '11x8.5 Landscape', desc: 'Wide page' },
    { label: '8.5x11 Portrait', value: '8.5x11 Portrait', desc: 'Tall page' },
    { label: '11x17 Foldout', value: '11x17 Foldout', desc: 'Tabloid spread' },
  ];

  const accessibilities = [
    { label: 'High Contrast', value: 'High Contrast Legibility Mode', desc: 'Max readability' },
    { label: 'Flat USWDS', value: 'Flat USWDS CSS Variables', desc: 'Strict colors No Gradients' },
  ];

  const iconographies = [
    { label: 'USWDS Standard', value: 'USWDS Standard Icons' },
    { label: 'Wireframe', value: 'Wireframe Lineart Elements' },
    { label: 'Monochrome', value: 'Solid Monochrome' },
  ];

  const extractDominantColors = (imgEl: HTMLImageElement, count: number): string[] => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const maxW = 100;
    const scale = Math.min(maxW / imgEl.width, maxW / imgEl.height, 1);
    canvas.width = imgEl.width * scale;
    canvas.height = imgEl.height * scale;

    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    const buckets: Record<string, { r: number, g: number, b: number, count: number }> = {};
    const BIN_SIZE = 32;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 125) continue;
      if (r > 240 && g > 240 && b > 240) continue;

      const rB = Math.round(r / BIN_SIZE) * BIN_SIZE;
      const gB = Math.round(g / BIN_SIZE) * BIN_SIZE;
      const bB = Math.round(b / BIN_SIZE) * BIN_SIZE;
      const key = `${rB},${gB},${bB}`;

      if (!buckets[key]) {
        buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
      }
      buckets[key].r += r;
      buckets[key].g += g;
      buckets[key].b += b;
      buckets[key].count++;
    }

    return Object.values(buckets)
      .sort((a, b) => b.count - a.count)
      .slice(0, count)
      .map(bucket => {
        const avgR = Math.round(bucket.r / bucket.count);
        const avgG = Math.round(bucket.g / bucket.count);
        const avgB = Math.round(bucket.b / bucket.count);
        const toHex = (n: number) => n.toString(16).padStart(2, '0');
        return `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;
      });
  };

  const handleColorImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imgUrl = event.target?.result as string;
      const img = document.createElement('img');
      img.src = imgUrl;
      img.onload = () => {
        try {
          const hexes = extractDominantColors(img, 5);
          if (hexes && hexes.length >= 1) {
            setExtractedPalette(hexes);
            setPrimaryColor(hexes[0]);
            if (hexes.length > 1) {
              setAccentColor(hexes[1]);
            }
          }
        } catch (err) {
          console.error("Color extraction failed:", err);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  // Kick off a short GPT-5 summary so the user can see what was captured.
  // Fires automatically after a successful parse/paste.
  const runContextSummary = async (text: string, images: string[]) => {
    if (!OPENAI_API_KEY) return;
    if (!text.trim() && images.length === 0) return;
    setContextSummary('');
    setContextSummaryLoading(true);
    try {
      const summary = await summarizeReference({
        apiKey: OPENAI_API_KEY,
        referenceText: text.trim() || undefined,
        referenceImages: images.length > 0 ? images : undefined,
      });
      setContextSummary(summary);
    } catch (err: any) {
      console.warn('[summary] failed:', err);
      // Non-blocking: summary is nice-to-have, don't surface as a hard error.
    } finally {
      setContextSummaryLoading(false);
    }
  };

  const handleSourceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log('[upload] File selected:', { name: file.name, size: file.size, type: file.type });

    setSourceError('');
    setSourceParseLoading(true);
    setContextSummary('');

    try {
      const parsed = await parsePptx(file);
      console.log('[upload] Parsed successfully:', { slides: parsed.slideCount, chars: parsed.totalText.length, images: parsed.images.length, tokens: parsed.estimatedTokens, truncated: parsed.truncated });
      setSourceText(parsed.totalText);
      setSourceName(file.name);
      const parts = [`${parsed.slideCount} slide${parsed.slideCount === 1 ? '' : 's'}`];
      if (parsed.images.length > 0) parts.push(`${parsed.images.length} image${parsed.images.length === 1 ? '' : 's'}`);
      parts.push(`~${parsed.estimatedTokens.toLocaleString()} text tokens`);
      if (parsed.truncated) parts.push('truncated');
      setSourceMeta(parts.join(' · '));
      runContextSummary(parsed.totalText, parsed.images.map(i => i.dataUrl));
    } catch (err: any) {
      console.error('[upload] Parse failed:', err);
      setSourceError(err?.message || 'Failed to parse the file.');
      setSourceText('');
      setSourceName('');
      setSourceMeta('');
    } finally {
      setSourceParseLoading(false);
      if (sourceFileInputRef.current) sourceFileInputRef.current.value = '';
    }
  };

  const handlePastedTextApply = () => {
    if (!pastedText.trim()) return;
    setSourceError('');
    setSourceText(pastedText.trim());
    setSourceName('Pasted text');
    const tokens = Math.ceil(pastedText.length / 4);
    setSourceMeta(`~${tokens.toLocaleString()} tokens`);
    runContextSummary(pastedText.trim(), []);
  };

  const clearSource = () => {
    setSourceText('');
    setSourceName('');
    setSourceMeta('');
    setSourceError('');
    setPastedText('');
    setContextSummary('');
  };

  // Style Reference handlers
  const handleStyleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStyleSuggestionError('');
    setStyleSuggestion('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setStyleRefDataUrl(dataUrl);
      setStyleRefName(file.name);
    };
    reader.onerror = () => setStyleSuggestionError('Failed to read image.');
    reader.readAsDataURL(file);
    if (styleRefInputRef.current) styleRefInputRef.current.value = '';
  };

  const clearStyleRef = () => {
    setStyleRefDataUrl(null);
    setStyleRefName('');
    setStyleSuggestion('');
    setStyleSuggestionError('');
  };

  const handleSuggestPrompt = async () => {
    if (!styleRefDataUrl) return;
    if (!OPENAI_API_KEY) {
      setStyleSuggestionError('OpenAI API key missing. Set VITE_OPENAI_API_KEY in .env.');
      return;
    }
    setStyleSuggestionError('');
    setStyleSuggestionLoading(true);
    try {
      const prompt = await suggestPromptFromImage({
        apiKey: OPENAI_API_KEY,
        imageDataUrl: styleRefDataUrl,
      });
      setStyleSuggestion(prompt);
    } catch (err: any) {
      setStyleSuggestionError(err?.message || 'Prompt suggestion failed.');
    } finally {
      setStyleSuggestionLoading(false);
    }
  };

  const useStyleSuggestionAsSubject = () => {
    if (styleSuggestion.trim()) setTopic(styleSuggestion.trim());
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Url = event.target?.result as string;
      setHeaderLogo(base64Url);
    };
    reader.readAsDataURL(file);
  };

  const downloadImage = (format: 'png' | 'jpeg' | 'webp') => {
    const slot = slots[selectedSlotIndex];
    if (!slot || !slot.url) return;

    const img = new Image();
    img.src = slot.url;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (!isTransparent && format === 'jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        const outUrl = canvas.toDataURL(`image/${format}`, 0.95);
        const a = document.createElement('a');
        a.href = outUrl;
        a.download = `federal-infographic-${slot.engine}-v${selectedSlotIndex + 1}.${format}`;
        a.click();
      }
    };
  };

  const submitRevision = async () => {
    if (!revisionPrompt.trim()) return;
    const slot = slots[selectedSlotIndex];
    if (!slot || slot.status !== 'done' || !slot.url) return;

    setIsReviseLoading(true);
    setError('');

    const targetBase64 = slot.url;
    const apiKey = slot.engine === 'openai' ? OPENAI_API_KEY : GEMINI_API_KEY;
    const generator = slot.engine === 'openai' ? generateOpenAIImage : generateGeminiImage;

    try {
      const payloadColors = extractedPalette.length > 0
        ? [primaryColor, accentColor, ...extractedPalette.filter(c => c !== primaryColor && c !== accentColor)]
        : [primaryColor, accentColor];

      // Revise within the variant's own topic + settings so the regenerated image
      // stays visually consistent with the variant we're editing.
      const effectiveTopic = slot.topicOverride || topic;
      const newImgUrl = await generator(
        effectiveTopic,
        apiKey,
        payloadColors,
        selectedFont,
        headerLogo,
        slot.settings.density,
        slot.settings.flow,
        slot.settings.orientation,
        slot.settings.accessibility,
        slot.settings.iconography,
        isTransparent,
        targetBase64,
        revisionPrompt,
        sourceText || null,
        slot.overrides
      );

      setSlots(prev => prev.map((s, i) => i === selectedSlotIndex ? { ...s, url: newImgUrl, status: 'done', error: undefined } : s));
      setIsRevising(false);
      setRevisionPrompt('');
    } catch (err) {
      setError('Revision failed. Check API key or try a different requirement.');
      console.error(err);
    } finally {
      setIsReviseLoading(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isGenerating) return;

    const engines: Engine[] =
      generationMode === 'openai' ? ['openai'] :
      generationMode === 'gemini' ? ['gemini'] :
      ['openai', 'gemini'];

    if (engines.includes('openai') && !OPENAI_API_KEY) {
      setError('OpenAI API key missing. Set VITE_OPENAI_API_KEY in .env.');
      return;
    }
    if (engines.includes('gemini') && !GEMINI_API_KEY) {
      setError('Gemini API key missing. Set VITE_GOOGLE_GEMINI_API_KEY in .env.');
      return;
    }

    setError('');
    setSelectedSlotIndex(0);

    const baseSettings: SlotSettings = { flow, density, iconography, accessibility, orientation };

    const payloadColors = extractedPalette.length > 0
      ? [primaryColor, accentColor, ...extractedPalette.filter(c => c !== primaryColor && c !== accentColor)]
      : [primaryColor, accentColor];

    // Build all slots up-front. Baselines are immediately 'rendering'. Tuned and
    // Reimagined start as 'planning' (waiting for GPT-5 to choose their visual
    // rhetoric) and flip to 'rendering' once the plan returns.
    // Order: variation-major, engine-minor. Baselines first so the user sees
    // their settings render before the AI's reinterpretations.
    const variationKinds: Variation[] = ['baseline', 'tuned', 'reimagined'];
    const initialSlots: VariantSlot[] = [];
    for (const kind of variationKinds) {
      for (const engine of engines) {
        initialSlots.push({
          engine,
          variation: kind,
          settings: baseSettings,
          status: kind === 'baseline' ? 'rendering' : 'planning',
        });
      }
    }
    setSlots(initialSlots);

    // Helper: kick off one render for a slot and patch its state as it resolves.
    const fireSlot = (slotSnapshot: VariantSlot, idx: number) => {
      const apiKey = slotSnapshot.engine === 'openai' ? OPENAI_API_KEY : GEMINI_API_KEY;
      const generator = slotSnapshot.engine === 'openai' ? generateOpenAIImage : generateGeminiImage;
      const effectiveTopic = slotSnapshot.topicOverride || topic;

      generator(
        effectiveTopic,
        apiKey,
        payloadColors,
        selectedFont,
        headerLogo,
        slotSnapshot.settings.density,
        slotSnapshot.settings.flow,
        slotSnapshot.settings.orientation,
        slotSnapshot.settings.accessibility,
        slotSnapshot.settings.iconography,
        isTransparent,
        null,
        null,
        sourceText || null,
        slotSnapshot.overrides
      ).then(url => {
        setSlots(prev => prev.map((s, i) => i === idx ? { ...s, status: 'done', url } : s));
      }).catch(err => {
        console.error(`Slot ${idx} (${slotSnapshot.engine}, ${slotSnapshot.variation}) failed:`, err);
        setSlots(prev => prev.map((s, i) => i === idx ? { ...s, status: 'error', error: err?.message || String(err) } : s));
      });
    };

    // Fire baseline slots immediately — they don't wait on GPT-5.
    initialSlots.forEach((slot, idx) => {
      if (slot.variation === 'baseline') fireSlot(slot, idx);
    });

    // Plan the two reimaginings in the background. When the plan returns, patch
    // the planning slots with their real settings + topic override and fire them.
    // No hard timeout in handler — callChat already has a generous default
    // safety net (3 min). If anything fails, fall back to heuristic and keep going.
    (async () => {
      console.log('[plan] firing GPT-5 variant-settings call (reasoning_effort: high)...');
      const t0 = Date.now();
      let variantPair: { tuned: GptVariantSettings; reimagined: GptVariantSettings };
      try {
        variantPair = await getVariantSettings({
          apiKey: OPENAI_API_KEY,
          topic,
          base: baseSettings,
          referenceContext: sourceText || undefined,
        });
        console.log(`[plan] returned in ${((Date.now() - t0) / 1000).toFixed(1)}s`, variantPair);
      } catch (err) {
        console.warn('[plan] failed entirely; rendering tuned/reimagined as baseline copies:', err);
        const safeFallback: GptVariantSettings = {
          ...baseSettings,
          palette: [],
          typography: 'sans',
          logo_treatment: 'top-left',
          background_mode: 'light',
          mood: 'editorial',
          style_register: '',
          prompt_override: '',
          visual_rhetoric: '',
          rationale: 'Plan unavailable; rendered with baseline settings.',
        };
        variantPair = { tuned: safeFallback, reimagined: safeFallback };
      }

      // Patch the planning slots in state AND fire them. We compute the updated
      // snapshot once so we can both pass it to setSlots and use it for the fires.
      const planFor = (v: Variation) => v === 'tuned' ? variantPair.tuned : variantPair.reimagined;
      const updatedSnapshot: VariantSlot[] = initialSlots.map(s => {
        if (s.variation === 'baseline') return s;
        const p = planFor(s.variation);
        // Reimagined gets the loose wrapper so the AI's prompt drives composition;
        // Tuned keeps the strict wrapper but with the new palette/typography.
        const overrides: VariantOverrides = {
          palette: p.palette && p.palette.length > 0 ? p.palette : undefined,
          typography: p.typography,
          logoTreatment: p.logo_treatment,
          backgroundMode: p.background_mode,
          mood: p.mood,
          styleRegister: p.style_register,
          loose: s.variation === 'reimagined',
        };
        return {
          ...s,
          status: 'rendering',
          settings: {
            flow: p.flow,
            density: p.density,
            iconography: p.iconography,
            accessibility: p.accessibility,
            orientation: p.orientation,
          },
          topicOverride: p.prompt_override || undefined,
          visualRhetoric: p.visual_rhetoric || undefined,
          rationale: p.rationale,
          overrides,
        };
      });

      setSlots(prev => prev.map((s, i) =>
        s.variation === 'baseline' ? s : updatedSnapshot[i]
      ));

      updatedSnapshot.forEach((slot, idx) => {
        if (slot.variation !== 'baseline') fireSlot(slot, idx);
      });
    })();
  };

  if (!isStarted) {
    return <Landing onStart={() => setIsStarted(true)} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-zinc-50 font-sans p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-zinc-200 rounded-full blur-3xl opacity-20 transform translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-zinc-200 rounded-full blur-3xl opacity-20 transform -translate-x-1/2 translate-y-1/3"></div>

        <motion.div
          initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="bg-white border border-zinc-200 shadow-xl rounded-2xl p-8 md:p-10 max-w-sm w-full flex flex-col gap-6 z-10"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <img src="/BA-logo-black.png" alt="B&A Authentication" className="h-10 w-auto opacity-90 object-contain mb-2" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 leading-tight">Federal Infographic Toolkit</h1>
            <p className="text-xs text-zinc-500 font-medium">Please authenticate to access the generation engine.</p>
          </div>

          {authError && <div className="text-[11px] font-bold text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 text-center">{authError}</div>}

          <form className="flex flex-col gap-4" onSubmit={(e) => {
            e.preventDefault();
            if (usernameInput === 'admin' && passwordInput === 'BAinfographic2026!') {
              setIsAuthenticated(true);
              setAuthError('');
            } else {
              setAuthError('Invalid credentials. Access denied.');
            }
          }}>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Username</label>
              <input type="text" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-zinc-950/20" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">Password</label>
              <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-zinc-950/20" />
            </div>
            <button type="submit" className="w-full py-3 bg-zinc-950 text-white font-bold text-[13px] tracking-wide rounded-lg hover:bg-zinc-800 transition-all mt-2 shadow-md hover:shadow-lg hover:-translate-y-px">Authenticate</button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full flex flex-col md:flex-row bg-zinc-50 overflow-hidden font-sans">

      {/* LEFT: Dashboard Control Panel */}
      <section className="w-full md:w-[38%] lg:w-[34%] min-h-[50dvh] md:max-h-screen overflow-y-auto bg-white border-r border-zinc-200 shadow-[20px_0_40px_-20px_rgba(0,0,0,0.03)] flex flex-col p-8 md:p-10 z-10 shrink-0">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col h-full"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <img src="/BA-logo-black.png" alt="B&A Logo" className="h-8 w-auto object-contain mix-blend-multiply opacity-90" />
              <div className="border-l border-zinc-300 pl-3 py-0.5">
                <h1 className="text-sm font-bold tracking-tight text-zinc-950 uppercase leading-none mb-1">Federal Infographic Toolkit</h1>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">Compliance & Proposals</p>
              </div>
            </div>
            <button
              onClick={() => { setIsStarted(false); setIsAuthenticated(false); }}
              className="text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 p-1.5 rounded-lg transition-all flex items-center justify-center group border border-transparent hover:border-zinc-200"
              title="Return to Home Screen"
            >
              <CaretLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="flex-grow">
            {/* Input Form */}
            <form onSubmit={handleGenerate} className="flex flex-col gap-5">

              {/* Reference Material (V2): upload PPTX or paste text */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase flex items-center gap-1.5">
                    <FilePpt className="w-3 h-3" /> Reference Material · Optional
                  </label>
                  {sourceText && (
                    <button
                      type="button"
                      onClick={clearSource}
                      className="text-[10px] text-zinc-400 hover:text-red-600 font-medium uppercase tracking-widest"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {!sourceText ? (
                  <>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSourceKind('pptx')}
                        className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold tracking-wide transition-all ${sourceKind === 'pptx' ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                      >
                        <FilePpt weight="bold" className="w-3 h-3 inline mr-1" /> Upload PPTX
                      </button>
                      <button
                        type="button"
                        onClick={() => setSourceKind('text')}
                        className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold tracking-wide transition-all ${sourceKind === 'text' ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                      >
                        <TextT weight="bold" className="w-3 h-3 inline mr-1" /> Paste Text
                      </button>
                    </div>

                    {sourceKind === 'pptx' ? (
                      <button
                        type="button"
                        onClick={() => sourceFileInputRef.current?.click()}
                        disabled={sourceParseLoading}
                        className="w-full border-2 border-dashed border-zinc-200 rounded-xl py-3 px-3 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 hover:border-zinc-300 transition-colors group disabled:opacity-50"
                      >
                        <input
                          type="file"
                          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                          className="hidden"
                          ref={sourceFileInputRef}
                          onChange={handleSourceFileUpload}
                        />
                        {sourceParseLoading ? (
                          <div className="flex items-center gap-2 text-[13px] text-zinc-600 py-1">
                            <CircleNotch weight="bold" className="w-4 h-4 animate-spin" /> Parsing deck...
                          </div>
                        ) : (
                          <>
                            <UploadSimple className="w-4 h-4 text-zinc-500 mb-1" />
                            <span className="text-[12px] font-medium text-zinc-600">Drop a PowerPoint (.pptx)</span>
                            <span className="text-[10px] text-zinc-400 mt-0.5">Text gets extracted and fed to GPT-5 reasoning</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          rows={4}
                          value={pastedText}
                          onChange={(e) => setPastedText(e.target.value)}
                          placeholder="Paste an RFP excerpt, scoping notes, prior writeup, or any reference content..."
                          className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-[12px] focus:outline-none focus:ring-2 focus:ring-zinc-950/10 focus:border-zinc-950 transition-all placeholder:text-zinc-400 font-medium text-zinc-900 resize-none"
                        />
                        <button
                          type="button"
                          onClick={handlePastedTextApply}
                          disabled={!pastedText.trim()}
                          className="self-end px-3 py-1.5 bg-zinc-950 text-white text-[10px] font-bold tracking-wide rounded-md disabled:opacity-40"
                        >
                          USE TEXT
                        </button>
                      </div>
                    )}

                    {sourceError && (
                      <div className="px-3 py-2.5 border border-red-200 bg-red-50 rounded-lg flex items-start gap-2">
                        <WarningCircle weight="fill" className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-700 font-medium leading-snug">{sourceError}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 border border-emerald-200 bg-emerald-50 rounded-xl">
                    <FilePpt weight="fill" className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-[12px] font-bold text-zinc-900 truncate">{sourceName}</span>
                      <span className="text-[10px] text-emerald-700 font-mono">{sourceMeta}</span>
                    </div>
                  </div>
                )}

                {/* Auto-generated context summary — a few lines so the user knows what was captured. */}
                {(contextSummaryLoading || contextSummary) && (
                  <div className="px-3 py-2.5 border border-zinc-200 bg-zinc-50/60 rounded-lg flex items-start gap-2">
                    <Sparkle weight="fill" className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                    {contextSummaryLoading ? (
                      <span className="text-[11px] text-zinc-500 italic">Reading what you uploaded...</span>
                    ) : (
                      <p className="text-[11px] text-zinc-700 leading-snug italic">{contextSummary}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Style Reference: upload an existing graphic, get a suggested Proposal Subject. */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase flex items-center gap-1.5">
                    <ImageIcon className="w-3 h-3" /> Style Reference · Optional
                  </label>
                  {styleRefDataUrl && (
                    <button
                      type="button"
                      onClick={clearStyleRef}
                      className="text-[10px] text-zinc-400 hover:text-red-600 font-medium uppercase tracking-widest"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {!styleRefDataUrl ? (
                  <button
                    type="button"
                    onClick={() => styleRefInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-zinc-200 rounded-xl py-3 px-3 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 hover:border-zinc-300 transition-colors group"
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      ref={styleRefInputRef}
                      onChange={handleStyleRefUpload}
                    />
                    <UploadSimple className="w-4 h-4 text-zinc-500 mb-1" />
                    <span className="text-[12px] font-medium text-zinc-600">Upload existing graphic</span>
                    <span className="text-[10px] text-zinc-400 mt-0.5">GPT-5 will suggest a prompt you can use</span>
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="w-full border border-zinc-200 rounded-xl p-2.5 flex items-center gap-3 bg-zinc-50/50">
                      <img src={styleRefDataUrl} alt="Style reference" className="h-16 w-20 object-cover rounded-md border border-zinc-200 shrink-0" />
                      <div className="flex flex-col flex-1 min-w-0 gap-1.5">
                        <span className="text-[12px] font-bold text-zinc-900 truncate">{styleRefName}</span>
                        <button
                          type="button"
                          onClick={handleSuggestPrompt}
                          disabled={styleSuggestionLoading}
                          className="self-start px-2.5 py-1 rounded-md bg-zinc-950 hover:bg-zinc-800 text-white text-[10px] font-bold tracking-wide uppercase disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {styleSuggestionLoading ? (
                            <><CircleNotch weight="bold" className="w-3 h-3 animate-spin" /> Analyzing...</>
                          ) : (
                            <><Sparkle weight="fill" className="w-3 h-3" /> {styleSuggestion ? 'Re-suggest' : 'Suggest Prompt'}</>
                          )}
                        </button>
                      </div>
                    </div>

                    {styleSuggestionError && (
                      <div className="px-3 py-2.5 border border-red-200 bg-red-50 rounded-lg flex items-start gap-2">
                        <WarningCircle weight="fill" className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-700 font-medium leading-snug">{styleSuggestionError}</p>
                      </div>
                    )}

                    {styleSuggestion && (
                      <div className="flex flex-col gap-2 px-3 py-2.5 border border-zinc-200 bg-white rounded-xl">
                        <span className="text-[9px] font-bold text-zinc-500 tracking-widest uppercase">Suggested Subject</span>
                        <p className="text-[12px] text-zinc-800 leading-relaxed whitespace-pre-wrap">{styleSuggestion}</p>
                        <button
                          type="button"
                          onClick={useStyleSuggestionAsSubject}
                          className="self-end px-2.5 py-1 rounded-md border border-zinc-300 hover:bg-zinc-50 text-[10px] font-bold tracking-wide uppercase flex items-center gap-1.5"
                        >
                          <ArrowDown weight="bold" className="w-3 h-3" /> Use as Subject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* HERO: Proposal Subject Prompt */}
              <div className="flex flex-col gap-2.5">
                <label htmlFor="topic" className="text-[11px] font-bold text-zinc-700 tracking-widest uppercase flex items-center gap-2">
                  <Article weight="fill" className="w-3.5 h-3.5 text-zinc-950" /> Proposal Subject
                </label>
                <textarea
                  id="topic"
                  rows={7}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Describe the narrative, sections, and visual story for your infographic. For example: 'A 5-stage vertical pipeline showing how disconnected DLA content systems are unified through ReadyDocs governance, AI orchestration, and DISSECT assurance into mission-ready knowledge.'"
                  className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-950/10 focus:border-zinc-950 transition-all placeholder:text-zinc-400 font-medium text-zinc-900 shadow-sm resize-none leading-relaxed"
                />
              </div>

              {/* Engine Mode Selector (compact) */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" /> Rendering Engines
                </label>
                <div className="flex gap-1.5">
                  {([
                    { value: 'openai' as GenerationMode, label: 'GPT-Image', sub: '3 variants' },
                    { value: 'both' as GenerationMode, label: 'Both', sub: '3 + 3 (default)' },
                    { value: 'gemini' as GenerationMode, label: 'Nano Banana', sub: '3 variants' },
                  ]).map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setGenerationMode(m.value)}
                      className={`flex-1 flex flex-col items-center justify-center px-2 py-2.5 rounded-lg border transition-all ${generationMode === m.value ? 'border-zinc-950 bg-zinc-950 text-white shadow-md' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'}`}
                    >
                      <span className="text-[11px] font-bold tracking-tight leading-none mb-0.5">{m.label}</span>
                      <span className={`text-[8.5px] font-medium leading-none ${generationMode === m.value ? 'text-zinc-300' : 'text-zinc-500'}`}>{m.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="text-xs text-red-600 font-medium bg-red-50 p-3 rounded-lg border border-red-100 flex items-start gap-2">
                  <WarningCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isGenerating || !topic.trim()}
                className="group w-full py-4 px-4 bg-zinc-950 text-white font-medium text-[15px] flex items-center justify-center gap-2 rounded-xl transition-all hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:-translate-y-[1px] focus:outline-none active:scale-[0.98] active:translate-y-[1px] shadow-md"
              >
                {isGenerating ? (
                  <>
                    <CircleNotch weight="bold" className="animate-spin w-5 h-5" />
                    <span>
                      Rendering {doneCount}/{slots.length}
                      {isPlanningAny ? ' · GPT-5 still planning variations' : '...'}
                    </span>
                  </>
                ) : (
                  <>
                    <span>Render {generationMode === 'both' ? 6 : 3} Variants</span>
                    <PaperPlaneTilt weight="fill" className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {/* Customize Drawers */}
              <div className="flex flex-col gap-2 pt-4 mt-2 border-t border-zinc-100">
                <p className="text-[10px] font-bold text-zinc-400 tracking-widest uppercase mb-1 px-1">Customize</p>

                {/* Brand */}
                <Drawer title="Brand" icon={<Palette className="w-3.5 h-3.5 text-zinc-500" />}>
                  {/* Typography */}
                  <div className="flex flex-col gap-3">
                    <label className="text-[12px] font-semibold text-zinc-800 tracking-wide flex items-center gap-2">
                      <TextAa className="w-3.5 h-3.5 text-zinc-500" /> Typography Standard
                    </label>
                    <div className="flex flex-col gap-2">
                      {fonts.map((f) => (
                        <label key={f.value} className={`relative flex items-center gap-3 p-3 rounded-xl border border-zinc-200 cursor-pointer transition-all hover:bg-zinc-50 ${selectedFont === f.value ? 'ring-2 ring-zinc-950/20 border-zinc-950 bg-zinc-50' : 'bg-white'}`}>
                          <input
                            type="radio"
                            name="fontGroup"
                            value={f.value}
                            checked={selectedFont === f.value}
                            onChange={(e) => setSelectedFont(e.target.value)}
                            className="w-4 h-4 text-zinc-950 focus:ring-zinc-950"
                          />
                          <span className={`text-[13px] font-medium text-zinc-800 ${f.value}`}>{f.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Logo */}
                  <div className="flex flex-col gap-2.5">
                    <label className="text-[12px] font-semibold text-zinc-800 tracking-wide flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><ImageIcon className="w-3.5 h-3.5 text-zinc-500" /> Organization Logo</span>
                      {headerLogo && (
                        <button
                          type="button"
                          onClick={() => setHeaderLogo(null)}
                          className="text-red-500 hover:text-red-700 p-1 bg-red-50 rounded-md"
                          title="Remove Logo"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </label>
                    {!headerLogo ? (
                      <div
                        onClick={() => logoFileInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-zinc-200 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 hover:border-zinc-300 transition-colors group"
                      >
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={logoFileInputRef}
                          onChange={handleLogoUpload}
                        />
                        <div className="w-8 h-8 bg-zinc-100 group-hover:bg-zinc-200 rounded-full flex items-center justify-center mb-1 shadow-sm border border-zinc-200 transition-colors">
                          <UploadSimple className="w-4 h-4 text-zinc-500" />
                        </div>
                        <span className="text-sm font-medium text-zinc-600">Upload Header Logo</span>
                        <span className="text-[11px] text-zinc-400 mt-0.5 text-center leading-tight">Injected into top-left of render.</span>
                      </div>
                    ) : (
                      <div className="w-full border border-zinc-200 rounded-xl p-4 flex items-center justify-center bg-zinc-50/50 relative overflow-hidden h-[120px] group shadow-inner">
                        <img src={headerLogo} alt="Uploaded Logo" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                      </div>
                    )}
                  </div>

                  {/* Color Architecture */}
                  <div className="flex flex-col gap-2.5">
                    <label className="text-[12px] font-semibold text-zinc-800 tracking-wide flex items-center gap-2">
                      <Palette className="w-3.5 h-3.5 text-zinc-500" /> Color Architecture
                    </label>

                    <div
                      onClick={() => colorFileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-zinc-200 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 hover:border-zinc-300 transition-colors group"
                    >
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={colorFileInputRef}
                        onChange={handleColorImageUpload}
                      />
                      <div className="w-8 h-8 bg-zinc-100 group-hover:bg-zinc-200 rounded-full flex items-center justify-center mb-1 shadow-sm border border-zinc-200 transition-colors">
                        <UploadSimple className="w-4 h-4 text-zinc-500" />
                      </div>
                      <span className="text-sm font-medium text-zinc-600">Upload Image Baseline</span>
                      <span className="text-xs text-zinc-400 mt-1">Auto-extract up to 5 dominant hex codes</span>
                    </div>

                    {extractedPalette.length > 0 && (
                      <div className="flex items-center gap-2 w-full justify-between mt-1">
                        {extractedPalette.map((hex, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1.5 flex-1">
                            <button
                              type="button"
                              title={`Click to set as Primary (Current: ${primaryColor === hex ? 'Primary' : accentColor === hex ? 'Accent' : 'Not Set'})`}
                              onClick={() => {
                                if (primaryColor === hex) setAccentColor(hex);
                                else setPrimaryColor(hex);
                              }}
                              className={`w-full aspect-square rounded-lg border-2 shadow-inner transition-transform hover:scale-105 ${primaryColor === hex ? 'border-zinc-950 ring-2 ring-zinc-950/20' : accentColor === hex ? 'border-zinc-500 border-dashed' : 'border-black/5'}`}
                              style={{ backgroundColor: hex }}
                            ></button>
                            <span className="text-[10px] font-mono text-zinc-500 uppercase">{hex}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-3 mt-1">
                      <div className="flex-1 flex flex-col gap-2">
                        <span className="text-[11px] text-zinc-500 font-medium">Primary Accent</span>
                        <label className="relative flex items-center h-11 w-full border border-zinc-200 rounded-xl overflow-hidden shadow-sm cursor-pointer hover:border-zinc-300 transition-colors">
                          <input
                            type="color"
                            value={primaryColor}
                            onChange={(e) => setPrimaryColor(e.target.value)}
                            className="absolute -left-2 top-0 w-[200%] h-full cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                          />
                          <div className="ml-auto mr-2.5 px-1.5 py-1 bg-white border border-zinc-200 rounded-md text-[11px] font-mono text-zinc-600 shadow-sm pointer-events-none uppercase">
                            {primaryColor}
                          </div>
                        </label>
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <span className="text-[11px] text-zinc-500 font-medium">Secondary Line</span>
                        <label className="relative flex items-center h-11 w-full border border-zinc-200 rounded-xl overflow-hidden shadow-sm cursor-pointer hover:border-zinc-300 transition-colors">
                          <input
                            type="color"
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            className="absolute -left-2 top-0 w-[200%] h-full cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                          />
                          <div className="ml-auto mr-2.5 px-1.5 py-1 bg-white border border-zinc-200 rounded-md text-[11px] font-mono text-zinc-600 shadow-sm pointer-events-none uppercase">
                            {accentColor}
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </Drawer>

                {/* Structure */}
                <Drawer title="Structure" icon={<FrameCorners className="w-3.5 h-3.5 text-zinc-500" />}>
                  {/* Density */}
                  <div className="flex flex-col gap-2.5">
                    <label className="text-[12px] font-semibold text-zinc-800 tracking-wide flex items-center gap-2">
                      <Faders className="w-3.5 h-3.5 text-zinc-500" /> Information Density
                    </label>
                    <div className="flex gap-2">
                      {densities.map((d) => (
                        <label
                          key={d.value}
                          className={`flex-1 relative flex flex-col items-center justify-center p-2.5 rounded-xl border cursor-pointer transition-all hover:bg-zinc-50 ${density === d.value ? 'ring-2 ring-zinc-950/20 border-zinc-950 bg-zinc-50' : 'border-zinc-200 bg-white'}`}
                        >
                          <input
                            type="radio"
                            name="densityGroup"
                            value={d.value}
                            checked={density === d.value}
                            onChange={(e) => setDensity(e.target.value as any)}
                            className="hidden"
                          />
                          <span className="text-[12px] font-bold text-zinc-800 tracking-tight leading-none mb-1">{d.label}</span>
                          <span className="text-[9px] text-zinc-500 font-medium text-center leading-[1.1] opacity-80">{d.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Flow */}
                  <div className="flex flex-col gap-2.5">
                    <label className="text-[12px] font-semibold text-zinc-800 tracking-wide flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border border-zinc-500 rounded-sm inline-flex"></span> Flow & Layout
                    </label>
                    <div className="flex flex-col gap-2">
                      {flows.map((f) => (
                        <label key={f.value} className={`relative flex items-center gap-3 p-2.5 rounded-xl border border-zinc-200 cursor-pointer transition-all hover:bg-zinc-50 ${flow === f.value ? 'ring-2 ring-zinc-950/20 border-zinc-950 bg-zinc-50' : 'bg-white'}`}>
                          <input
                            type="radio"
                            name="flowGroup"
                            value={f.value}
                            checked={flow === f.value}
                            onChange={(e) => setFlow(e.target.value)}
                            className="w-4 h-4 text-zinc-950 focus:ring-zinc-950"
                          />
                          <div className="flex flex-col">
                            <span className="text-[13px] font-medium text-zinc-800">{f.label}</span>
                            <span className="text-[11px] font-medium text-zinc-500">{f.desc}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Orientation */}
                  <div className="flex flex-col gap-2.5">
                    <label className="text-[12px] font-semibold text-zinc-800 tracking-wide flex items-center gap-2">
                      <FrameCorners className="w-3.5 h-3.5 text-zinc-500" /> Page Orientation
                    </label>
                    <div className="flex gap-2">
                      {orientations.map((o) => (
                        <label key={o.value} className={`flex-1 relative flex flex-col items-center justify-center p-2.5 rounded-lg border cursor-pointer transition-all hover:bg-zinc-50 ${orientation === o.value ? 'ring-2 ring-zinc-950/20 border-zinc-950 bg-zinc-50' : 'bg-white border-zinc-200'}`}>
                          <input type="radio" value={o.value} checked={orientation === o.value} onChange={(e) => setOrientation(e.target.value)} className="hidden" />
                          <span className="text-[11px] font-bold text-zinc-800 tracking-tight text-center leading-none mb-1">{o.label}</span>
                          <span className="text-[9px] text-zinc-500 font-medium text-center leading-[1.1] opacity-80">{o.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </Drawer>

                {/* Output */}
                <Drawer title="Output" icon={<Eye className="w-3.5 h-3.5 text-zinc-500" />}>
                  {/* Section 508 */}
                  <div className="flex flex-col gap-2.5">
                    <label className="text-[12px] font-semibold text-zinc-800 tracking-wide flex items-center gap-2">
                      <Eye className="w-3.5 h-3.5 text-zinc-500" /> Section 508 Contrast Lock
                    </label>
                    <div className="flex flex-col gap-2">
                      {accessibilities.map((a) => (
                        <label key={a.value} className={`relative flex flex-col items-start justify-center p-2.5 rounded-lg border cursor-pointer transition-all hover:bg-zinc-50 ${accessibility === a.value ? 'ring-2 ring-zinc-950/20 border-zinc-950 bg-zinc-50' : 'bg-white border-zinc-200'}`}>
                          <input type="radio" value={a.value} checked={accessibility === a.value} onChange={(e) => setAccessibility(e.target.value)} className="hidden" />
                          <span className="text-[12px] font-bold text-zinc-800 tracking-tight leading-none mb-1">{a.label}</span>
                          <span className="text-[10px] text-zinc-500 font-medium">{a.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Iconography */}
                  <div className="flex flex-col gap-2.5">
                    <label className="text-[12px] font-semibold text-zinc-800 tracking-wide flex items-center gap-2">
                      <Shapes className="w-3.5 h-3.5 text-zinc-500" /> Iconography Strictness
                    </label>
                    <div className="flex gap-2">
                      {iconographies.map((i) => (
                        <label key={i.value} className={`flex-1 relative flex items-center justify-center px-1 py-2 rounded-lg border cursor-pointer transition-all hover:bg-zinc-50 ${iconography === i.value ? 'ring-2 ring-zinc-950/20 border-zinc-950 bg-zinc-50' : 'bg-white border-zinc-200'}`}>
                          <input type="radio" value={i.value} checked={iconography === i.value} onChange={(e) => setIconography(e.target.value)} className="hidden" />
                          <span className="text-[11px] font-bold text-zinc-800 tracking-tight text-center leading-tight">{i.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Transparency Toggle */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-zinc-100">
                    <label className="text-[12px] font-semibold text-zinc-800 tracking-wide flex items-center justify-between gap-2 cursor-pointer group">
                      <span className="flex items-center gap-2">
                        <PhosphorImage className="w-3.5 h-3.5 text-zinc-500" /> Alpha Channel (Transparent)
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsTransparent(!isTransparent)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isTransparent ? 'bg-zinc-950' : 'bg-zinc-200'}`}
                      >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isTransparent ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </label>
                    <p className="text-[11px] text-zinc-500 leading-tight">Removes the master background layer to generate a transparent structural asset.</p>
                  </div>
                </Drawer>
              </div>
            </form>
          </div>

          <div className="mt-8 pt-5 border-t border-zinc-100 flex items-center justify-between text-zinc-400 text-[10px] font-mono">
            <span>
              SYS: {generationMode === 'openai' ? 'GPT-IMAGE 3× (Baseline · Tuned · Reimagined)' : generationMode === 'gemini' ? 'NANO-BANANA 3× (Baseline · Tuned · Reimagined)' : 'GPT-IMAGE + NANO-BANANA (3+3 with AI-picked variations)'}
            </span>
            <span>v3.1.0-Streaming</span>
          </div>
        </motion.div>
      </section>

      {/* RIGHT: Infographic Output */}
      <section className="flex-1 w-full flex items-center justify-center bg-zinc-100 relative p-6 md:p-12 h-screen overflow-y-auto pattern-dots pattern-zinc-200 pattern-size-4 pattern-opacity-50">
        <AnimatePresence mode="wait">
          {slots.length === 0 ? (
            <motion.div
              key="empty-state"
              layoutId="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center text-zinc-400 p-12 max-w-md text-center"
            >
              <div className="w-24 h-24 mb-6 rounded-full border border-zinc-200 bg-white/50 flex items-center justify-center shadow-inner">
                <PhosphorImage weight="thin" className="w-10 h-10 text-zinc-300" />
              </div>
              <p className="text-lg font-medium text-zinc-600 mb-2">Awaiting Array Rendering</p>
              <p className="text-sm font-sans italic text-zinc-500">
                Write the proposal subject, pick a rendering engine mix, and six variants will stream in — GPT-5 plans two reimaginings (~30s), then all six images render in parallel.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="variants-state"
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
              className="w-full max-w-5xl flex flex-col my-auto gap-6"
            >
              {/* Hero Image (or skeleton / error for selected slot) */}
              <div className={`w-full shadow-2xl rounded-xl overflow-hidden border-4 border-white flex flex-col relative ${isTransparent && selectedSlot?.status === 'done' ? 'bg-zinc-100 pattern-isometric pattern-zinc-200 pattern-size-4 pattern-opacity-100' : 'bg-white'}`}>
                {selectedSlot?.status === 'done' && selectedSlot.url ? (
                  <img src={selectedSlot.url} alt="Generated Infographic Selection" className="w-full h-auto object-contain z-10" />
                ) : selectedSlot?.status === 'error' ? (
                  <div className="w-full aspect-[11/8.5] flex flex-col items-center justify-center p-8 bg-red-50 text-red-700 gap-3">
                    <WarningCircle className="w-12 h-12" />
                    <p className="font-bold text-sm uppercase tracking-wide">Variant failed</p>
                    <p className="text-[11px] font-mono opacity-70 max-w-md text-center break-words">{selectedSlot.error}</p>
                  </div>
                ) : selectedSlot?.status === 'planning' ? (
                  <div className="w-full aspect-[11/8.5] flex flex-col items-center justify-center p-8 bg-zinc-50 gap-4">
                    <Sparkle weight="fill" className="w-12 h-12 text-zinc-400 animate-pulse" />
                    <p className="text-[11px] uppercase tracking-widest text-zinc-600 font-bold">
                      GPT-5 is reimagining this variant
                    </p>
                    <p className="text-[11px] text-zinc-500 italic max-w-sm text-center">
                      Choosing a visual rhetoric different from your baseline. This step uses high reasoning and takes 30–90 seconds. The {variationLabel(selectedSlot.variation).toLowerCase()} variant on {engineLabel(selectedSlot.engine)} will start rendering as soon as the plan returns.
                    </p>
                  </div>
                ) : (
                  <div className="w-full aspect-[11/8.5] flex flex-col items-center justify-center p-8 bg-zinc-50 gap-4">
                    <CircleNotch weight="bold" className="w-12 h-12 text-zinc-400 animate-spin" />
                    <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold">
                      {selectedSlot ? `${engineLabel(selectedSlot.engine)} rendering...` : 'Awaiting variant'}
                    </p>
                  </div>
                )}

                {/* Export Toolbar (always present) */}
                <div className="w-full bg-zinc-950 px-4 py-3 flex items-center justify-between z-20">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-white text-xs font-mono font-medium opacity-70 whitespace-nowrap">
                      V{selectedSlotIndex + 1}
                      {selectedSlot && <span className="ml-2 opacity-60">· {engineLabel(selectedSlot.engine)} · {variationLabel(selectedSlot.variation)}</span>}
                    </span>
                    {selectedSlot && selectedSlot.variation !== 'baseline' && (() => {
                      const baseline = slots.find(s => s.variation === 'baseline');
                      const delta = baseline ? settingsDelta(baseline.settings, selectedSlot.settings) : '';
                      const parts: string[] = [];
                      if (selectedSlot.visualRhetoric) parts.push(selectedSlot.visualRhetoric);
                      if (delta) parts.push(delta);
                      return parts.length > 0 ? (
                        <span className="hidden md:inline text-[10px] text-zinc-400 font-mono truncate" title={selectedSlot.rationale || ''}>
                          {parts.join(' · ')}
                        </span>
                      ) : null;
                    })()}
                    <button
                      onClick={() => setIsRevising(!isRevising)}
                      disabled={selectedSlot?.status !== 'done'}
                      className={`px-2 py-1 text-[10px] uppercase tracking-wider rounded transition-colors font-bold cursor-pointer border disabled:opacity-30 disabled:cursor-not-allowed ${isRevising ? 'bg-white text-zinc-950 border-white' : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}
                    >
                      {isRevising ? 'Cancel Edit' : 'Revise Variant'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 text-xs font-mono font-medium mr-1.5 hidden md:block">EXPORT</span>
                    <button onClick={() => downloadImage('png')} disabled={selectedSlot?.status !== 'done'} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-md transition-colors font-medium cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">PNG</button>
                    <button onClick={() => downloadImage('jpeg')} disabled={selectedSlot?.status !== 'done'} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-md transition-colors font-medium cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">JPEG</button>
                    <button onClick={() => downloadImage('webp')} disabled={selectedSlot?.status !== 'done'} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-md transition-colors font-medium cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">WEBP</button>
                  </div>
                </div>
              </div>

              {/* Revision Drawer */}
              <AnimatePresence>
                {isRevising && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: -24 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: -24 }}
                    className="w-full bg-zinc-900 border-4 border-t-0 border-zinc-900 rounded-b-xl overflow-hidden -mt-[28px] pt-6 z-10"
                  >
                    <div className="p-5 flex flex-col gap-3">
                      <label className="text-[11px] uppercase tracking-widest font-bold text-zinc-400">Specify Structural Revisions</label>
                      <textarea
                        rows={2}
                        value={revisionPrompt}
                        onChange={(e) => setRevisionPrompt(e.target.value)}
                        placeholder="e.g., 'Change the flow to vertical, darken the lines, and ensure the nodes have sharper corners.'"
                        className="w-full bg-zinc-800 border-none text-white rounded-lg p-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-zinc-600 placeholder:text-zinc-600 resize-none font-medium"
                        disabled={isReviseLoading}
                      />
                      <button
                        onClick={submitRevision}
                        disabled={isReviseLoading || !revisionPrompt.trim()}
                        className="self-end px-5 py-2.5 bg-white text-zinc-950 font-bold text-xs uppercase tracking-wide rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isReviseLoading ? <CircleNotch className="w-4 h-4 animate-spin" /> : <PaperPlaneTilt weight="fill" className="w-4 h-4" />}
                        {isReviseLoading ? 'Rebuilding Matrix...' : 'Commit Revision'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Variant Strip */}
              <div className="flex items-center gap-2 justify-center w-full flex-wrap">
                {slots.map((slot, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedSlotIndex(idx)}
                    title={slot.rationale || `${variationLabel(slot.variation)} · ${engineLabel(slot.engine)}`}
                    className={`relative h-20 w-28 md:w-32 rounded-lg overflow-hidden border-4 transition-all focus:outline-none shadow-sm ${selectedSlotIndex === idx ? 'border-zinc-950 scale-105 z-10 shadow-xl' : 'border-white opacity-70 hover:opacity-100 hover:scale-[1.02]'}`}
                  >
                    {slot.status === 'done' && slot.url ? (
                      <img src={slot.url} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" />
                    ) : slot.status === 'error' ? (
                      <div className="w-full h-full bg-red-50 flex items-center justify-center">
                        <WarningCircle className="w-6 h-6 text-red-500" />
                      </div>
                    ) : slot.status === 'planning' ? (
                      <div className="w-full h-full bg-zinc-100 flex flex-col items-center justify-center relative overflow-hidden gap-1">
                        <div className="absolute inset-0 bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100 bg-[length:200%_100%] animate-shimmer" />
                        <Sparkle weight="fill" className="w-4 h-4 text-zinc-500 relative z-10" />
                        <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-zinc-500 relative z-10">Planning</span>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-zinc-100 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-100 bg-[length:200%_100%] animate-shimmer" />
                        <CircleNotch weight="bold" className="w-5 h-5 text-zinc-400 animate-spin relative z-10" />
                      </div>
                    )}
                    <div className={`absolute top-1 left-1.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded backdrop-blur-md ${
                      slot.variation === 'baseline' ? 'bg-zinc-950/75 text-white'
                        : slot.variation === 'tuned' ? 'bg-amber-500/90 text-white'
                          : 'bg-purple-500/90 text-white'
                    }`}>
                      {variationLabel(slot.variation).toUpperCase()}
                    </div>
                    <div className={`absolute bottom-1 right-1.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded backdrop-blur-md ${slot.engine === 'openai' ? 'bg-emerald-500/85 text-white' : 'bg-blue-500/85 text-white'}`}>
                      {engineShort(slot.engine)}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 italic text-center font-medium opacity-80 -mt-2">
                {isGenerating
                  ? `${doneCount} of ${slots.length} variants ready · streaming${isPlanningAny ? ' · GPT-5 still planning reimaginings' : ''}...`
                  : errorCount > 0
                    ? `${doneCount} of ${slots.length} variants ready · ${errorCount} failed.`
                    : `${slots.length} variants ready. Click to compare alternatives.`}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

    </div>
  );
}
