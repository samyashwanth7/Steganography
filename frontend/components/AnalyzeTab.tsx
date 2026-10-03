"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanSearch,
  Upload,
  X,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  Info,
  CheckCircle2,
  Layers,
} from "lucide-react";

interface AnalysisResult {
  chi_square_probability: number;
  verdict: "Not detected" | "Suspicious" | "Likely stego";
  lsb_plane_png: string;
  psnr_db: number | null;
  changed_values_percent: number | null;
  width: number;
  height: number;
}

export default function AnalyzeTab() {
  const [suspectFile, setSuspectFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [suspectPreview, setSuspectPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suspectInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleSuspectSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (PNG, JPEG, WebP, BMP).");
      return;
    }
    setSuspectFile(file);
    setSuspectPreview(URL.createObjectURL(file));
    setError(null);
    setResult(null);
  };

  const handleCoverSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (PNG, JPEG, WebP, BMP).");
      return;
    }
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setError(null);
  };

  const clearSuspect = () => {
    setSuspectFile(null);
    if (suspectPreview) URL.revokeObjectURL(suspectPreview);
    setSuspectPreview(null);
    setResult(null);
  };

  const clearCover = () => {
    setCoverFile(null);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
  };

  const runAnalysis = async () => {
    if (!suspectFile) {
      setError("Please upload an image to analyze.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("media", suspectFile);
      if (coverFile) {
        formData.append("cover", coverFile);
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || errData?.message || "Analysis failed.");
      }

      const data: AnalysisResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Failed to run steganalysis.");
    } finally {
      setLoading(false);
    }
  };

  const getVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case "Not detected":
        return {
          bg: "bg-emerald-950/40 border-emerald-500/40 text-emerald-400",
          icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
          label: "Not Detected",
          desc: "Statistical distributions appear natural; no anomalous LSB pairs detected.",
        };
      case "Suspicious":
        return {
          bg: "bg-amber-950/40 border-amber-500/40 text-amber-400",
          icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
          label: "Suspicious",
          desc: "Slight histogram pair equalization observed. Possible altered bit planes.",
        };
      case "Likely stego":
      default:
        return {
          bg: "bg-red-950/40 border-red-500/40 text-red-400",
          icon: <ShieldAlert className="w-5 h-5 text-red-400" />,
          label: "Likely Steganography",
          desc: "High probability of payload embedding based on Westfeld-Pfitzmann Chi-Square analysis.",
        };
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ScanSearch className="w-5 h-5 text-red-500" />
          <h2 className="text-xl font-bold uppercase tracking-tight text-white font-heading">
            Steganalysis Lab
          </h2>
        </div>
        <p className="text-sm text-zinc-400">
          Inspect suspect images for embedded payloads using Westfeld-Pfitzmann Chi-Square analysis,
          LSB plane isolation, and optional PSNR delta comparisons.
        </p>
      </div>

      {/* Upload Dropzones Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Suspect Media (Required) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-semibold uppercase text-zinc-300">
              Suspect Image <span className="text-red-500">*</span>
            </label>
            {suspectFile && (
              <span className="text-[11px] font-mono text-zinc-500">
                {(suspectFile.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>

          {!suspectFile ? (
            <div
              onClick={() => suspectInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]) handleSuspectSelect(e.dataTransfer.files[0]);
              }}
              className="border-2 border-dashed border-red-900/40 hover:border-red-500/60 bg-black/30 hover:bg-black/40 rounded-xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[180px]"
            >
              <Upload className="w-8 h-8 text-zinc-500 mb-2 group-hover:text-red-400" />
              <p className="text-sm font-medium text-zinc-300">Upload Suspect Image</p>
              <p className="text-xs text-zinc-500 mt-1">PNG, JPG, WebP, or BMP</p>
            </div>
          ) : (
            <div className="relative bg-zinc-950 border border-white/10 rounded-xl p-3">
              <button
                onClick={clearSuspect}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/80 hover:bg-red-900/60 text-zinc-400 hover:text-white transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
              {suspectPreview && (
                <div className="h-40 flex items-center justify-center overflow-hidden rounded-lg bg-black/40">
                  <img
                    src={suspectPreview}
                    alt="Suspect cover"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
              <p className="text-xs font-mono text-zinc-300 truncate mt-2">{suspectFile.name}</p>
            </div>
          )}
          <input
            ref={suspectInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleSuspectSelect(e.target.files[0])}
          />
        </div>

        {/* Original Cover (Optional) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono font-semibold uppercase text-zinc-300">
              Original Cover <span className="text-zinc-500">(Optional for PSNR)</span>
            </label>
            {coverFile && (
              <span className="text-[11px] font-mono text-zinc-500">
                {(coverFile.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>

          {!coverFile ? (
            <div
              onClick={() => coverInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]) handleCoverSelect(e.dataTransfer.files[0]);
              }}
              className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-black/20 hover:bg-black/30 rounded-xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center min-h-[180px]"
            >
              <Layers className="w-8 h-8 text-zinc-600 mb-2" />
              <p className="text-sm font-medium text-zinc-400">Upload Original Clean Cover</p>
              <p className="text-xs text-zinc-600 mt-1">Computes exact PSNR &amp; bit delta %</p>
            </div>
          ) : (
            <div className="relative bg-zinc-950 border border-white/10 rounded-xl p-3">
              <button
                onClick={clearCover}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/80 hover:bg-red-900/60 text-zinc-400 hover:text-white transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
              {coverPreview && (
                <div className="h-40 flex items-center justify-center overflow-hidden rounded-lg bg-black/40">
                  <img
                    src={coverPreview}
                    alt="Original clean cover"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
              <p className="text-xs font-mono text-zinc-400 truncate mt-2">{coverFile.name}</p>
            </div>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleCoverSelect(e.target.files[0])}
          />
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-2">
        <button
          onClick={runAnalysis}
          disabled={!suspectFile || loading}
          className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 text-sm font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Analyzing Bit Planes &amp; Chi-Square Distributions...</span>
            </>
          ) : (
            <>
              <ScanSearch className="w-4 h-4" />
              <span>Run Steganalysis</span>
            </>
          )}
        </button>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-xl bg-red-950/30 border border-red-900/40 text-red-400 text-sm flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analysis Results Display */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6 pt-4 border-t border-white/[0.08]"
          >
            {/* Verdict Banner */}
            {(() => {
              const badge = getVerdictBadge(result.verdict);
              return (
                <div className={`p-5 rounded-xl border ${badge.bg} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
                  <div className="flex items-center gap-3.5">
                    {badge.icon}
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg font-bold uppercase tracking-tight">{badge.label}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                          p = {result.chi_square_probability.toFixed(4)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 max-w-xl">{badge.desc}</p>
                    </div>
                  </div>

                  {/* Probability Gauge */}
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-2xl font-bold font-mono">
                      {(result.chi_square_probability * 100).toFixed(1)}%
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
                      Embedding Probability
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-zinc-950/70 border border-white/[0.06] text-center">
                <span className="text-[11px] font-mono text-zinc-500 uppercase block mb-1">
                  Dimensions
                </span>
                <span className="text-base font-bold font-mono text-white">
                  {result.width} × {result.height}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950/70 border border-white/[0.06] text-center">
                <span className="text-[11px] font-mono text-zinc-500 uppercase block mb-1">
                  Chi-Square p-value
                </span>
                <span className="text-base font-bold font-mono text-amber-400">
                  {result.chi_square_probability.toFixed(4)}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950/70 border border-white/[0.06] text-center">
                <span className="text-[11px] font-mono text-zinc-500 uppercase block mb-1">
                  PSNR Delta
                </span>
                <span className="text-base font-bold font-mono text-white">
                  {result.psnr_db !== null ? `${result.psnr_db} dB` : "— (No Cover)"}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-zinc-950/70 border border-white/[0.06] text-center">
                <span className="text-[11px] font-mono text-zinc-500 uppercase block mb-1">
                  Changed Values
                </span>
                <span className="text-base font-bold font-mono text-white">
                  {result.changed_values_percent !== null
                    ? `${result.changed_values_percent}%`
                    : "— (No Cover)"}
                </span>
              </div>
            </div>

            {/* LSB Plane Visualizer */}
            <div className="p-6 rounded-xl bg-zinc-950 border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-tight text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Isolated LSB Plane (0x01 Bit Plane)
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Natural images display structural features in their LSB plane. Steganographic embedding produces uniform static noise.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Original Preview */}
                <div className="space-y-1.5 text-center">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">Input Image</span>
                  <div className="h-56 bg-black rounded-lg border border-white/5 flex items-center justify-center p-2 overflow-hidden">
                    {suspectPreview && (
                      <img
                        src={suspectPreview}
                        alt="Suspect input preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                  </div>
                </div>

                {/* LSB Plane Preview */}
                <div className="space-y-1.5 text-center">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase">LSB Bit Plane Mask</span>
                  <div className="h-56 bg-black rounded-lg border border-white/5 flex items-center justify-center p-2 overflow-hidden">
                    <img
                      src={`data:image/png;base64,${result.lsb_plane_png}`}
                      alt="LSB plane extraction"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
