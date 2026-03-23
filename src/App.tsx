import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateInfographicImage } from './lib/gemini';
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
  Shapes
} from '@phosphor-icons/react';

import Landing from './Landing';

const API_KEY = import.meta.env.VITE_GOOGLE_GEMINI_API_KEY || "";

export default function App() {
  const [isStarted, setIsStarted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
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

  const colorFileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

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
    { label: '11x8.5 Landscape', value: '11x8.5 Landscape' },
    { label: '8.5x11 Portrait', value: '8.5x11 Portrait' },
    { label: '11x17 Foldout', value: '11x17 Foldout' },
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
    if (generatedImages.length === 0) return;
    const base64Url = generatedImages[selectedImageIndex];
    if (!base64Url) return;

    const img = new Image();
    img.src = base64Url;
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
        a.download = `federal-infographic-v${selectedImageIndex + 1}.${format}`;
        a.click();
      }
    };
  };

  const submitRevision = async () => {
    if (!revisionPrompt.trim() || generatedImages.length === 0) return;
    setIsReviseLoading(true);
    setError('');

    const targetBase64 = generatedImages[selectedImageIndex];

    try {
      const payloadColors = extractedPalette.length > 0
        ? [primaryColor, accentColor, ...extractedPalette.filter(c => c !== primaryColor && c !== accentColor)]
        : [primaryColor, accentColor];

      const newImgUrl = await generateInfographicImage(
        topic,
        API_KEY,
        payloadColors,
        selectedFont,
        headerLogo,
        density,
        flow,
        orientation,
        accessibility,
        iconography,
        isTransparent,
        targetBase64,
        revisionPrompt
      );

      setGeneratedImages(prev => {
        const copy = [...prev];
        copy[selectedImageIndex] = newImgUrl;
        return copy;
      });
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
    if (!topic.trim() || !API_KEY) return;

    setIsLoading(true);
    setGeneratedImages([]);
    setSelectedImageIndex(0);
    setError('');

    try {
      const payloadColors = extractedPalette.length > 0
        ? [primaryColor, accentColor, ...extractedPalette.filter(c => c !== primaryColor && c !== accentColor)]
        : [primaryColor, accentColor];

      // Generate 3 distinct variants at once for selection
      const promises = [1, 2, 3].map(() =>
        generateInfographicImage(
          topic,
          API_KEY,
          payloadColors,
          selectedFont,
          headerLogo,
          density,
          flow,
          orientation,
          accessibility,
          iconography,
          isTransparent
        )
      );

      const imgUrls = await Promise.all(promises);
      setGeneratedImages(imgUrls);
    } catch (err) {
      setError('Generation failed. Please try a different topic or check your API key.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isStarted) {
    return <Landing onStart={() => setIsStarted(true)} />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-zinc-50 font-sans p-4 relative overflow-hidden">
        {/* Background Decor */}
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
      <section className="w-full md:w-[35%] lg:w-[30%] min-h-[50dvh] md:max-h-screen overflow-y-auto bg-white border-r border-zinc-200 shadow-[20px_0_40px_-20px_rgba(0,0,0,0.03)] flex flex-col p-8 md:p-12 z-10 shrink-0">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col h-full"
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-10">
            <img src="/BA-logo-black.png" alt="B&A Logo" className="h-8 w-auto object-contain mix-blend-multiply opacity-90" />
            <div className="border-l border-zinc-300 pl-3 py-0.5">
              <h1 className="text-sm font-bold tracking-tight text-zinc-950 uppercase leading-none mb-1">Federal Infographic Toolkit</h1>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-none">Compliance & Proposals</p>
            </div>
          </div>

          <div className="flex-grow">
            <h2 className="text-4xl text-zinc-900 tracking-tighter leading-[1.1] mb-4">
              Visual <br /> Framework
            </h2>
            <p className="text-zinc-600 mb-8 max-w-[32ch] leading-relaxed text-[15px]">
              Configure your typography, inject logos, auto-extract palettes, and compose native visuals.
            </p>

            {/* Input Form */}
            <form onSubmit={handleGenerate} className="flex flex-col gap-8">

              {/* Customization: Typography */}
              <div className="flex flex-col gap-3">
                <label className="text-[13px] font-semibold text-zinc-900 tracking-wide uppercase flex items-center gap-2">
                  <TextAa className="w-4 h-4 text-zinc-500" /> Typography Standard
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
                      <span className={`text-[14px] font-medium text-zinc-800 ${f.value}`}>{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Customization: Information Density */}
              <div className="flex flex-col gap-3">
                <label className="text-[13px] font-semibold text-zinc-900 tracking-wide uppercase flex items-center gap-2">
                  <Faders className="w-4 h-4 text-zinc-500" /> Information Density
                </label>
                <div className="flex gap-2">
                  {densities.map((d) => (
                    <label
                      key={d.value}
                      className={`flex-1 relative flex flex-col items-center justify-center p-3 rounded-xl border cursor-pointer transition-all hover:bg-zinc-50 ${density === d.value ? 'ring-2 ring-zinc-950/20 border-zinc-950 bg-zinc-50' : 'border-zinc-200 bg-white'}`}
                    >
                      <input
                        type="radio"
                        name="densityGroup"
                        value={d.value}
                        checked={density === d.value}
                        onChange={(e) => setDensity(e.target.value as any)}
                        className="hidden"
                      />
                      <span className="text-[13px] font-bold text-zinc-800 tracking-tight leading-none mb-1">{d.label}</span>
                      <span className="text-[9px] text-zinc-500 font-medium text-center leading-[1.1] opacity-80">{d.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Customization: Graphic Flow */}
              <div className="flex flex-col gap-3 pt-2">
                <label className="text-[13px] font-semibold text-zinc-900 tracking-wide uppercase flex items-center gap-2">
                  <span className="w-4 h-4 border border-zinc-500 rounded-sm inline-flex"></span> Structure & Flow
                </label>
                <div className="flex flex-col gap-2">
                  {flows.map((f) => (
                    <label key={f.value} className={`relative flex items-center gap-3 p-3 rounded-xl border border-zinc-200 cursor-pointer transition-all hover:bg-zinc-50 ${flow === f.value ? 'ring-2 ring-zinc-950/20 border-zinc-950 bg-zinc-50' : 'bg-white'}`}>
                      <input
                        type="radio"
                        name="flowGroup"
                        value={f.value}
                        checked={flow === f.value}
                        onChange={(e) => setFlow(e.target.value)}
                        className="w-4 h-4 text-zinc-950 focus:ring-zinc-950"
                      />
                      <div className="flex flex-col">
                        <span className="text-[14px] font-medium text-zinc-800">{f.label}</span>
                        <span className="text-[11px] font-medium text-zinc-500">{f.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Customization: Additional Federal Compliance Vectors */}
              <div className="flex flex-col gap-6 pt-4 border-t border-zinc-100">
                {/* Orientation */}
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-semibold text-zinc-900 tracking-wide uppercase flex items-center gap-2">
                    <FrameCorners className="w-4 h-4 text-zinc-500" /> Page Orientation
                  </label>
                  <div className="flex gap-2">
                    {orientations.map((o) => (
                      <label key={o.value} className={`flex-1 relative flex items-center justify-center p-2 rounded-lg border cursor-pointer transition-all hover:bg-zinc-50 ${orientation === o.value ? 'ring-2 ring-zinc-950/20 border-zinc-950 bg-zinc-50' : 'bg-white border-zinc-200'}`}>
                        <input type="radio" value={o.value} checked={orientation === o.value} onChange={(e) => setOrientation(e.target.value)} className="hidden" />
                        <span className="text-[11px] font-bold text-zinc-800 tracking-tight text-center leading-none">{o.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Section 508 */}
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-semibold text-zinc-900 tracking-wide uppercase flex items-center gap-2">
                    <Eye className="w-4 h-4 text-zinc-500" /> Section 508 Contrast Lock
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
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-semibold text-zinc-900 tracking-wide uppercase flex items-center gap-2">
                    <Shapes className="w-4 h-4 text-zinc-500" /> Iconography Strictness
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
                <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100">
                  <label className="text-[13px] font-semibold text-zinc-900 tracking-wide flex items-center justify-between gap-2 cursor-pointer group">
                    <span className="flex items-center gap-2 uppercase">
                      <PhosphorImage className="w-4 h-4 text-zinc-500" /> Alpha Channel (Transparent)
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
              </div>

              {/* Customization: Branding Logo */}
              <div className="flex flex-col gap-3 pt-4 border-t border-zinc-100">
                <label className="text-[13px] font-semibold text-zinc-900 tracking-wide uppercase flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><ImageIcon className="w-4 h-4 text-zinc-500" /> Organization Logo</span>
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
                    <span className="text-[11px] text-zinc-400 mt-0.5 text-center leading-tight">Will be injected into the top-left<br />of the final render.</span>
                  </div>
                ) : (
                  <div className="w-full border border-zinc-200 rounded-xl p-4 flex items-center justify-center bg-zinc-50/50 relative overflow-hidden h-[120px] group shadow-inner">
                    <img src={headerLogo} alt="Uploaded Logo" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                  </div>
                )}
              </div>

              {/* Customization: Colors via Image Upload */}
              <div className="flex flex-col gap-3 pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-semibold text-zinc-900 tracking-wide uppercase flex items-center gap-2 mt-2">
                    <Palette className="w-4 h-4 text-zinc-500" /> Color Architecture
                  </label>
                </div>

                {/* Upload Zone */}
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

                {/* Extracted Palette / Manual Fallback */}
                <div className="flex flex-col gap-2 mt-1">
                  {extractedPalette.length > 0 && (
                    <div className="flex items-center gap-2 w-full justify-between mt-2">
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

                  <div className="flex gap-4 mt-2">
                    <div className="flex-1 flex flex-col gap-2">
                      <span className="text-xs text-zinc-500 font-medium">Primary Accent</span>
                      <label className="relative flex items-center h-12 w-full border border-zinc-200 rounded-xl overflow-hidden shadow-sm cursor-pointer hover:border-zinc-300 transition-colors">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="absolute -left-2 top-0 w-[200%] h-full cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                        />
                        <div className="ml-auto mr-3 px-2 py-1 bg-white border border-zinc-200 rounded-md text-xs font-mono text-zinc-600 shadow-sm pointer-events-none uppercase">
                          {primaryColor}
                        </div>
                      </label>
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <span className="text-xs text-zinc-500 font-medium">Secondary Line</span>
                      <label className="relative flex items-center h-12 w-full border border-zinc-200 rounded-xl overflow-hidden shadow-sm cursor-pointer hover:border-zinc-300 transition-colors">
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="absolute -left-2 top-0 w-[200%] h-full cursor-pointer bg-transparent border-none p-0 focus:outline-none"
                        />
                        <div className="ml-auto mr-3 px-2 py-1 bg-white border border-zinc-200 rounded-md text-xs font-mono text-zinc-600 shadow-sm pointer-events-none uppercase">
                          {accentColor}
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Infographic Prompt */}
              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100">
                <label htmlFor="topic" className="text-[13px] font-semibold text-zinc-900 tracking-wide uppercase flex items-center gap-2 mt-4">
                  <Article className="w-4 h-4 text-zinc-500" /> Proposal Subject Prompt
                </label>
                <div className="relative group">
                  <textarea
                    id="topic"
                    rows={3}
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Describe the overarching narrative or specific steps for the infographic... e.g. A 5-step phase plan for deploying a zero-trust network."
                    className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-zinc-950/10 focus:border-zinc-950 transition-all placeholder:text-zinc-400 font-medium text-zinc-900 shadow-sm resize-none"
                  />
                </div>
              </div>

              {!API_KEY && (
                <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 font-medium whitespace-pre-wrap">
                  API Key missing. Please set VITE_GOOGLE_GEMINI_API_KEY.
                </div>
              )}

              {error && (
                <div className="text-xs text-red-600 font-medium bg-red-50 p-3 rounded-lg border border-red-100">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !topic.trim()}
                className="group w-full py-4 px-4 bg-zinc-950 text-white font-medium text-[15px] flex items-center justify-center gap-2 rounded-xl transition-all hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:-translate-y-[1px] focus:outline-none active:scale-[0.98] active:translate-y-[1px] mt-2 shadow-md"
              >
                {isLoading ? (
                  <CircleNotch weight="bold" className="animate-spin w-5 h-5" />
                ) : (
                  <>
                    <span>Render Visual Asset</span>
                    <PaperPlaneTilt weight="fill" className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-10 pt-6 border-t border-zinc-100 flex items-center justify-between text-zinc-400 text-xs font-mono">
            <span>SYS: NANO-BANANA-2 (Image Composer)</span>
            <span>v3.0.1-LogoDensity</span>
          </div>
        </motion.div>
      </section>

      {/* RIGHT: Infographic Output */}
      <section className="flex-1 w-full flex items-center justify-center bg-zinc-100 relative p-6 md:p-12 h-screen overflow-y-auto pattern-dots pattern-zinc-200 pattern-size-4 pattern-opacity-50">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading-state"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center"
            >
              <div className="w-48 h-48 md:w-56 md:h-56 relative flex items-center justify-center">
                <img
                  src="/BA-logo-black.png"
                  alt="B&A Loading"
                  className="w-full h-full object-contain mix-blend-multiply animate-spin-burst opacity-90 filter drop-shadow-xl"
                />
              </div>
              <p className="mt-12 text-zinc-500 font-bold tracking-widest animate-pulse uppercase text-sm">Nano Banana rendering visual...</p>
            </motion.div>
          ) : generatedImages.length > 0 ? (
            <motion.div
              key="image-state"
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
              className="w-full max-w-5xl flex flex-col my-auto gap-6"
            >
              {/* Primary Image Display */}
              <div className={`w-full shadow-2xl rounded-xl overflow-hidden border-4 border-white flex flex-col relative ${isTransparent ? 'bg-zinc-100 pattern-isometric pattern-zinc-200 pattern-size-4 pattern-opacity-100' : 'bg-white'}`}>
                <img src={generatedImages[selectedImageIndex]} alt="Generated Infographic Selection" className="w-full h-auto object-contain z-10" />

                {/* Export Toolbar */}
                <div className="w-full bg-zinc-950 px-4 py-3 flex items-center justify-between z-20">
                  <div className="flex items-center gap-3">
                    <span className="text-white text-xs font-mono font-medium opacity-70">VARIANT {selectedImageIndex + 1}</span>
                    <button onClick={() => setIsRevising(!isRevising)} className={`px-2 py-1 text-[10px] uppercase tracking-wider rounded transition-colors font-bold cursor-pointer border ${isRevising ? 'bg-white text-zinc-950 border-white' : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>
                      {isRevising ? 'Cancel Edit' : 'Revise Variant'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-600 text-xs font-mono font-medium mr-1.5 hidden md:block">EXPORT</span>
                    <button onClick={() => downloadImage('png')} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-md transition-colors font-medium cursor-pointer">PNG</button>
                    <button onClick={() => downloadImage('jpeg')} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-md transition-colors font-medium cursor-pointer">JPEG</button>
                    <button onClick={() => downloadImage('webp')} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded-md transition-colors font-medium cursor-pointer">WEBP</button>
                  </div>
                </div>
              </div>

              {/* Revision Overlay/Drawer */}
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

              {/* Variant Selector Row */}
              <div className="flex items-center gap-4 justify-center w-full">
                {generatedImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`relative h-24 w-32 md:w-40 rounded-lg overflow-hidden border-4 transition-all focus:outline-none shadow-sm ${selectedImageIndex === idx ? 'border-zinc-950 scale-105 z-10 shadow-xl' : 'border-white opacity-60 hover:opacity-100 hover:scale-100'}`}
                  >
                    <img src={img} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-2 bg-zinc-950/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-md">V{idx + 1}</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 italic text-center font-medium opacity-80 -mt-2">
                Three highly-compliant architectural variants have been authored. Click to review alternatives.
              </p>
            </motion.div>
          ) : (
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
                Define the proposal subject, pick a compliant structure stream, extraction hex palette, and density level. Nano Banana 2.0 will structurally compose three independent graphic alternatives.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

    </div>
  );
}
