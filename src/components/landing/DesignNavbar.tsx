"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
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

      <Link href="/dashboard" className="nav-login">
        PORTAL CASIS
      </Link>
    </header>
  );
}
