
import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion';
import {
    ArrowRight,
    Target,
    FileText,
    PaintBrush,
    Sparkle
} from '@phosphor-icons/react';

interface LandingProps {
    onStart: () => void;
}

const FRAME_COUNT = 121;
function ScrollableExplosion() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    });

    const frameIndex = useTransform(scrollYProgress, [0, 1], [FRAME_COUNT, 1]);

    // We preload images into state or ref array
    const imagesRef = useRef<HTMLImageElement[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const images: HTMLImageElement[] = [];
        let loadedCount = 0;
        for (let i = 1; i <= FRAME_COUNT; i++) {
            const img = new Image();
            // Pads the number with leading zeros (e.g. 0001, 0002)
            const paddedIndex = String(i).padStart(4, '0');
            img.src = `/frames/frame_${paddedIndex}.jpg`;
            img.onload = () => {
                loadedCount++;
                if (loadedCount === FRAME_COUNT) {
                    setLoaded(true);
                }
            };
            images.push(img);
        }
        imagesRef.current = images;
    }, []);

    useMotionValueEvent(frameIndex, "change", (latest) => {
        if (!loaded || !canvasRef.current) return;
        const index = Math.min(FRAME_COUNT - 1, Math.max(0, Math.floor(latest) - 1));
        const ctx = canvasRef.current.getContext('2d');
        const img = imagesRef.current[index];
        if (ctx && img) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            // Draw image to fit canvas
            ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    });

    // Draw the fully exploded starting frame on load (which is the last image in array since the scroll plays in reverse)
    useEffect(() => {
        if (loaded && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            const img = imagesRef.current[FRAME_COUNT - 1];
            if (ctx && img) {
                ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
            }
        }
    }, [loaded]);

    return (
        <div className="w-full flex flex-col bg-white relative mt-12">
            {/* Smooth transition from Hero's zinc-50 to white */}
            <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-zinc-50 to-white z-10 pointer-events-none"></div>

            {/* Pre-animation explanation */}
            <div className="relative z-20 w-full flex flex-col items-center justify-center pt-32 pb-8 text-center px-6">
                <p className="text-zinc-500 font-light text-lg">
                    Scroll down to watch the AI seamlessly assemble the infographic from raw components.
                </p>
                <div className="mt-10 h-16 w-[1px] bg-gradient-to-b from-zinc-300 to-transparent"></div>
            </div>

            <section ref={containerRef} className="relative h-[300vh] w-full bg-white z-20">
                <div className="sticky top-0 h-screen w-full flex items-center justify-center overflow-hidden">
                    <div className="w-full max-w-5xl relative flex items-center justify-center pointer-events-none px-6">
                        {!loaded && (
                            <div className="absolute inset-0 flex items-center justify-center text-zinc-400 font-mono text-sm z-10">
                                Loading Engine Sequence...
                            </div>
                        )}

                        {/* Centered canvas to show off the explosion fully without cutting anything off */}
                        <div className="w-full aspect-[1300/708] relative bg-transparent">
                            <canvas
                                ref={canvasRef}
                                width={1300}
                                height={708}
                                className="w-full h-full object-contain mix-blend-multiply opacity-100 transition-opacity duration-1000"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Post-scroll explanation section based on User's RFQ constraint feedback */}
            <section className="py-24 px-6 max-w-4xl mx-auto flex flex-col items-center text-center bg-white relative z-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-200 bg-white/50 text-[10px] font-bold text-zinc-500 uppercase tracking-widest shadow-sm mb-8"
                >
                    <Sparkle weight="fill" className="w-3.5 h-3.5 text-zinc-400" /> Federal RFQ Compliance
                </motion.div>

                <h2 className="text-4xl md:text-5xl font-medium tracking-tighter text-zinc-950 leading-[1.05] mb-8">
                    Built for the strict constraints of <br />
                    <span className="italic text-zinc-400">government procurement.</span>
                </h2>

                <div className="flex flex-col gap-6 text-lg md:text-xl text-zinc-500 leading-relaxed font-light mt-2 max-w-3xl">
                    <p>
                        We know that federal RFQs often designate inflexible formatting constraints—whether it's enforcing exact Times New Roman specifications or requiring Flow Linear structuring.
                    </p>
                    <p>
                        Nano Banana Pro 2.0 is specifically tailored to adhere to these structural mandates effortlessly. By automating format compliance, we make it as easy as possible to utilize AI to generate highly technical, 100% compliant graphics that simply drop right into your proposals.
                    </p>
                </div>
            </section>
        </div>
    );
}

export default function Landing({ onStart }: LandingProps) {
    return (
        <div className="min-h-screen w-full bg-zinc-50 font-sans selection:bg-zinc-900 selection:text-white">
            {/* Navigation Bar */}
            <nav className="fixed top-0 w-full flex items-center justify-between px-8 py-6 z-50 bg-white/80 backdrop-blur-md border-b border-zinc-200/50">
                <div className="flex items-center gap-3">
                    <img src="/BA-logo-black.png" alt="B&A Logo" className="h-12 w-auto object-contain mix-blend-multiply opacity-90" />
                    <span className="font-semibold tracking-tight text-zinc-900 text-sm border-l border-zinc-300 pl-3">
                        Federal Infographic Toolkit
                    </span>
                </div>
                <button
                    onClick={onStart}
                    className="text-sm font-medium text-zinc-900 bg-zinc-100 hover:bg-zinc-200 px-4 py-2 rounded-full transition-colors hidden md:block"
                >
                    Access Portal
                </button>
            </nav>

            {/* Hero Section */}
            <main className="pt-40 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-zinc-200/50 rounded-full blur-3xl -z-10 opacity-50"></div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-8 shadow-sm"
                >
                    <Sparkle weight="fill" className="w-4 h-4 text-zinc-400" /> Powered by Nano Banana Pro 2.0
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
                    className="text-6xl md:text-8xl font-medium tracking-tighter text-zinc-950 leading-[0.95] max-w-4xl"
                >
                    Visual Supremacy for <br /><span className="italic text-zinc-500">Federal Capture.</span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                    className="mt-8 text-lg md:text-xl text-zinc-500 max-w-2xl leading-relaxed font-light"
                >
                    Transform sterile technical narratives into high-fidelity, compliance-ready visual architectures. Engineered specifically for complex government RFP responses.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
                    className="mt-12 flex flex-col sm:flex-row items-center gap-4"
                >
                    <button
                        onClick={onStart}
                        className="group px-8 py-4 bg-zinc-950 text-white rounded-2xl font-medium text-lg flex items-center gap-3 transition-all hover:bg-zinc-800 hover:shadow-2xl hover:shadow-zinc-900/20 active:scale-95"
                    >
                        Launch Visual Engine
                        <ArrowRight weight="bold" className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                </motion.div>

            </main>

            {/* Scrollable Video Canvas Sequence */}
            <ScrollableExplosion />

            {/* Features Grid */}
            <section className="bg-white border-t border-zinc-200 py-32 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

                        <div className="flex flex-col gap-4">
                            <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center border border-zinc-200">
                                <Target className="w-6 h-6 text-zinc-900" weight="duotone" />
                            </div>
                            <h3 className="text-xl font-bold tracking-tight text-zinc-900">RFP Native</h3>
                            <p className="text-zinc-500 leading-relaxed font-light">Built for the strict constraints of federal procurement. Every visual output complies with formal structural formatting requirements instantly.</p>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center border border-zinc-200">
                                <PaintBrush className="w-6 h-6 text-zinc-900" weight="duotone" />
                            </div>
                            <h3 className="text-xl font-bold tracking-tight text-zinc-900">Brand Extraction</h3>
                            <p className="text-zinc-500 leading-relaxed font-light">Upload any core document or logo and the engine automatically isolates up to 5 strict hexadecimal codes to lock down your corporate visual identity.</p>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center border border-zinc-200">
                                <FileText className="w-6 h-6 text-zinc-900" weight="duotone" />
                            </div>
                            <h3 className="text-xl font-bold tracking-tight text-zinc-900">Information Density</h3>
                            <p className="text-zinc-500 leading-relaxed font-light">Scale linearly from high-impact minimalist Executive Summaries down to granular, analytical data pipelines for Technical Volumes.</p>
                        </div>

                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="w-full border-t border-zinc-200 bg-zinc-50 py-12 px-6 flex flex-col md:flex-row items-center justify-between text-zinc-400 font-mono text-xs">
                <span>FEDERAL INFOGRAPHIC ENGINE // INTERNAL TOOL</span>
                <span>SECURE DEPLOYMENT</span>
            </footer>

        </div>
    );
}
