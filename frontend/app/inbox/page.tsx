"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Download,
  Trash2,
  Mail,
  Clock,
  FileCheck,
  Loader2,
  Inbox,
  Shield,
} from "lucide-react";
import Link from "next/link";

export default function InboxPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchInbox();
  }, [token]);

  const fetchInbox = async () => {
    try {
      const res = await fetch("/api/inbox", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.data || []);
      }
    } catch (e) {
      console.error("Failed to fetch inbox:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (msg: any) => {
    try {
      const res = await fetch(`/api/uploads/${msg.stored_filename}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = msg.filename || "encrypted_file";
      a.click();
      URL.revokeObjectURL(url);

      // Mark as read
      await fetch(`/api/inbox/${msg.id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m))
      );
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/inbox/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeleting(null);
    }
  };

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-panel p-12 text-center max-w-md">
          <Shield className="w-16 h-16 text-red-500/50 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
          <p className="text-gray-400 mb-6">
            Please login to access your secure inbox.
          </p>
          <Link href="/" className="btn-primary py-3 px-6 inline-block">
            Go to Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-yellow-500">
              Secure Inbox
            </h1>
            <p className="text-gray-400 text-sm">
              Manage your encrypted transfers
            </p>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <Inbox className="w-5 h-5" />
            <span className="text-sm">{messages.length} messages</span>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="glass-panel p-12 text-center">
            <Inbox className="w-16 h-16 text-red-500/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-300 mb-2">
              No Messages
            </h3>
            <p className="text-gray-500">
              Your inbox is empty. When someone sends you an encrypted file,
              it&apos;ll appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`glass-panel p-5 flex items-center gap-4 ${
                  !msg.is_read ? "border-red-700/50" : ""
                }`}
              >
                {/* Sender avatar */}
                <div className="w-10 h-10 rounded-full bg-red-900/50 border border-red-700/50 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-red-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white truncate">
                      {msg.sender_name || msg.sender_email || "Unknown"}
                    </span>
                    {!msg.is_read && (
                      <span className="px-2 py-0.5 text-xs bg-red-900/50 text-red-400 rounded-full border border-red-700/50">
                        New
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span className="flex items-center gap-1 truncate">
                      <FileCheck className="w-3.5 h-3.5 text-green-500" />
                      {msg.filename || "Encrypted File"}
                    </span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      {msg.created_at
                        ? new Date(msg.created_at).toLocaleDateString()
                        : "Unknown date"}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(msg)}
                    className="btn-primary py-2 px-3 flex items-center gap-1.5 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button
                    onClick={() => handleDelete(msg.id)}
                    disabled={deleting === msg.id}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deleting === msg.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
