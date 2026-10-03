"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Library,
  Lock,
  LogIn,
  Loader2,
  X,
  Pencil,
  Trash2,
  Download,
  FileImage,
  FileAudio,
  FileText,
  Calendar,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LibraryItem {
  id: string;
  filename: string;
  thumbnail_url?: string;
  preview_url?: string;
  download_url?: string;
  file_type?: string;
  created_at: string;
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
        <h3 className="text-xl font-semibold text-white mb-1">Library Locked</h3>
        <p className="text-gray-400 text-sm max-w-sm">
          Please login to view your saved steganographic files.
        </p>
      </div>
      <button className="btn-primary flex items-center gap-2 px-6 py-3">
        <LogIn className="w-4 h-4" />
        Login to View Library
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Thumbnail Component                                                */
/* ------------------------------------------------------------------ */

function Thumbnail({ item }: { item: LibraryItem }) {
  const fileType = item.file_type ?? "";

  if (item.thumbnail_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.thumbnail_url}
        alt={item.filename}
        className="w-full h-32 object-cover rounded-t-lg"
      />
    );
  }

  const isAudio = fileType.startsWith("audio");
  const isText = fileType.startsWith("text");
  const Icon = isAudio ? FileAudio : isText ? FileText : FileImage;

  return (
    <div className="w-full h-32 bg-black/40 rounded-t-lg flex items-center justify-center">
      <Icon className="w-10 h-10 text-red-500/40" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Details Modal                                                      */
/* ------------------------------------------------------------------ */

function DetailsModal({
  item,
  token,
  onClose,
  onRenamed,
  onDeleted,
}: {
  item: LibraryItem;
  token: string | null;
  onClose: () => void;
  onRenamed: (id: string, newName: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [renameValue, setRenameValue] = useState(item.filename);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const handleRename = async () => {
    if (!renameValue.trim() || renameValue === item.filename) return;
    setRenaming(true);
    setError("");
    try {
      const res = await fetch(`/api/library/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ filename: renameValue.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Rename failed" }));
        throw new Error(err.detail || "Rename failed");
      }
      onRenamed(item.id, renameValue.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/library/${item.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Delete failed" }));
        throw new Error(err.detail || "Delete failed");
      }
      onDeleted(item.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg glass-panel overflow-hidden"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Preview */}
        <div className="w-full bg-black/60 flex items-center justify-center min-h-[200px]">
          {item.preview_url || item.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.preview_url || item.thumbnail_url}
              alt={item.filename}
              className="max-h-64 w-full object-contain"
            />
          ) : (
            <FileImage className="w-16 h-16 text-red-500/30" />
          )}
        </div>

        {/* Details */}
        <div className="p-6 space-y-4">
          {/* Rename */}
          <div className="space-y-2">
            <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
              Filename
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Pencil className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="glass-input pl-10"
                />
              </div>
              <button
                onClick={handleRename}
                disabled={renaming || !renameValue.trim() || renameValue === item.filename}
                className="btn-primary px-4 py-2 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {renaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Date */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>Created {new Date(item.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</span>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {item.download_url && (
              <a
                href={item.download_url}
                download={item.filename}
                className="btn-primary flex-1 py-2.5 flex items-center justify-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                Download
              </a>
            )}

            {confirmDelete ? (
              <div className="flex gap-2 flex-1">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2.5 rounded-lg flex items-center justify-center gap-1 text-sm transition-colors disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      Confirm
                    </>
                  )}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="btn-secondary py-2.5 px-4 text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="btn-secondary flex-1 py-2.5 flex items-center justify-center gap-2 text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function LibraryTab() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);

  const fetchLibrary = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/library", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to load library" }));
        throw new Error(err.detail || "Failed to load library");
      }
      const data: LibraryItem[] = await res.json();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load library");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (user && token) fetchLibrary();
  }, [user, token, fetchLibrary]);

  const handleRenamed = (id: string, newName: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, filename: newName } : item))
    );
    if (selectedItem?.id === id) {
      setSelectedItem((prev) => (prev ? { ...prev, filename: newName } : null));
    }
  };

  const handleDeleted = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  if (!user) return <AuthRequired />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Library className="w-6 h-6 text-red-500" />
          <h2 className="text-xl font-semibold">Your Library</h2>
        </div>
        <span className="text-xs text-gray-500">{items.length} file{items.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          <p className="text-sm text-gray-400">Loading your library...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm"
        >
          {error}
        </motion.div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Library className="w-12 h-12 text-red-500/30" />
          <p className="text-gray-400 text-sm">Your library is empty.</p>
          <p className="text-gray-600 text-xs">Encoded files will appear here automatically.</p>
        </div>
      )}

      {/* Grid */}
      {!loading && items.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-2 md:grid-cols-3 gap-4"
        >
          {items.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => setSelectedItem(item)}
              className="group cursor-pointer glass-panel overflow-hidden hover:border-red-500/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(255,0,0,0.15)]"
            >
              {/* Thumbnail */}
              <Thumbnail item={item} />

              {/* Info */}
              <div className="p-3 space-y-1">
                <p className="text-sm text-white font-medium truncate group-hover:text-yellow-400 transition-colors">
                  {item.filename}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Calendar className="w-3 h-3" />
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Details Modal */}
      <AnimatePresence>
        {selectedItem && (
          <DetailsModal
            item={selectedItem}
            token={token}
            onClose={() => setSelectedItem(null)}
            onRenamed={handleRenamed}
            onDeleted={handleDeleted}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
