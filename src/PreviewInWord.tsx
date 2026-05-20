import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadSimple, FileDoc, Trash } from '@phosphor-icons/react';

// Lorem-flavored placeholder text written to look like a federal proposal
// paragraph (not actual Latin lorem ipsum so it reads more naturally).
const PROPOSAL_LOREM = `The proposed approach integrates secure access controls with continuous monitoring, allowing the program office to maintain an audit-traceable posture throughout the period of performance. Our team brings deep familiarity with the agency's existing systems of record, the regulatory environment, and the operational tempo at which engineers and analysts work day to day. We will phase implementation across discovery, validation, and operationalization, with weekly stakeholder syncs and a single accountable program manager. The combined approach reduces transition risk, accelerates time-to-mission-value, and aligns with the evaluation criteria expressed in Section M. Throughout execution, we will instrument our delivery against the FAR and agency-specific standards referenced in the solicitation, and our quality processes are independently audited under ISO 9001 and CMMI Level 3.`;

const PROPOSAL_LOREM_2 = `Where appropriate, we will substitute legacy data-handling patterns with modern equivalents that preserve compatibility with existing downstream consumers. Knowledge transfer to the government workforce is built into every phase, supported by living documentation, recorded sessions, and shadowing assignments. The result is a delivery that is repeatable, defensible during oversight review, and prepared for sustainment well beyond the initial period of performance.`;

interface Props {
  open: boolean;
  imageUrl: string | null;
  imageName?: string;
  onClose: () => void;
}

type WrapMode = 'inline' | 'left-wrap' | 'centered';

const PreviewInWord: React.FC<Props> = ({ open, imageUrl, imageName, onClose }) => {
  const [widthInches, setWidthInches] = useState(4);
  const [wrap, setWrap] = useState<WrapMode>('left-wrap');
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  // The mock page is rendered at this many CSS pixels wide. 8.5" × 72 px/in,
  // scaled to fit the modal width pleasantly. Both axes scale together so
  // proportions stay correct.
  const PAGE_PX_WIDTH = 612;          // 8.5"
  const PAGE_PX_HEIGHT = 792;          // 11"
  const MARGIN_PX = 72;                // 1" margins
  const CONTENT_WIDTH_IN = 6.5;
  const CONTENT_WIDTH_PX = PAGE_PX_WIDTH - MARGIN_PX * 2;
  const imageWidthPx = (widthInches / CONTENT_WIDTH_IN) * CONTENT_WIDTH_PX;

  const effectiveImage = uploaded || imageUrl;
  const effectiveName = uploaded ? uploadedName : (imageName || 'Variant');

  // Reset uploaded image when the modal closes so re-opening with a different
  // variant doesn't show the old upload.
  useEffect(() => {
    if (!open) {
      setUploaded(null);
      setUploadedName('');
    }
  }, [open]);

  if (!open) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploaded(ev.target?.result as string);
      setUploadedName(f.name);
    };
    reader.readAsDataURL(f);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6 cursor-pointer"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-100 rounded-xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col cursor-default"
      >
        <header className="px-6 py-4 bg-white border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileDoc weight="fill" className="w-4 h-4 text-zinc-700" />
            <h2 className="text-sm font-bold tracking-tight text-zinc-950 uppercase">Preview in Word</h2>
            <span className="text-[10px] font-mono text-zinc-400 hidden md:inline">— how the graphic will flow with proposal body text</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-950 text-xl leading-none px-2">×</button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 flex gap-6">
          {/* Controls */}
          <aside className="w-56 shrink-0 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Width</label>
                <span className="text-[11px] font-mono text-zinc-700">{widthInches.toFixed(2)}"</span>
              </div>
              <input
                type="range"
                min="1.5"
                max="6.5"
                step="0.25"
                value={widthInches}
                onChange={(e) => setWidthInches(parseFloat(e.target.value))}
                className="w-full accent-zinc-950"
              />
              <div className="flex justify-between gap-1 mt-1">
                {[
                  { label: 'XS', value: 2 },
                  { label: 'S', value: 3 },
                  { label: 'M', value: 4.5 },
                  { label: 'L', value: 6 },
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setWidthInches(p.value)}
                    className={`flex-1 px-1 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors ${Math.abs(widthInches - p.value) < 0.01 ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Wrap mode</label>
              <div className="flex flex-col gap-1">
                {([
                  { value: 'left-wrap', label: 'Wrap left', desc: 'Text flows around image (typical)' },
                  { value: 'inline', label: 'Inline w/ text', desc: 'Image sits in a line of text' },
                  { value: 'centered', label: 'Centered block', desc: 'Image breaks the column' },
                ] as { value: WrapMode; label: string; desc: string }[]).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWrap(opt.value)}
                    className={`text-left px-2.5 py-2 rounded-md border transition-colors ${wrap === opt.value ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'}`}
                  >
                    <div className="text-[11px] font-bold leading-none mb-0.5">{opt.label}</div>
                    <div className={`text-[9px] leading-tight ${wrap === opt.value ? 'text-zinc-300' : 'text-zinc-500'}`}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-3 border-t border-zinc-200">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Or preview your own image</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-zinc-200 rounded-lg py-2 px-2 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
              >
                <UploadSimple className="w-3.5 h-3.5 text-zinc-500 mb-1" />
                <span className="text-[11px] font-medium text-zinc-600">{uploaded ? 'Replace upload' : 'Upload an image'}</span>
                <span className="text-[9px] text-zinc-400 mt-0.5">PNG, JPEG, WebP</span>
              </button>
              {uploaded && (
                <button
                  type="button"
                  onClick={() => { setUploaded(null); setUploadedName(''); }}
                  className="self-start text-[10px] uppercase tracking-widest font-bold text-zinc-500 hover:text-red-600 flex items-center gap-1"
                >
                  <Trash className="w-3 h-3" /> Use selected variant instead
                </button>
              )}
            </div>

            <p className="text-[10px] text-zinc-500 leading-snug">
              This is an approximate flow simulation, not pixel-perfect Word output. Use it to gauge sizing before pasting into a real proposal document.
            </p>
          </aside>

          {/* Mock Word page */}
          <div className="flex-1 flex flex-col items-center gap-3 min-w-0">
            <div className="text-[10px] font-mono text-zinc-500">
              {effectiveName} · {widthInches.toFixed(2)}" wide · {wrap === 'left-wrap' ? 'Wrap left' : wrap === 'inline' ? 'Inline' : 'Centered'}
            </div>
            <div
              className="bg-white shadow-2xl"
              style={{
                width: PAGE_PX_WIDTH,
                minHeight: PAGE_PX_HEIGHT,
                padding: MARGIN_PX,
                fontFamily: '"Times New Roman", Times, serif',
                fontSize: 11,
                lineHeight: 1.45,
                color: '#0a0a0a',
              }}
            >
              <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>2.3 Technical Approach</h1>
              <p style={{ fontSize: 10, color: '#666', fontStyle: 'italic', marginBottom: 14 }}>Section L, Tab C · Page 14 of 25</p>

              {effectiveImage ? (
                wrap === 'left-wrap' ? (
                  <>
                    <p style={{ margin: 0 }}>
                      <img
                        src={effectiveImage}
                        alt="Selected variant"
                        style={{
                          width: imageWidthPx,
                          float: 'left',
                          marginRight: 12,
                          marginBottom: 6,
                          border: '1px solid #e4e4e7',
                        }}
                      />
                      {PROPOSAL_LOREM}
                    </p>
                    <p style={{ marginTop: 10, clear: 'left' }}>{PROPOSAL_LOREM_2}</p>
                  </>
                ) : wrap === 'inline' ? (
                  <p style={{ margin: 0 }}>
                    {PROPOSAL_LOREM.slice(0, 220)}
                    <img
                      src={effectiveImage}
                      alt="Selected variant"
                      style={{
                        width: imageWidthPx,
                        display: 'inline-block',
                        verticalAlign: 'middle',
                        margin: '0 6px',
                        border: '1px solid #e4e4e7',
                      }}
                    />
                    {PROPOSAL_LOREM.slice(220)} {PROPOSAL_LOREM_2}
                  </p>
                ) : (
                  <>
                    <p style={{ margin: 0 }}>{PROPOSAL_LOREM.slice(0, 280)}</p>
                    <div style={{ textAlign: 'center', margin: '14px 0' }}>
                      <img
                        src={effectiveImage}
                        alt="Selected variant"
                        style={{
                          width: imageWidthPx,
                          display: 'inline-block',
                          border: '1px solid #e4e4e7',
                        }}
                      />
                      <div style={{ fontSize: 9, color: '#666', fontStyle: 'italic', marginTop: 4 }}>
                        Figure 1. {effectiveName}
                      </div>
                    </div>
                    <p style={{ margin: 0 }}>{PROPOSAL_LOREM.slice(280)} {PROPOSAL_LOREM_2}</p>
                  </>
                )
              ) : (
                <p style={{ margin: 0, color: '#999', fontStyle: 'italic' }}>
                  No image to preview. Upload one using the panel on the left, or close this modal and select a variant first.
                </p>
              )}
            </div>
            <div className="text-[10px] text-zinc-400 font-mono">8.5" × 11" letter · 1" margins · Times New Roman 11pt body</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PreviewInWord;
