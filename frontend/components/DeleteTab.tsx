"use client";

import { useState, useRef } from "react";
import { Eraser, Key, Upload, Loader2, CheckCircle2, Download, AlertTriangle, FileCheck, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function DeleteTab() {
  const [file, setFile] = useState<File | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0]);
      setError("");
      setResult(null);
    }
  };

  const handleDelete = async () => {
    if (!file || !secretKey.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("media", file);
      form.append("cover_media", file);
      form.append("key", secretKey.trim());

      const res = await fetch("/api/delete", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || "Scrub operation failed. Verify your secret key.");
      }

      const cleanedBlob = await res.blob();
      setResult(cleanedBlob);
    } catch (err: any) {
      setError(err.message || "Failed to scrub secret.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result || !file) return;
    const url = URL.createObjectURL(result);
    const a = document.createElement("a");
    a.href = url;
    const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : ".png";
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    a.download = `${nameWithoutExt}_scrubbed${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 steno-surface rounded-2xl border border-white/[0.08]">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600/20 to-orange-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
            <Eraser className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Surgical Secret Scrubber</h2>
            <p className="text-xs text-zinc-400">Permanently erase a single payload from a carrier while preserving all other secrets intact.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 px-3 py-1.5 rounded-lg bg-black/40 border border-white/5">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span>MANIFEST EXPUNGEMENT</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* Step 1: Upload Carrier */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                1. Select Carrier Media with Secret to Purge
              </label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
                  file
                    ? "border-amber-500/50 bg-amber-950/10"
                    : "border-zinc-800 hover:border-zinc-600 bg-zinc-950/40 hover:bg-zinc-900/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setFile(e.target.files[0]);
                  }}
                />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileCheck className="w-10 h-10 text-amber-400" />
                    <p className="text-sm font-semibold text-white">{file.name}</p>
                    <p className="text-xs text-zinc-400 font-mono">{(file.size / 1024).toFixed(1)} KB • Click to swap</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-9 h-9 text-zinc-500 mb-1" />
                    <p className="text-sm font-medium text-zinc-200">Drop your carrier file here or click to browse</p>
                    <p className="text-xs text-zinc-500">Supports images, audio, or text carriers</p>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Secret Key to Scrub */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                2. Key Signature of the Secret to Erase
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Enter the exact key for the secret you wish to destroy..."
                  className="glass-input pl-10 pr-4 font-mono text-sm"
                />
              </div>
              <p className="text-[11px] text-zinc-500">
                The cryptographic manifest entry matching this key signature will be scrubbed, leaving no trace.
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-sm flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleDelete}
              disabled={!file || !secretKey.trim() || loading}
              className="w-full btn-primary py-4 text-base font-semibold tracking-wider uppercase flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Expunging Secret from Carrier...</span>
                </>
              ) : (
                <>
                  <Eraser className="w-5 h-5" />
                  <span>Permanently Scrub Secret</span>
                </>
              )}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="steno-card p-8 text-center space-y-6 border-green-500/30 bg-green-950/10"
          >
            <div className="w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto text-green-400 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">Secret Successfully Expunged</h3>
              <p className="text-sm text-zinc-400 max-w-md mx-auto mt-1.5">
                The payload associated with your key has been securely overwritten and removed from the carrier manifest.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                onClick={() => { setFile(null); setSecretKey(""); setResult(null); }}
                className="btn-secondary"
              >
                Scrub Another File
              </button>
              <button onClick={handleDownload} className="btn-primary flex items-center gap-2">
                <Download className="w-4 h-4" />
                <span>Download Scrubbed Carrier</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
