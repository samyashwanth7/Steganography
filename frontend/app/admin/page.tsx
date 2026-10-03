"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Search,
  ShieldCheck,
  Upload,
  Loader2,
  ScanSearch,
  UserCircle,
  Clock,
  Hash,
  Mail,
  AlertTriangle,
  Eye,
} from "lucide-react";
import Link from "next/link";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"users" | "track">("users");
  const [users, setUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [trackFile, setTrackFile] = useState<File | null>(null);
  const [trackResults, setTrackResults] = useState<any>(null);
  const [tracking, setTracking] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    if (token && activeTab === "users") fetchUsers();
  }, [token, activeTab]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || data.data || []);
      }
    } catch (e) {
      console.error("Failed to fetch users:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async () => {
    if (!trackFile) return;
    setTracking(true);
    setTrackResults(null);
    try {
      const fd = new FormData();
      fd.append("media", trackFile);
      const res = await fetch("/api/admin/detect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        setTrackResults(await res.json());
      } else {
        setTrackResults({ error: "Analysis failed or no data found." });
      }
    } catch (e) {
      setTrackResults({ error: "Analysis failed." });
    } finally {
      setTracking(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      (u.first_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.last_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusInfo = (user: any) => {
    if (!user.last_active) return { label: "Unknown", color: "text-gray-500" };
    const lastActive = new Date(user.last_active).getTime();
    const logoutTime = user.logout_time ? new Date(user.logout_time).getTime() : 0;
    const now = Date.now();
    if (logoutTime > lastActive) return { label: "Offline", color: "text-gray-500" };
    if (now - lastActive < 5 * 60 * 1000) return { label: "Active Now", color: "text-green-400" };
    return { label: "Inactive", color: "text-yellow-500" };
  };

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-panel p-12 text-center max-w-md">
          <AlertTriangle className="w-16 h-16 text-red-500/50 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Admin Access Required</h2>
          <p className="text-gray-400 mb-6">This page is restricted to administrators.</p>
          <Link href="/" className="btn-primary py-3 px-6 inline-block">Go Back</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-yellow-500">
              Admin Dashboard
            </h1>
            <p className="text-gray-400 text-sm">User management &amp; forensic analysis</p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex gap-1 mb-6 p-1 max-w-xs bg-black/60 rounded-lg border border-red-900/30">
          {(["users", "track"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                activeTab === tab
                  ? "bg-red-900/50 text-yellow-400 shadow-lg"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "users" ? <Users className="w-4 h-4" /> : <ScanSearch className="w-4 h-4" />}
              {tab === "users" ? "Users" : "Track"}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {activeTab === "users" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Search */}
            <div className="relative mb-6 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="glass-input pl-10"
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
              </div>
            ) : (
              <div className="glass-panel overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-red-900/30 text-sm text-gray-400">
                      <th className="text-left py-3 px-4">User</th>
                      <th className="text-left py-3 px-4">Email</th>
                      <th className="text-left py-3 px-4">Role</th>
                      <th className="text-left py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user, i) => {
                      const status = getStatusInfo(user);
                      return (
                        <motion.tr
                          key={user.id || i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="border-b border-red-900/10 hover:bg-white/5 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-red-900/40 border border-red-700/30 flex items-center justify-center">
                                <UserCircle className="w-5 h-5 text-red-400" />
                              </div>
                              <span className="text-white font-medium">
                                {user.first_name} {user.last_name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-400 text-sm">{user.email}</td>
                          <td className="py-3 px-4">
                            {user.is_admin ? (
                              <span className="px-2 py-0.5 text-xs bg-yellow-900/30 text-yellow-400 rounded border border-yellow-700/30">
                                Admin
                              </span>
                            ) : (
                              <span className="text-gray-500 text-sm">User</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-sm ${status.color}`}>
                              {status.label}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && (
                  <div className="py-12 text-center text-gray-500">No users found.</div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Track / Forensics Tab */}
        {activeTab === "track" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl">
            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <Eye className="w-5 h-5 text-red-400" />
                Content Forensics
              </h3>
              <p className="text-gray-400 text-sm mb-6">
                Analyze any media file to detect hidden steganographic content without needing the user&apos;s secret key.
              </p>

              {/* Upload Zone */}
              <label className="block border-2 border-dashed border-red-900/50 rounded-xl p-8 text-center cursor-pointer hover:border-red-500/50 transition-colors bg-black/20 mb-4">
                <Upload className="w-10 h-10 text-red-500/50 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">
                  {trackFile ? trackFile.name : "Drop suspicious media here or click to upload"}
                </p>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) setTrackFile(e.target.files[0]);
                  }}
                />
              </label>

              <button
                onClick={handleTrack}
                disabled={!trackFile || tracking}
                className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tracking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Decrypting matrix structure...
                  </>
                ) : (
                  <>
                    <ScanSearch className="w-4 h-4" />
                    Run Analysis
                  </>
                )}
              </button>

              {/* Results */}
              {trackResults && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 space-y-4"
                >
                  {trackResults.error ? (
                    <div className="p-4 rounded-lg bg-red-900/20 border border-red-700/30 text-red-400">
                      {trackResults.error}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-green-400" />
                        <span className="text-green-400 font-semibold">
                          Steganography Detected
                        </span>
                        <span className="text-gray-400 text-sm">
                          — {(trackResults.payloads || trackResults.manifest || []).length} payload(s) found
                        </span>
                      </div>

                      {(trackResults.payloads || trackResults.manifest || []).map((entry: any, i: number) => (
                        <div
                          key={i}
                          className="p-4 bg-black/40 border border-red-900/20 rounded-lg space-y-2"
                        >
                          <div className="text-sm">
                            <span className="text-gray-400">
                              <UserCircle className="w-4 h-4 inline mr-1" />
                              Creator:
                            </span>{" "}
                            <span className="text-white">
                              {entry.creator_name || entry.creator_email || "Unknown"}
                            </span>
                          </div>
                          {entry.receiver_email && (
                            <div className="text-sm">
                              <span className="text-gray-400">
                                <Mail className="w-4 h-4 inline mr-1" />
                                Receiver:
                              </span>{" "}
                              <span className="text-white">
                                {entry.receiver_name || entry.receiver_email}
                              </span>
                            </div>
                          )}
                          <div className="text-sm">
                            <span className="text-gray-400">
                              <Clock className="w-4 h-4 inline mr-1" />
                              Timestamp:
                            </span>{" "}
                            <span className="text-white">
                              {entry.ts ? new Date(entry.ts).toLocaleString() : "Unknown"}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-gray-400">
                              <Hash className="w-4 h-4 inline mr-1" />
                              Format &amp; Span:
                            </span>{" "}
                            <span className="text-yellow-400 font-mono text-xs">
                              {(entry.format || "v2").toUpperCase()} · Bit {entry.start_bit} ({entry.length_bits} bits)
                            </span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
