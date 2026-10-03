"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Upload,
  Mail,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Lock,
  LogIn,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/* ------------------------------------------------------------------ */
/*  File drop hook                                                     */
/* ------------------------------------------------------------------ */

function useFileDrop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
  }, []);

  const onBrowse = useCallback(() => inputRef.current?.click(), []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) setFile(e.target.files[0]);
  }, []);

  return { file, setFile, dragActive, inputRef, onDragOver, onDragLeave, onDrop, onBrowse, onFileChange };
}

/* ------------------------------------------------------------------ */
/*  Dropzone UI                                                        */
/* ------------------------------------------------------------------ */

function Dropzone({
  file,
  dragActive,
  inputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onFileChange,
  onClear,
}: {
  file: File | null;
  dragActive: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onBrowse: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onBrowse}
      className={`relative w-full p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${
        dragActive
          ? "border-red-500/70 bg-red-900/10 shadow-[0_0_20px_rgba(255,0,0,0.15)]"
          : file
          ? "border-green-700/50 bg-green-900/10"
          : "border-red-900/50 bg-black/20 hover:border-red-500/50 hover:bg-black/30"
      }`}
    >
      <input ref={inputRef} type="file" className="hidden" onChange={onFileChange} />
      {file ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-white font-medium truncate">{file.name}</p>
              <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="text-gray-500 hover:text-red-400 transition-colors p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          <Upload className="w-8 h-8 text-red-500/60" />
          <p className="text-sm text-gray-400">
            Drag &amp; drop the encoded carrier file, or{" "}
            <span className="text-red-400 underline">browse</span>
          </p>
          <p className="text-xs text-gray-600">Upload the file you want to send</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Auth Required View                                                 */
/* ------------------------------------------------------------------ */

function AuthRequired() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 text-center space-y-4"
    >
      <div className="w-20 h-20 rounded-full bg-red-900/20 border border-red-900/30 flex items-center justify-center">
        <Lock className="w-10 h-10 text-red-500/60" />
      </div>
      <div>
        <h3 className="text-xl font-semibold text-white mb-1">Authentication Required</h3>
        <p className="text-gray-400 text-sm max-w-sm">
          You need to be logged in to send encrypted files to other users.
        </p>
      </div>
      <button className="btn-primary flex items-center gap-2 px-6 py-3">
        <LogIn className="w-4 h-4" />
        Login to Continue
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SendTab() {
  const { user, token } = useAuth();
  const drop = useFileDrop();
  const [recipients, setRecipients] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const addRecipient = () => setRecipients((r) => [...r, ""]);
  const removeRecipient = (idx: number) => setRecipients((r) => r.filter((_, i) => i !== idx));
  const updateRecipient = (idx: number, val: string) =>
    setRecipients((r) => r.map((v, i) => (i === idx ? val : v)));

  const validRecipients = recipients.filter((r) => r.trim() && r.includes("@"));

  const handleSend = async () => {
    if (!drop.file || validRecipients.length === 0) return;
    setLoading(true);
    setSuccess(false);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", drop.file);
      validRecipients.forEach((r) => formData.append("recipients", r.trim()));

      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Send failed" }));
        throw new Error(err.detail || "Send failed");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    drop.setFile(null);
    setRecipients([""]);
    setSuccess(false);
    setError("");
  };

  if (!user) return <AuthRequired />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Send className="w-6 h-6 text-red-500" />
        <h2 className="text-xl font-semibold">Secure File Transfer</h2>
      </div>

      <p className="text-sm text-gray-400">
        Send encrypted carrier files directly to other users via email.
      </p>

      <AnimatePresence mode="wait">
        {success ? (
          /* --- Success State --- */
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center text-center gap-4 py-12"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <CheckCircle2 className="w-16 h-16 text-green-400" />
            </motion.div>
            <div>
              <h3 className="text-xl font-bold text-green-400 mb-1">File Sent Successfully!</h3>
              <p className="text-gray-400 text-sm">
                Your encrypted file has been sent to {validRecipients.length} recipient
                {validRecipients.length > 1 ? "s" : ""}.
              </p>
            </div>
            <button
              onClick={handleReset}
              className="btn-secondary flex items-center gap-2 px-6 py-3 mt-2"
            >
              <Send className="w-4 h-4" />
              Send Another File
            </button>
          </motion.div>
        ) : (
          /* --- Form State --- */
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Recipients */}
            <div className="space-y-3">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                Recipients
              </label>
              {recipients.map((email, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2"
                >
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => updateRecipient(idx, e.target.value)}
                      className="glass-input pl-10"
                      placeholder={`recipient${idx + 1}@example.com`}
                    />
                  </div>
                  {recipients.length > 1 && (
                    <button
                      onClick={() => removeRecipient(idx)}
                      className="text-gray-500 hover:text-red-400 transition-colors p-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              ))}

              <button
                onClick={addRecipient}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Another Recipient
              </button>
            </div>

            {/* File dropzone */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
                Encoded Carrier File
              </label>
              <Dropzone {...drop} onClear={() => drop.setFile(null)} />
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={loading || !drop.file || validRecipients.length === 0}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending Securely...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send File
                </>
              )}
            </button>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
