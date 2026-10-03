"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ShieldAlert,
  Fingerprint,
  Lock,
  EyeOff,
  Code,
  Layers,
  Sparkles,
  ArrowRight,
  Cpu,
  Binary,
  Volume2,
  FileText,
  Sliders,
  Check,
  Copy,
  Terminal,
  ShieldCheck,
  Eye,
  Radio,
} from "lucide-react";

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Interactive LSB Simulator State
  const [simulatorSecret, setSimulatorSecret] = useState("TOP_SECRET_SIGMA_9");
  const [lsbBits, setLsbBits] = useState(1);
  const [showZwcDebug, setShowZwcDebug] = useState(false);
  const [copiedZwc, setCopiedZwc] = useState(false);

  // Interactive Particle Mesh Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      alpha: number;
    }> = [];

    const numParticles = Math.min(width > 768 ? 65 : 30, 80);
    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: Math.random() * 1.8 + 0.8,
        alpha: Math.random() * 0.5 + 0.2,
      });
    }

    let mouseX = -1000;
    let mouseY = -1000;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener("mousemove", handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw particle lattice
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Draw node
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239, 68, 68, ${p.alpha * 0.6})`;
        ctx.fill();

        // Connect nearby nodes
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            const lineAlpha = (1 - dist / 130) * 0.15;
            ctx.strokeStyle = `rgba(239, 68, 68, ${lineAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // React to mouse
        const mdx = p.x - mouseX;
        const mdy = p.y - mouseY;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < 140) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouseX, mouseY);
          ctx.strokeStyle = `rgba(245, 158, 11, ${(1 - mdist / 140) * 0.35})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Compute live bitstream representation for simulator
  const binaryRepresentation = simulatorSecret
    .split("")
    .slice(0, 4)
    .map((c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
    .join(" ");

  return (
    <main ref={containerRef} className="relative min-h-screen bg-[#040406] text-zinc-100 overflow-x-hidden selection:bg-red-500/30 selection:text-white">
      {/* Background Interactive Lattice */}
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0 opacity-60" />

      {/* Atmospheric Radial Halos */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[25%] w-[800px] h-[800px] bg-red-600/10 blur-[180px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[15%] w-[700px] h-[700px] bg-amber-600/10 blur-[180px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(15,3,3,0.6)_0%,rgba(4,4,6,0.98)_85%)]" />
      </div>

      {/* Floating Top Navigation Dock */}
      <header className="fixed top-0 w-full z-50 px-4 sm:px-8 py-5">
        <nav className="max-w-6xl mx-auto flex items-center justify-between p-3.5 px-6 rounded-2xl bg-zinc-950/70 border border-white/[0.08] backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 p-[1px] shadow-[0_0_20px_rgba(239,68,68,0.4)]">
              <div className="w-full h-full bg-[#08080b] rounded-[11px] flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white font-heading">STENO</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-widest font-semibold">
                PROTOCOL
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-xs font-medium text-zinc-400">
            <a href="#simulator" className="hover:text-white transition-colors">LSB Simulator</a>
            <a href="#features" className="hover:text-white transition-colors">Architecture</a>
            <a href="#unicode" className="hover:text-white transition-colors">Zero-Width Text</a>
            <Link href="/admin" className="hover:text-red-400 transition-colors">Forensics</Link>
          </div>

          <Link
            href="/dashboard"
            className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs uppercase tracking-wider bg-gradient-to-r from-red-600 via-red-500 to-amber-600 text-white shadow-[0_0_25px_rgba(239,68,68,0.4)] hover:shadow-[0_0_35px_rgba(239,68,68,0.6)] active:scale-[0.98] transition-all"
          >
            <span>Launch Studio</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-40 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto flex flex-col items-center text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-mono uppercase tracking-widest mb-8 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>MILITARY-GRADE MULTI-PAYLOAD ENGINE</span>
        </motion.div>

        {/* Main Giant Kinetic Typography */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.7 }}
          className="text-5xl sm:text-7xl lg:text-8xl font-black uppercase tracking-tight text-white font-heading leading-none"
        >
          Conceal Secrets <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-400 to-amber-300">
            In Plain Sight
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="max-w-2xl text-base sm:text-lg text-zinc-400 mt-6 font-light leading-relaxed"
        >
          An advanced steganographic protocol. Embed multi-payload encrypted data into ordinary pixels, audio frequencies, and invisible Unicode spacing with zero perceptible distortion.
        </motion.p>

        {/* Primary Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.7 }}
          className="flex flex-col sm:flex-row items-center gap-4 mt-10 w-full sm:w-auto"
        >
          <Link
            href="/dashboard"
            className="w-full sm:w-auto btn-primary py-4 px-8 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-3 shadow-[0_0_35px_rgba(239,68,68,0.45)]"
          >
            <span>Open Cryptographic Studio</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#simulator"
            className="w-full sm:w-auto btn-secondary py-4 px-8 text-sm font-semibold uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>Interactive Simulator</span>
          </a>
        </motion.div>

        {/* Real-time Cryptographic Metrics Strip */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.8 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 w-full"
        >
          <MetricCard title="32,768 Bits" subtitle="Encrypted Manifest System" tag="4x Capacity" />
          <MetricCard title="AES-256-CBC" subtitle="PBKDF2 Cryptographic Salt" tag="NSA Approved" />
          <MetricCard title="0.00% Error" subtitle="Perceptual Invariance Delta" tag="Invisible" />
          <MetricCard title="3 Media Types" subtitle="Pixel, Audio & Invisible Text" tag="Multi-Engine" />
        </motion.div>
      </section>

      {/* Marquee Banner */}
      <div className="w-full py-3.5 bg-red-950/20 border-y border-red-900/30 overflow-hidden relative font-mono text-xs uppercase tracking-widest text-red-400/80">
        <div className="flex gap-8 whitespace-nowrap animate-[marquee_25s_linear_infinite]">
          <span>// ZERO AUDIBLE DISTORTION</span>
          <span>•</span>
          <span>// MULTI-TENANT SECRET COMPARTMENTS</span>
          <span>•</span>
          <span>// SURGICAL SECRET SCRUBBER</span>
          <span>•</span>
          <span>// INVISIBLE ZERO-WIDTH TEXT CARRIER</span>
          <span>•</span>
          <span>// FORENSIC MANIFEST DETECTOR</span>
          <span>•</span>
          <span>// AES-256-CBC HARDENED CIPHERS</span>
          <span>•</span>
          <span>// ZERO AUDIBLE DISTORTION</span>
          <span>•</span>
          <span>// MULTI-TENANT SECRET COMPARTMENTS</span>
        </div>
      </div>

      {/* Interactive LSB Simulator Section */}
      <section id="simulator" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-mono uppercase tracking-wider mb-3">
            <Binary className="w-3.5 h-3.5" />
            <span>Interactive Visualizer</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-white font-heading">
            How Pixel Steganography Works
          </h2>
          <p className="text-sm text-zinc-400 max-w-lg mx-auto mt-2">
            See in real-time how secret message bits replace the least significant bits (LSB) of RGB pixels without altering the visible image.
          </p>
        </div>

        <div className="steno-card p-6 sm:p-8 border-amber-500/20 shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Left: Interactive Controls */}
            <div className="space-y-6">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300 block mb-2">
                  Secret String to Hide in Pixel Data:
                </label>
                <input
                  type="text"
                  value={simulatorSecret}
                  onChange={(e) => setSimulatorSecret(e.target.value)}
                  maxLength={32}
                  className="glass-input font-mono text-sm"
                  placeholder="Type anything..."
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">
                  <span>LSB Embedding Depth:</span>
                  <span className="text-amber-400 font-mono">{lsbBits} bit(s) per subpixel</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  value={lsbBits}
                  onChange={(e) => setLsbBits(Number(e.target.value))}
                  className="w-full accent-red-500 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-zinc-500 font-mono mt-1">
                  <span>1 Bit (100% Invisible)</span>
                  <span>2 Bits (High Cap)</span>
                  <span>4 Bits (Extreme)</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/50 border border-white/5 space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>ASCII Binary Stream:</span>
                  <span className="text-amber-400">{simulatorSecret.length * 8} bits</span>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 tracking-widest break-all">
                  {binaryRepresentation} ...
                </div>
              </div>
            </div>

            {/* Right: Live Simulated Pixel Block */}
            <div className="p-6 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-red-400" />
                  Live Pixel Decomposition
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  DELTA &lt; 0.4%
                </span>
              </div>

              {/* Simulated 4-Pixel Cluster */}
              <div className="grid grid-cols-4 gap-2.5">
                {[1, 2, 3, 4].map((px) => (
                  <div key={px} className="p-3 rounded-xl bg-black/60 border border-white/5 text-center space-y-2">
                    <div
                      className="w-full h-12 rounded-lg shadow-inner border border-white/10 transition-colors"
                      style={{
                        backgroundColor: px % 2 === 0 ? "#1c2438" : "#241829",
                      }}
                    />
                    <span className="text-[10px] font-mono text-zinc-500 block">P{px} (RGBA)</span>
                    <div className="text-[9px] font-mono text-left space-y-0.5 text-zinc-400">
                      <div>R: ...{simulatorSecret ? (px * 3) % 2 : 0}</div>
                      <div>G: ...{simulatorSecret ? (px * 7) % 2 : 1}</div>
                      <div>B: ...{simulatorSecret ? (px * 5) % 2 : 0}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-zinc-400 leading-relaxed font-light">
                Notice: The LSB modifications alter the color value by less than 1/256th of an RGB step. To the human visual cortex, the original and stego image are mathematically indistinguishable.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Zero-Width Text Interactive Demo */}
      <section id="unicode" className="relative z-10 py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="steno-card p-6 sm:p-8 border-red-500/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-mono uppercase tracking-wider mb-2">
                <FileText className="w-3.5 h-3.5" />
                <span>Zero-Width Characters (ZWC)</span>
              </div>
              <h3 className="text-2xl font-bold text-white font-heading">
                Hide Entire Books Inside Plain Text
              </h3>
            </div>
            <button
              onClick={() => setShowZwcDebug(!showZwcDebug)}
              className="btn-secondary text-xs px-4 py-2 flex items-center gap-2 self-start md:self-auto"
            >
              <Eye className="w-3.5 h-3.5 text-red-400" />
              <span>{showZwcDebug ? "Hide Binary Spacing" : "Reveal Invisible Bits"}</span>
            </button>
          </div>

          <div className="p-5 rounded-xl bg-black/60 border border-white/5 font-mono text-sm leading-relaxed relative">
            <p className="text-zinc-300">
              The project report is finalized.
              {showZwcDebug ? (
                <span className="bg-red-500/30 text-red-300 px-1 py-0.5 rounded font-bold text-xs mx-1 border border-red-500/50">
                  [U+200B U+200C U+200D: SECRET_RECOVERED]
                </span>
              ) : (
                "\u200B\u200C\u200D\u200B\u200C"
              )}
              Please proceed with deployment at 0800 hours.
            </p>
          </div>
          <p className="text-xs text-zinc-500 mt-3 font-mono">
            Zero-Width Spaces (U+200B) and Zero-Width Non-Joiners (U+200C) occupy 0 pixels on screen but carry high-entropy AES binary streams.
          </p>
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="features" className="relative z-10 py-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-white font-heading">
            Cryptographic Architecture
          </h2>
          <p className="text-sm text-zinc-400 max-w-lg mx-auto mt-2">
            Why STENO outperforms conventional single-payload steganography systems.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={Layers}
            title="Multi-Payload Engine"
            desc="Embed multiple distinct, encrypted secret compartments inside a single carrier file. Each recipient receives their own secret key and can only decrypt their assigned payload."
          />
          <FeatureCard
            icon={Radio}
            title="Audio Frame Invariance"
            desc="Encodes data across the least significant bits of uncompressed WAV or converted audio frames, maintaining acoustic transparency across the full audible frequency spectrum."
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Surgical Secret Scrubbing"
            desc="Selectively expunge any single payload from the carrier manifest without damaging the file or disturbing any other embedded secret compartments."
          />
        </div>
      </section>

      {/* Bottom Giant CTA */}
      <section className="relative z-10 py-28 px-4 text-center max-w-4xl mx-auto">
        <div className="steno-card p-10 sm:p-14 relative overflow-hidden border-red-500/30">
          <div className="absolute inset-0 bg-gradient-to-b from-red-600/10 via-transparent to-transparent pointer-events-none" />
          <h2 className="text-4xl sm:text-5xl font-black uppercase tracking-tight text-white font-heading mb-4">
            Ready to Go Invisible?
          </h2>
          <p className="text-base text-zinc-400 max-w-xl mx-auto mb-8 font-light">
            Launch the studio now to encrypt, embed, and extract multi-payload secrets across images, audio, and invisible text carriers.
          </p>
          <Link
            href="/dashboard"
            className="btn-primary py-4 px-10 text-base font-bold uppercase tracking-wider inline-flex items-center gap-3 shadow-[0_0_40px_rgba(239,68,68,0.5)]"
          >
            <span>Launch STENO Studio</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8 px-6 text-center text-xs font-mono text-zinc-600 flex flex-col sm:flex-row items-center justify-between max-w-6xl mx-auto gap-4">
        <span>STENO PROTOCOL // V2.4 CORE // AES-256</span>
        <span>ZERO PERCEPTUAL DISTORTION STEGANOGRAPHY</span>
      </footer>
    </main>
  );
}

function MetricCard({ title, subtitle, tag }: { title: string; subtitle: string; tag: string }) {
  return (
    <div className="steno-card p-5 text-left relative overflow-hidden group hover:border-red-500/40 transition-colors">
      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-widest block w-fit mb-2">
        {tag}
      </span>
      <h3 className="text-2xl sm:text-3xl font-black text-white font-heading tracking-tight">{title}</h3>
      <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="steno-card p-7 text-left space-y-4 hover:border-red-500/30 transition-all group">
      <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-xl font-bold text-white font-heading tracking-tight">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed font-light">{desc}</p>
    </div>
  );
}
