"use client";

import { useState } from "react";
import {
  Lock,
  Unlock,
  Eraser,
  Library,
  Send,
  ShieldAlert,
  UserCircle,
  LogOut,
  Shield,
  Inbox,
  Sparkles,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import AuthModal from "@/components/AuthModal";
import EncodeTab from "@/components/EncodeTab";
import DecodeTab from "@/components/DecodeTab";
import DeleteTab from "@/components/DeleteTab";
import LibraryTab from "@/components/LibraryTab";
import SendTab from "@/components/SendTab";
import Link from "next/link";

const tabs = [
  { id: "encode", label: "Encode", subtitle: "Multi-Payload Embedding", icon: Lock },
  { id: "decode", label: "Decode", subtitle: "Extract & Reveal", icon: Unlock },
  { id: "delete", label: "Scrub", subtitle: "Surgical Erasure", icon: Eraser },
  { id: "library", label: "Vault", subtitle: "Cloud Encoded Media", icon: Library },
  { id: "send", label: "Transfer", subtitle: "Secure File Dispatch", icon: Send },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("encode");
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { user, token, signOut } = useAuth();

  return (
    <main className="min-h-screen flex flex-col justify-between py-6 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* Top Navbar */}
      <header className="w-full flex items-center justify-between mb-8 pb-5 border-b border-white/[0.06]">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 p-[1px] shadow-[0_0_20px_rgba(239,68,68,0.4)]">
            <div className="w-full h-full bg-[#09090c] rounded-[11px] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-500 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white font-heading">STENO</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-widest font-semibold">
                v2.4 Core
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono tracking-tight hidden sm:block">CRYPTOGRAPHIC STEGANOGRAPHY PROTOCOL</p>
          </div>
        </Link>

        {/* Center: Live Status Beacon */}
        <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900/60 border border-white/5 text-xs font-mono text-zinc-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>ENGINE ACTIVE</span>
          <span className="text-zinc-600">•</span>
          <span>AES-256-CBC</span>
          <span className="text-zinc-600">•</span>
          <span>32K MANIFEST</span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <Link
            href="/inbox"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 transition-colors"
          >
            <Inbox className="w-3.5 h-3.5 text-amber-400" />
            <span>Inbox</span>
          </Link>

          <Link
            href="/admin"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-red-400" />
            <span>Forensics</span>
          </Link>

          <div className="relative">
            <button
              onClick={() => {
                if (!user) setShowAuth(true);
                else setShowProfile(!showProfile);
              }}
              className="flex items-center gap-2 p-1.5 pr-3 rounded-full bg-zinc-900 border border-white/10 hover:border-red-500/40 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                {user?.first_name ? user.first_name[0].toUpperCase() : <UserCircle className="w-4 h-4" />}
              </div>
              <span className="text-xs font-medium text-zinc-200 hidden sm:inline">
                {user ? `${user.first_name}` : "Sign In"}
              </span>
            </button>

            {/* Profile Menu Popover */}
            <AnimatePresence>
              {showProfile && user && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute right-0 top-12 w-64 steno-card p-4 z-50 shadow-2xl"
                >
                  <div className="flex items-center gap-3 pb-3 border-b border-white/[0.08] mb-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white font-bold text-sm">
                      {user.first_name?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="text-xs text-zinc-400 truncate">{user.email}</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Link
                      href="/inbox"
                      className="flex items-center justify-between px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
                      onClick={() => setShowProfile(false)}
                    >
                      <span className="flex items-center gap-2">
                        <Inbox className="w-4 h-4 text-amber-400" />
                        Secure Inbox
                      </span>
                      <ArrowUpRight className="w-3 h-3 text-zinc-500" />
                    </Link>
                    <Link
                      href="/admin"
                      className="flex items-center justify-between px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
                      onClick={() => setShowProfile(false)}
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-red-400" />
                        Admin Forensics
                      </span>
                      <ArrowUpRight className="w-3 h-3 text-zinc-500" />
                    </Link>
                    <button
                      onClick={async () => {
                        await signOut();
                        setShowProfile(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-950/30 rounded-lg transition-colors mt-1"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Hero Headline */}
      <div className="text-center mb-10 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Additive Multi-Secret Engine</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tight text-white font-heading">
          Cryptographic Studio
        </h1>
        <p className="text-sm sm:text-base text-zinc-400 mt-2 font-light">
          Hide secrets inside images, audio, and text with zero audible or visual distortion.
        </p>
      </div>

      {/* Main Studio Panel */}
      <div className="steno-card overflow-hidden">
        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-white/[0.08] bg-black/40">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative py-4 px-4 flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
                  isActive
                    ? "text-white bg-white/[0.04]"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${isActive ? "text-red-500" : "text-zinc-500"}`} />
                  <span className="text-sm font-semibold tracking-wide font-heading uppercase">{tab.label}</span>
                </div>
                <span className="text-[10px] text-zinc-500 hidden sm:block tracking-tight">{tab.subtitle}</span>

                {isActive && (
                  <motion.div
                    layoutId="activeTabGlow"
                    className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-600 via-red-500 to-amber-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-6 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
            >
              {activeTab === "encode" && <EncodeTab />}
              {activeTab === "decode" && <DecodeTab />}
              {activeTab === "delete" && <DeleteTab />}
              {activeTab === "library" && <LibraryTab />}
              {activeTab === "send" && <SendTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-zinc-600 font-mono flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/[0.04] pt-6">
        <span>STENO PROTOCOL • AES-256 ENCRYPTED MANIFEST</span>
        <span>ZERO-WIDTH & MULTI-LSB STEGANOGRAPHY</span>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onLogin={async (email, pwd) => {
          // AuthModal handles via auth-context
        }}
        onRegister={async (fn, ln, email, pwd) => {
          // AuthModal handles via auth-context
        }}
      />
    </main>
  );
}
