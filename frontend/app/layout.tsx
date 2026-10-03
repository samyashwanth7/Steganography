import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "STENO // Advanced Steganography Protocol",
  description: "Military-grade multi-payload steganography engine with AES-256 encryption, zero-width text hiding, and secure carrier transfer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="antialiased min-h-screen bg-[#050507] text-zinc-100 font-sans selection:bg-red-500/30 selection:text-white">
        {/* Ambient atmospheric backdrop */}
        <div className="fixed inset-0 z-[-1] pointer-events-none">
          <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-red-950/20 blur-[140px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-amber-950/15 blur-[140px] rounded-full" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(20,5,5,0.4)_0%,_rgba(5,5,7,0.95)_75%)]" />
        </div>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
