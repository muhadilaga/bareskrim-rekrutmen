"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";

const links = [
  { href: "/", label: "Beranda" },
  { href: "/login", label: "Daftar Ujian" },
  { href: "/hasil", label: "Hasil" },
  { href: "/admin", label: "Admin" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 glass-strong border-b border-gold/20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/">
          <Logo />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-crimson-800/60 hover:text-gold"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <Link
          href="/login"
          className="hidden rounded-md border border-gold/40 bg-gradient-to-r from-crimson-800 to-crimson px-4 py-2 text-sm font-semibold text-gold shadow-glow transition hover:from-crimson hover:to-crimson-700 md:inline-block"
        >
          Mulai Ujian
        </Link>

        {/* Hamburger button (mobile only) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center justify-center rounded-md p-2 text-zinc-300 transition hover:bg-crimson-800/60 hover:text-gold md:hidden"
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

      {/* Mobile dropdown menu */}
      {open && (
        <nav className="border-t border-white/10 px-4 pb-4 pt-2 md:hidden">
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
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-md border border-gold/40 bg-gradient-to-r from-crimson-800 to-crimson px-4 py-2.5 text-center text-sm font-semibold text-gold shadow-glow transition hover:from-crimson hover:to-crimson-700"
          >
            Mulai Ujian
          </Link>
        </nav>
      )}
    </header>
  );
}
