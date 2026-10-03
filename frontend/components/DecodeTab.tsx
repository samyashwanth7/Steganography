"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Unlock,
  Upload,
  Key,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Loader2,
  Copy,
  ExternalLink,
  Download,
  FileText,
  Globe,
  User,
  Eye,
  EyeOff,
  ShieldCheck,
  FileCheck,
  AlertCircle,
} from "lucide-react";

interface DecodedItem {
  key: string;
  type: "credentials" | "text" | "file" | "error";
  data?: any;
  message?: string;
  filename?: string;
  fileBlobUrl?: string;
  error?: string;
}

export default function DecodeTab() {
  const [carrierFile, setCarrierFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keys list
  const [keys, setKeys] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DecodedItem[] | null>(null);
  const [generalError, setGeneralError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      setCarrierFile(e.dataTransfer.files[0]);
      setResults(null);
      setGeneralError("");
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setCarrierFile(e.target.files[0]);
      setResults(null);
      setGeneralError("");
    }
  }, []);

  const addKey = () => setKeys((prev) => [...prev, ""]);
  const removeKey = (index: number) => {
    if (keys.length > 1) {
      setKeys((prev) => prev.filter((_, i) => i !== index));
    }
  };
  const updateKey = (index: number, val: string) => {
    setKeys((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const copyToClipboard = (text: string, identifier: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(identifier);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const togglePasswordReveal = (id: string) => {
    setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDecode = async () => {
    if (!carrierFile) {
      setGeneralError("Please select a carrier file to inspect.");
      return;
    }

    const activeKeys = keys.map((k) => k.trim()).filter(Boolean);
    if (activeKeys.length === 0) {
      setGeneralError("Please enter at least one secret key.");
      return;
    }

    setLoading(true);
    setGeneralError("");
    setResults(null);

    try {
      const form = new FormData();
      form.append("file", carrierFile);
      form.append("media", carrierFile);
      form.append("cover_media", carrierFile);
      form.append("keys", JSON.stringify(activeKeys));

      const res = await fetch("/api/decode-batch", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || "Decryption failed. Ensure the file has not been corrupted.");
      }

      const resData = await res.json();
      const rawResults = resData.results || {};

      const parsedItems: DecodedItem[] = activeKeys.map((key) => {
        const item = rawResults[key];
        if (!item || item.error) {
          return { key, type: "error", error: item?.error || "No payload found for this key" };
        }

        if (item.type === "text" && item.message) {
          // Check if message is JSON credentials
          try {
            const parsed = JSON.parse(item.message);
            if (parsed && (parsed.type === "credentials" || parsed.website || parsed.username || parsed.password)) {
              return {
                key,
                type: "credentials",
                data: parsed,
              };
            }
          } catch {
            // regular text
          }
          return {
            key,
            type: "text",
            message: item.message,
          };
        }

        if (item.type === "file" && item.data) {
          // base64 file
          try {
            const byteCharacters = atob(item.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/octet-stream" });
            const blobUrl = URL.createObjectURL(blob);
            return {
              key,
              type: "file",
              filename: item.filename || "decrypted_secret_file",
              fileBlobUrl: blobUrl,
            };
          } catch (e) {
            return { key, type: "error", error: "Failed to reconstruct secret file bytes." };
          }
        }

        return { key, type: "error", error: "Unrecognized payload format" };
      });

      setResults(parsedItems);
    } catch (err: any) {
      setGeneralError(err.message || "Failed to communicate with decoding engine.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Tab Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 steno-surface rounded-2xl border border-white/[0.08]">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-red-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Unlock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Decryption & Extraction Studio</h2>
            <p className="text-xs text-zinc-400">Extract multiple encrypted secrets embedded inside any carrier media.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 px-3 py-1.5 rounded-lg bg-black/40 border border-white/5">
          <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
          <span>ZERO CORRUPTION DECODER</span>
        </div>
      </div>

      {/* Step 1: Carrier Dropzone */}
      <div className="space-y-3">
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
          <span>1. Select Encrypted Carrier Media</span>
          {carrierFile && <span className="text-green-400 font-normal">({carrierFile.name})</span>}
        </label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
            dragActive
              ? "border-red-500 bg-red-950/20 scale-[0.99]"
              : carrierFile
              ? "border-amber-500/50 bg-amber-950/10 hover:border-amber-500"
              : "border-zinc-800 hover:border-zinc-600 bg-zinc-950/40 hover:bg-zinc-900/40"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          {carrierFile ? (
            <div className="flex flex-col items-center gap-2">
              <FileCheck className="w-10 h-10 text-amber-400 animate-pulse" />
              <p className="text-sm font-semibold text-white">{carrierFile.name}</p>
              <p className="text-xs text-zinc-400 font-mono">{(carrierFile.size / 1024).toFixed(1)} KB • Click to swap file</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-9 h-9 text-zinc-500 mb-1" />
              <p className="text-sm font-medium text-zinc-200">Drop your carrier file here or click to browse</p>
              <p className="text-xs text-zinc-500">Supports PNG, JPG, WebP images · WAV, MP3 audio · TXT files</p>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Secret Keys Matrix */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
            <span>2. Decryption Key(s)</span>
            <span className="text-zinc-500 font-normal">({keys.length} specified)</span>
          </label>
          <button
            type="button"
            onClick={addKey}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Key</span>
          </button>
        </div>

        <div className="space-y-2.5">
          {keys.map((k, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Key className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={k}
                  onChange={(e) => updateKey(index, e.target.value)}
                  placeholder={`Secret Key #${index + 1}...`}
                  className="glass-input pl-10 pr-4 font-mono text-sm"
                />
              </div>
              {keys.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeKey(index)}
                  className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-900/50 transition-colors"
                  title="Remove this key"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action Button */}
      {generalError && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{generalError}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleDecode}
        disabled={loading || !carrierFile}
        className="w-full btn-primary py-4 text-base font-semibold tracking-wider uppercase flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Decrypting Carrier Payloads...</span>
          </>
        ) : (
          <>
            <Unlock className="w-5 h-5" />
            <span>Extract & Reveal Secrets</span>
          </>
        )}
      </button>

      {/* Step 3: Decrypted Results Display */}
      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 pt-4 border-t border-white/[0.08]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                <span>Decrypted Payloads</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-mono">
                  {results.filter((r) => r.type !== "error").length} of {results.length} unlocked
                </span>
              </h3>
            </div>

            <div className="space-y-4">
              {results.map((item, idx) => {
                const isError = item.type === "error";

                return (
                  <div
                    key={idx}
                    className={`steno-card p-5 transition-all ${
                      isError
                        ? "border-red-900/30 bg-red-950/10"
                        : "border-green-500/30 bg-green-950/10 hover:border-green-500/50"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-white/[0.06]">
                      <div className="flex items-center gap-2">
                        {isError ? (
                          <XCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        )}
                        <span className="text-xs font-mono text-zinc-400">
                          Key: <span className="text-zinc-200 font-semibold">{item.key}</span>
                        </span>
                      </div>
                      <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full uppercase ${
                        isError ? "text-red-400 bg-red-950/40" : "text-green-400 bg-green-950/40 border border-green-800/40"
                      }`}>
                        {item.type}
                      </span>
                    </div>

                    {/* Content: Credentials */}
                    {item.type === "credentials" && item.data && (
                      <div className="space-y-3 pt-1">
                        {item.data.website && (
                          <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Globe className="w-4 h-4 text-zinc-400 shrink-0" />
                              <span className="text-xs text-zinc-400 uppercase tracking-wider shrink-0">Website:</span>
                              <span className="text-sm font-medium text-white truncate">{item.data.website}</span>
                            </div>
                            <a
                              href={item.data.website.startsWith("http") ? item.data.website : `https://${item.data.website}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 shrink-0 ml-2"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}

                        {item.data.username && (
                          <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <User className="w-4 h-4 text-zinc-400 shrink-0" />
                              <span className="text-xs text-zinc-400 uppercase tracking-wider shrink-0">Username:</span>
                              <span className="text-sm font-mono text-zinc-100 truncate">{item.data.username}</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(item.data.username, `user_${idx}`)}
                              className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 shrink-0 ml-2"
                            >
                              <Copy className="w-3 h-3" />
                              <span>{copiedKey === `user_${idx}` ? "Copied!" : "Copy"}</span>
                            </button>
                          </div>
                        )}

                        {item.data.password && (
                          <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Key className="w-4 h-4 text-amber-400 shrink-0" />
                              <span className="text-xs text-zinc-400 uppercase tracking-wider shrink-0">Password:</span>
                              <span className="text-sm font-mono text-amber-300 truncate">
                                {revealedPasswords[`pwd_${idx}`] ? item.data.password : "••••••••••••"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              <button
                                onClick={() => togglePasswordReveal(`pwd_${idx}`)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
                                title="Toggle visibility"
                              >
                                {revealedPasswords[`pwd_${idx}`] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => copyToClipboard(item.data.password, `pwd_${idx}`)}
                                className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" />
                                <span>{copiedKey === `pwd_${idx}` ? "Copied!" : "Copy"}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content: Plain Text */}
                    {item.type === "text" && item.message && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span className="flex items-center gap-1.5 font-medium">
                            <FileText className="w-3.5 h-3.5 text-zinc-300" />
                            Secret Text Content ({item.message.length} characters)
                          </span>
                          <button
                            onClick={() => copyToClipboard(item.message!, `txt_${idx}`)}
                            className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            <span>{copiedKey === `txt_${idx}` ? "Copied!" : "Copy Message"}</span>
                          </button>
                        </div>
                        <pre className="p-4 rounded-xl bg-black/60 border border-white/5 font-mono text-sm text-zinc-200 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                          {item.message}
                        </pre>
                      </div>
                    )}

                    {/* Content: File Asset */}
                    {item.type === "file" && item.fileBlobUrl && (
                      <div className="flex items-center justify-between p-4 rounded-xl bg-black/40 border border-white/5">
                        <div className="flex items-center gap-3">
                          <FileText className="w-8 h-8 text-amber-400" />
                          <div>
                            <p className="text-sm font-semibold text-white">{item.filename}</p>
                            <p className="text-xs text-zinc-500">Decrypted binary payload</p>
                          </div>
                        </div>
                        <a
                          href={item.fileBlobUrl}
                          download={item.filename}
                          className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download File</span>
                        </a>
                      </div>
                    )}

                    {/* Content: Error / Unmatched */}
                    {isError && (
                      <p className="text-xs text-red-400/90 italic">
                        {item.error || "Decryption failed. The provided key signature does not match any payload in the carrier."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
