"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const links = [
  { href: "/absen", label: "✅ Absen" },
  { href: "/login", label: "📝 Daftar Ujian" },
  { href: "/hasil", label: "📊 Hasil" },
  { href: "/admin", label: "🔧 Admin" },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-gold/20 bg-black/50 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo (Kiri) */}
        <Link href="/" className="flex items-center space-x-2">
          <Logo />
        </Link>

        {/* Desktop Nav Group (Kanan) */}
        <nav className="hidden items-center gap-3 md:flex">
          <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-crimson-800/60 hover:text-gold"
              >
                <span className="text-base">{link.label}</span>
              </Link>
            ))}
          </div>
          <ThemeToggle />
        </nav>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-md p-2 text-zinc-300 hover:bg-crimson-800/60 hover:text-gold"
            aria-label="Menu"
          >
            ☰
          </button>
        </div>

        {/* Mobile Dropdown */}
        {menuOpen && (
          <div className="absolute top-full right-4 z-40 mt-2 w-48 rounded-md border border-white/10 bg-[#1c0c0e] p-2 md:hidden">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-crimson-800/60 hover:text-gold"
                onClick={() => setMenuOpen(false)}
              >
                <span className="text-base">{link.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
