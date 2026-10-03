"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileText,
  FileAudio,
  Image as ImageIcon,
  File,
  Lock,
  Key,
  Globe,
  User,
  Loader2,
  Download,
  BookmarkPlus,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Copy,
  Type,
  Paperclip,
  KeyRound,
  Music,
  FileType,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PayloadMode = "text" | "file" | "credentials";

interface KeyStrengthResult {
  score: number;
  label: string;
  suggestions: string[];
}

interface PayloadEntry {
  id: string;
  mode: PayloadMode;
  expanded: boolean;
  // Text mode
  textMessage: string;
  // File mode
  file: File | null;
  // Credentials mode
  website: string;
  username: string;
  password: string;
  // Secret key
  secretKey: string;
  showSecretKey: boolean;
  showPassword: boolean;
  keyStrength: KeyStrengthResult | null;
  keyStrengthLoading: boolean;
}

type CoverMediaType = "image" | "audio" | "text" | null;

interface EncodeResult {
  blob: Blob;
  filename: string;
  mediaType: CoverMediaType;
  previewUrl: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];
const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg", ".m4a", ".flac"];
const TEXT_EXTENSIONS = [".txt"];

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/bmp";
const AUDIO_ACCEPT = "audio/wav,audio/mpeg,audio/ogg,audio/mp4,audio/flac,audio/x-wav";
const TEXT_ACCEPT = "text/plain";
const COVER_ACCEPT = `${IMAGE_ACCEPT},${AUDIO_ACCEPT},${TEXT_ACCEPT}`;

function detectMediaType(file: File): CoverMediaType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("text/")) return "text";
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (TEXT_EXTENSIONS.includes(ext)) return "text";
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function createEmptyPayload(): PayloadEntry {
  return {
    id: generateId(),
    mode: "text",
    expanded: true,
    textMessage: "",
    file: null,
    website: "",
    username: "",
    password: "",
    secretKey: "",
    showSecretKey: false,
    showPassword: false,
    keyStrength: null,
    keyStrengthLoading: false,
  };
}

function getPayloadSize(entry: PayloadEntry): number {
  switch (entry.mode) {
    case "text":
      return new TextEncoder().encode(entry.textMessage).length;
    case "file":
      return entry.file?.size ?? 0;
    case "credentials": {
      const data = JSON.stringify({
        website: entry.website,
        username: entry.username,
        password: entry.password,
      });
      return new TextEncoder().encode(data).length;
    }
    default:
      return 0;
  }
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callback(...args), delay);
    },
    [callback, delay]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debouncedFn;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function CoverMediaDropzone({
  coverFile,
  coverType,
  coverPreviewUrl,
  onDrop,
  onRemove,
}: {
  coverFile: File | null;
  coverType: CoverMediaType;
  coverPreviewUrl: string | null;
  onDrop: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onDrop(file);
    },
    [onDrop]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onDrop(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onDrop]
  );

  if (coverFile && coverType) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-black/40 border border-red-900/30 rounded-xl p-4"
      >
        <button
          onClick={onRemove}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-red-900/50 hover:bg-red-700/70 text-white transition-colors z-10"
          title="Remove cover media"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-4">
          {coverType === "image" && coverPreviewUrl && (
            <img
              src={coverPreviewUrl}
              alt="Cover preview"
              className="w-24 h-24 object-cover rounded-lg border border-red-900/30"
            />
          )}
          {coverType === "audio" && coverPreviewUrl && (
            <div className="flex-1 max-w-sm">
              <div className="flex items-center gap-3 mb-2">
                <Music className="w-8 h-8 text-red-400" />
                <span className="text-sm text-gray-300 truncate">
                  {coverFile.name}
                </span>
              </div>
              <audio
                controls
                src={coverPreviewUrl}
                className="w-full h-10 [&::-webkit-media-controls-panel]:bg-black/60"
              />
            </div>
          )}
          {coverType === "text" && (
            <div className="flex items-center gap-3">
              <FileType className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-sm text-white font-medium">
                  {coverFile.name}
                </p>
                <p className="text-xs text-gray-400">
                  {formatBytes(coverFile.size)}
                </p>
              </div>
            </div>
          )}

          {coverType === "image" && (
            <div className="flex-1">
              <p className="text-sm text-white font-medium truncate">
                {coverFile.name}
              </p>
              <p className="text-xs text-gray-400">
                {formatBytes(coverFile.size)}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
        dragOver
          ? "border-red-500 bg-red-950/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]"
          : "border-zinc-800 hover:border-zinc-600 bg-zinc-950/40 hover:bg-zinc-900/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={COVER_ACCEPT}
        onChange={handleFileInput}
        className="hidden"
      />
      <Upload
        className={`w-10 h-10 mx-auto mb-3 transition-colors ${
          dragOver ? "text-red-400" : "text-red-500/50"
        }`}
      />
      <p className="text-sm text-gray-300 mb-1">
        Drag & drop your carrier file here
      </p>
      <p className="text-xs text-gray-400">
        Images (PNG, JPG, WebP, BMP) · Audio (WAV, MP3, OGG, M4A, FLAC) · Text
        (TXT)
      </p>
    </div>
  );
}

function ModeButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-xl transition-all duration-200 ${
        active
          ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
          : "bg-zinc-900/60 text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function KeyStrengthBar({
  strength,
  loading,
}: {
  strength: KeyStrengthResult | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <Loader2 className="w-3.5 h-3.5 text-gray-300 animate-spin" />
        <span className="text-xs text-gray-400">Evaluating key strength…</span>
      </div>
    );
  }

  if (!strength) return null;

  const colorClass =
    strength.score >= 4
      ? "bg-green-500"
      : strength.score >= 3
      ? "bg-yellow-500"
      : "bg-red-500";

  const textColorClass =
    strength.score >= 4
      ? "text-green-400"
      : strength.score >= 3
      ? "text-yellow-400"
      : "text-red-400";

  const widthPercent = (strength.score / 5) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 space-y-1"
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${widthPercent}%` }}
            transition={{ duration: 0.4 }}
            className={`h-full rounded-full ${colorClass}`}
          />
        </div>
        <span className={`text-xs font-medium ${textColorClass}`}>
          {strength.label}
        </span>
      </div>
      {strength.suggestions.length > 0 && (
        <ul className="space-y-0.5">
          {strength.suggestions.map((s, i) => (
            <li key={i} className="text-xs text-gray-400 flex items-start gap-1">
              <span className="text-gray-600 mt-0.5">•</span>
              {s}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function CapacityBar({
  usedBytes,
  capacityBytes,
}: {
  usedBytes: number;
  capacityBytes: number;
}) {
  if (capacityBytes <= 0) return null;

  const pct = Math.min((usedBytes / capacityBytes) * 100, 100);
  const overCapacity = usedBytes > capacityBytes;

  const barColor =
    pct > 90
      ? "bg-red-500"
      : pct > 75
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-300">
          Payload: {formatBytes(usedBytes)} / {formatBytes(capacityBytes)}
        </span>
        <span
          className={`font-medium ${
            overCapacity ? "text-red-400" : pct > 75 ? "text-yellow-400" : "text-green-400"
          }`}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`h-full rounded-full ${barColor}`}
        />
      </div>
      {overCapacity && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-xs text-red-400"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>
            Payload exceeds capacity by{" "}
            {formatBytes(usedBytes - capacityBytes)}. Remove data or use a
            larger carrier.
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Payload Card ─────────────────────────────────────────────────────────────

function PayloadCard({
  entry,
  index,
  total,
  onUpdate,
  onDelete,
}: {
  entry: PayloadEntry;
  index: number;
  total: number;
  onUpdate: (patch: Partial<PayloadEntry>) => void;
  onDelete: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const checkKeyStrength = useDebouncedCallback(
    async (key: string) => {
      if (!key.trim()) {
        onUpdate({ keyStrength: null, keyStrengthLoading: false });
        return;
      }
      onUpdate({ keyStrengthLoading: true });
      try {
        const res = await fetch("/api/key-strength", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        if (res.ok) {
          const data: KeyStrengthResult = await res.json();
          onUpdate({
            keyStrength: data,
            keyStrengthLoading: false,
          });
        } else {
          onUpdate({ keyStrengthLoading: false });
        }
      } catch {
        onUpdate({ keyStrengthLoading: false });
      }
    },
    500
  );

  const handleGenerateKey = async () => {
    try {
      const res = await fetch("/api/generate-key", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const key = data.key || data.generated_key || "";
        onUpdate({
          secretKey: key,
          showSecretKey: true,
          keyStrength: null,
          keyStrengthLoading: true,
        });
        checkKeyStrength(key);
        // Automatically copy generated key to clipboard
        navigator.clipboard.writeText(key);
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2500);
      }
    } catch {
      // silently fail
    }
  };

  const handleSecretKeyChange = (value: string) => {
    onUpdate({
      secretKey: value,
      keyStrength: null,
      keyStrengthLoading: !!value.trim(),
    });
    checkKeyStrength(value);
  };

  const payloadSize = getPayloadSize(entry);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="steno-card overflow-hidden"
    >
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/[0.06]">
        <button
          type="button"
          onClick={() => onUpdate({ expanded: !entry.expanded })}
          className="flex items-center gap-2 text-sm font-medium text-gray-200 hover:text-white transition-colors"
        >
          {entry.expanded ? (
            <ChevronUp className="w-4 h-4 text-red-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-red-400" />
          )}
          <Lock className="w-3.5 h-3.5 text-red-500" />
          Secret #{index + 1}
          {payloadSize > 0 && (
            <span className="text-xs text-gray-400 font-normal ml-2">
              ({formatBytes(payloadSize)})
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          {total > 1 && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
              title="Remove this secret"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Card Body */}
      <AnimatePresence>
        {entry.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {/* Mode Switcher */}
              <div className="flex items-center gap-2">
                <ModeButton
                  active={entry.mode === "text"}
                  label="Text"
                  icon={Type}
                  onClick={() => onUpdate({ mode: "text" })}
                />
                <ModeButton
                  active={entry.mode === "file"}
                  label="File"
                  icon={Paperclip}
                  onClick={() => onUpdate({ mode: "file" })}
                />
                <ModeButton
                  active={entry.mode === "credentials"}
                  label="Credentials"
                  icon={KeyRound}
                  onClick={() => onUpdate({ mode: "credentials" })}
                />
              </div>

              {/* Mode Content */}
              <AnimatePresence mode="wait">
                {entry.mode === "text" && (
                  <motion.div
                    key="text"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <label className="block text-xs text-gray-300 mb-1.5">
                      Secret Message
                    </label>
                    <textarea
                      value={entry.textMessage}
                      onChange={(e) =>
                        onUpdate({ textMessage: e.target.value })
                      }
                      placeholder="Enter the text you want to hide..."
                      rows={4}
                      className="glass-input resize-none"
                    />
                  </motion.div>
                )}

                {entry.mode === "file" && (
                  <motion.div
                    key="file"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <label className="block text-xs text-gray-300 mb-1.5">
                      Secret File
                    </label>
                    {entry.file ? (
                      <div className="flex items-center gap-3 bg-black/40 border border-red-900/30 rounded-lg p-3">
                        <File className="w-8 h-8 text-red-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">
                            {entry.file.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatBytes(entry.file.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onUpdate({ file: null })}
                          className="p-1 rounded-full hover:bg-red-900/30 text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-red-900/40 rounded-lg p-6 text-center cursor-pointer hover:border-red-500/40 hover:bg-black/30 transition-all"
                      >
                        <Paperclip className="w-6 h-6 mx-auto mb-2 text-red-500/40" />
                        <p className="text-xs text-gray-400">
                          Click to select a file to hide
                        </p>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUpdate({ file: f });
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className="hidden"
                    />
                  </motion.div>
                )}

                {entry.mode === "credentials" && (
                  <motion.div
                    key="credentials"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-3"
                  >
                    {/* Website */}
                    <div>
                      <label className="block text-xs text-gray-300 mb-1.5">
                        Website URL
                      </label>
                      <div className="relative">
                        {entry.website && (
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(entry.website)}&sz=32`}
                            alt=""
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        )}
                        <Globe
                          className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600 ${
                            entry.website ? "left-3 hidden" : "left-3"
                          }`}
                        />
                        <input
                          type="text"
                          value={entry.website}
                          onChange={(e) =>
                            onUpdate({ website: e.target.value })
                          }
                          placeholder="https://example.com"
                          className="glass-input pl-10"
                        />
                      </div>
                    </div>

                    {/* Username */}
                    <div>
                      <label className="block text-xs text-gray-300 mb-1.5">
                        Username
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                        <input
                          type="text"
                          value={entry.username}
                          onChange={(e) =>
                            onUpdate({ username: e.target.value })
                          }
                          placeholder="username or email"
                          className="glass-input pl-10"
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div>
                      <label className="block text-xs text-gray-300 mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                        <input
                          type={entry.showPassword ? "text" : "password"}
                          value={entry.password}
                          onChange={(e) =>
                            onUpdate({ password: e.target.value })
                          }
                          placeholder="••••••••"
                          className="glass-input pl-10 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdate({
                              showPassword: !entry.showPassword,
                            })
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                        >
                          {entry.showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Secret Key */}
              <div className="pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-zinc-300 font-semibold uppercase tracking-wider">
                    <Key className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
                    Encryption Key
                  </label>
                  {entry.secretKey && (
                    <span className="text-[11px] font-mono text-zinc-500">
                      {entry.secretKey.length} characters
                    </span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type={entry.showSecretKey ? "text" : "password"}
                      value={entry.secretKey}
                      onChange={(e) => handleSecretKeyChange(e.target.value)}
                      placeholder="Enter secret key or click Generate..."
                      className="glass-input pl-4 pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate({
                          showSecretKey: !entry.showSecretKey,
                        })
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
                      title={entry.showSecretKey ? "Hide key" : "Show key"}
                    >
                      {entry.showSecretKey ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (entry.secretKey) {
                          navigator.clipboard.writeText(entry.secretKey);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 2000);
                        }
                      }}
                      disabled={!entry.secretKey}
                      className="btn-secondary text-xs px-3.5 py-2.5 flex items-center gap-1.5 whitespace-nowrap"
                      title="Copy Key to Clipboard"
                    >
                      {copiedKey ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateKey}
                      className="btn-secondary text-xs px-3.5 py-2.5 flex items-center gap-1.5 text-amber-400 hover:text-amber-300 border-amber-500/30 hover:border-amber-500/60 whitespace-nowrap"
                      title="Generate Strong 16-Character Key & Auto-Copy"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Generate</span>
                    </button>
                  </div>
                </div>
                <KeyStrengthBar
                  strength={entry.keyStrength}
                  loading={entry.keyStrengthLoading}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main EncodeTab Component ─────────────────────────────────────────────────

export default function EncodeTab() {
  // Cover media state
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverType, setCoverType] = useState<CoverMediaType>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [capacityBytes, setCapacityBytes] = useState<number>(0);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityText, setCapacityText] = useState<string>("");

  // Payloads
  const [payloads, setPayloads] = useState<PayloadEntry[]>([createEmptyPayload()]);

  // Encoding state
  const [encoding, setEncoding] = useState(false);
  const [encodeResult, setEncodeResult] = useState<EncodeResult | null>(null);
  const [encodeError, setEncodeError] = useState<string | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Computed total payload size
  const totalPayloadSize = useMemo(
    () => payloads.reduce((sum, p) => sum + getPayloadSize(p), 0),
    [payloads]
  );

  // Handle cover file upload
  const handleCoverUpload = useCallback(async (file: File) => {
    const type = detectMediaType(file);
    if (!type) return;

    setCoverFile(file);
    setCoverType(type);
    setEncodeResult(null);
    setEncodeError(null);

    // Create preview URL
    if (type === "image" || type === "audio") {
      const url = URL.createObjectURL(file);
      setCoverPreviewUrl(url);
    } else {
      setCoverPreviewUrl(null);
    }

    // Fetch capacity
    setCapacityLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("cover_media", file);
      form.append("media", file);
      const res = await fetch("/api/capacity", {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        const bytes =
          data.capacity_bytes ?? data.capacity ?? data.estimated_capacity ?? 0;
        setCapacityBytes(bytes);
        setCapacityText(`Est. total capacity: ${formatBytes(bytes)}`);
      } else {
        setCapacityBytes(0);
        setCapacityText("Could not estimate capacity");
      }
    } catch {
      setCapacityBytes(0);
      setCapacityText("Could not estimate capacity");
    } finally {
      setCapacityLoading(false);
    }
  }, []);

  const handleRemoveCover = useCallback(() => {
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    setCoverFile(null);
    setCoverType(null);
    setCoverPreviewUrl(null);
    setCapacityBytes(0);
    setCapacityText("");
    setEncodeResult(null);
    setEncodeError(null);
  }, [coverPreviewUrl]);

  // Payload CRUD
  const updatePayload = useCallback((id: string, patch: Partial<PayloadEntry>) => {
    setPayloads((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  }, []);

  const deletePayload = useCallback((id: string) => {
    setPayloads((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addPayload = useCallback(() => {
    setPayloads((prev) => [...prev, createEmptyPayload()]);
  }, []);

  // Encode handler
  const handleEncode = async () => {
    if (!coverFile) return;

    setEncoding(true);
    setEncodeError(null);
    setEncodeResult(null);
    setSaveSuccess(false);

    try {
      let currentMediaBlob: Blob = coverFile;
      let currentMediaName: string = coverFile.name;

      // Filter to payloads that have data configured
      const validPayloads = payloads.filter((p) => {
        if (!p.secretKey.trim()) return false;
        if (p.mode === "text" && !p.textMessage.trim()) return false;
        if (p.mode === "file" && !p.file) return false;
        if (
          p.mode === "credentials" &&
          !p.website.trim() &&
          !p.username.trim() &&
          !p.password.trim()
        )
          return false;
        return true;
      });

      if (validPayloads.length === 0) {
        throw new Error("Please configure at least one secret with its encryption key.");
      }

      for (let i = 0; i < validPayloads.length; i++) {
        const payload = validPayloads[i];

        const form = new FormData();
        const mediaBlob = new Blob([currentMediaBlob], {
          type: coverFile.type,
        });
        form.append("file", mediaBlob, currentMediaName);
        form.append("cover_media", mediaBlob, currentMediaName);
        form.append("media", mediaBlob, currentMediaName);
        form.append("key", payload.secretKey);

        let endpoint: string;

        if (payload.mode === "text") {
          if (!payload.textMessage.trim()) {
            throw new Error(`Secret #${i + 1}: Text message is empty.`);
          }
          endpoint = "/api/encode-text";
          form.append("message", payload.textMessage);
        } else if (payload.mode === "file") {
          if (!payload.file) {
            throw new Error(`Secret #${i + 1}: No file selected.`);
          }
          endpoint = "/api/encode-file";
          form.append("secret_file", payload.file);
        } else {
          // credentials — encode as JSON text
          if (
            !payload.website.trim() &&
            !payload.username.trim() &&
            !payload.password.trim()
          ) {
            throw new Error(`Secret #${i + 1}: Credentials are empty.`);
          }
          endpoint = "/api/encode-text";
          const credJson = JSON.stringify({
            type: "credentials",
            website: payload.website,
            username: payload.username,
            password: payload.password,
          });
          form.append("message", credJson);
        }

        const res = await fetch(endpoint, {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          const errMsg =
            errData?.detail ?? errData?.error ?? `Encoding failed for Secret #${i + 1}`;
          throw new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
        }

        const resultBlob = await res.blob();
        currentMediaBlob = resultBlob;

        // Try to get filename from Content-Disposition header
        const disposition = res.headers.get("Content-Disposition");
        if (disposition) {
          const match = disposition.match(/filename="?(.+?)"?$/);
          if (match) currentMediaName = match[1];
        }
      }

      const previewUrl = URL.createObjectURL(currentMediaBlob);
      setEncodeResult({
        blob: currentMediaBlob,
        filename: currentMediaName,
        mediaType: coverType,
        previewUrl,
      });
    } catch (err) {
      setEncodeError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setEncoding(false);
    }
  };

  // Download handler
  const handleDownload = () => {
    if (!encodeResult) return;
    const a = document.createElement("a");
    a.href = encodeResult.previewUrl;
    a.download = encodeResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Save to library
  const handleSaveToLibrary = async () => {
    if (!encodeResult) return;
    setSavingToLibrary(true);
    setSaveSuccess(false);
    try {
      const form = new FormData();
      const saveBlob = new Blob([encodeResult.blob]);
      form.append("file", saveBlob, encodeResult.filename);
      const res = await fetch("/api/save-to-library", {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        setSaveSuccess(true);
      } else {
        const errData = await res.json().catch(() => null);
        setEncodeError(
          errData?.detail ?? "Failed to save to library. Are you logged in?"
        );
      }
    } catch {
      setEncodeError("Network error saving to library.");
    } finally {
      setSavingToLibrary(false);
    }
  };

  // Validation: relaxed constraints so user is never arbitrarily blocked
  const canEncode = useMemo(() => {
    if (!coverFile) return false;
    return payloads.some((p) => {
      if (!p.secretKey.trim()) return false;
      if (p.mode === "text" && p.textMessage.trim()) return true;
      if (p.mode === "file" && p.file) return true;
      if (
        p.mode === "credentials" &&
        (p.website.trim() || p.username.trim() || p.password.trim())
      )
        return true;
      return false;
    });
  }, [coverFile, payloads]);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Section: Cover Media */}
      <section>
        <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-red-400" />
          Cover Media
        </h3>
        <CoverMediaDropzone
          coverFile={coverFile}
          coverType={coverType}
          coverPreviewUrl={coverPreviewUrl}
          onDrop={handleCoverUpload}
          onRemove={handleRemoveCover}
        />
        {/* Capacity display */}
        <AnimatePresence>
          {(capacityLoading || capacityText) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3"
            >
              {capacityLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analyzing capacity…
                </div>
              ) : (
                <p className="text-xs text-green-400 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {capacityText}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Section: Data Payloads */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-400" />
            Secret Data
            <span className="text-xs text-gray-600">
              ({payloads.length} {payloads.length === 1 ? "entry" : "entries"})
            </span>
          </h3>
          <button
            onClick={addPayload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-700/30 rounded-lg hover:bg-red-900/20 hover:border-red-600/40 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Data
          </button>
        </div>

        <div className="space-y-3">
          <AnimatePresence>
            {payloads.map((entry, i) => (
              <PayloadCard
                key={entry.id}
                entry={entry}
                index={i}
                total={payloads.length}
                onUpdate={(updated) => updatePayload(entry.id, updated)}
                onDelete={() => deletePayload(entry.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* Capacity Bar */}
      {coverFile && capacityBytes > 0 && totalPayloadSize > 0 && (
        <section>
          <CapacityBar
            usedBytes={totalPayloadSize}
            capacityBytes={capacityBytes}
          />
        </section>
      )}

      {/* Encode Button */}
      <section>
        <motion.button
          whileHover={{ scale: canEncode && !encoding ? 1.01 : 1 }}
          whileTap={{ scale: canEncode && !encoding ? 0.98 : 1 }}
          onClick={handleEncode}
          disabled={!canEncode || encoding}
          className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
            canEncode && !encoding
              ? "bg-gradient-to-r from-red-700 to-red-900 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.4)]"
              : "bg-gray-800/50 text-gray-400 cursor-not-allowed"
          }`}
        >
          {encoding ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Encode Data
            </>
          )}
        </motion.button>
      </section>

      {/* Error Message */}
      <AnimatePresence>
        {encodeError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-2 bg-red-950/30 border border-red-900/40 rounded-lg p-3"
          >
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{encodeError}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Encode Result */}
      <AnimatePresence>
        {encodeResult && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-black/40 border border-green-900/30 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <h4 className="text-sm font-semibold">
                Encoding Complete!
              </h4>
            </div>

            {/* Result Preview */}
            <div className="bg-black/30 border border-red-900/10 rounded-lg p-4">
              {encodeResult.mediaType === "image" && (
                <img
                  src={encodeResult.previewUrl}
                  alt="Encoded result"
                  className="max-w-full max-h-48 mx-auto rounded-lg border border-red-900/20"
                />
              )}
              {encodeResult.mediaType === "audio" && (
                <div className="flex flex-col items-center gap-3">
                  <FileAudio className="w-10 h-10 text-green-400" />
                  <audio
                    controls
                    src={encodeResult.previewUrl}
                    className="w-full max-w-sm"
                  />
                </div>
              )}
              {encodeResult.mediaType === "text" && (
                <div className="flex items-center gap-3 justify-center">
                  <FileType className="w-10 h-10 text-green-400" />
                  <p className="text-sm text-gray-300">
                    {encodeResult.filename}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDownload}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-600 to-yellow-800 text-white shadow-[0_0_15px_rgba(202,138,4,0.25)] hover:shadow-[0_0_25px_rgba(202,138,4,0.35)] transition-shadow"
              >
                <Download className="w-4 h-4" />
                Download Media
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveToLibrary}
                disabled={savingToLibrary || saveSuccess}
                className={`flex-1 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 border transition-all ${
                  saveSuccess
                    ? "border-green-700/50 text-green-400 bg-green-950/20"
                    : "border-red-700 text-red-400 hover:bg-red-900/20"
                }`}
              >
                {savingToLibrary ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving…
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Saved!
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-4 h-4" />
                    Save to Library
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
