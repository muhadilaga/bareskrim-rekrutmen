"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const links = [
  { href: "/absen", label: "Absen" },
  { href: "/login", label: "Daftar Ujian" },
  { href: "/hasil", label: "Hasil" },
  { href: "/admin", label: "Admin" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 z-50 w-full border-b border-gold/20 bg-black/50 backdrop-blur supports-[backdrop-filter]:bg-black/30">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo + Home button */}
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <Link
            href="/"
            className="hidden items-center gap-2 rounded-md border border-gold/40 bg-gradient-to-r from-gold-300 via-gold to-gold-600 px-4 py-2 text-sm font-semibold text-crimson-950 shadow-glow transition hover:brightness-110 sm:inline-flex"
            title="Beranda"
          >
            <span>🏠</span>
            <span>Beranda</span>
          </Link>
        </div>

        {/* Desktop: satu tombol dropdown + toggle */}
        <div className="hidden items-center gap-2 md:flex">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-gradient-to-r from-gold-300 via-gold to-gold-600 px-4 py-2 text-sm font-semibold text-crimson-950 shadow-glow transition hover:brightness-110"
              aria-label="Menu navigasi"
            >
              <span>⚙️</span>
              <span>Menu</span>
            </button>

            {menuOpen && (
              <nav
                className="absolute top-full right-0 z-50 mt-2 w-48 rounded-md border border-gold/20 bg-black/80 backdrop-blur-sm shadow-glow"
              >
                <div className="flex flex-col py-1">
                  {links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setMenuOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-crimson-800/60 hover:text-gold"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </nav>
            )}
          </div>
          <ThemeToggle />
        </div>

        {/* Mobile: hamburger */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-md p-2 text-zinc-300 transition hover:bg-crimson-800/60 hover:text-gold"
            aria-label={open ? "Tutup menu" : "Buka menu"}
          >
            {open ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <nav className="border-t border-white/10 bg-black/50 px-4 pb-4 pt-2 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:bg-crimson-800/60 hover:text-gold"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}