"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "Beranda" },
  { href: "/rekrutmen", label: "Rekrutmen" },
  { href: "/tentang", label: "Tentang" },
  { href: "/arsip", label: "Arsip" },
  { href: "/galeri", label: "Galeri" },
];

// Navigasi desain asli (index.html → header.navbar).
export function DesignNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="navbar">
        <Link href="/" className="brand">
          <div className="brand-mark">
            <img src="/design-assets/logo-pusdik.png" alt="Pusdik Reserse" />
          </div>
          <div className="brand-text">
            <strong>BARESKRIM POLRI RBX</strong>
            <span>PUSDIK RESERSE</span>
          </div>
        </Link>

        <nav className="nav-links">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "active" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="nav-actions-wrapper" style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
          <Link href="/dashboard" className="nav-login">
            PORTAL CASIS
          </Link>

          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label={mobileOpen ? "Tutup Menu Navigasi" : "Buka Menu Navigasi"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Navigasi horizontal bar mobile: link selalu terlihat langsung persis seperti referensi desktop */}
      <nav className="mobile-subnav" aria-label="Navigasi Menu Mobile">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "active" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {mobileOpen && (
        <div className="mobile-nav-menu">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "active" : undefined}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            className="mobile-nav-portal-btn"
            onClick={() => setMobileOpen(false)}
          >
            MASUK PORTAL CASIS →
          </Link>
        </div>
      )}
    </>
  );
}
