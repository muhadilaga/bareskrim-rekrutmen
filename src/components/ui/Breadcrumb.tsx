"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const labels: Record<string, string> = {
  "/": "Beranda",
  "/login": "Login",
  "/absen": "Absen",
  "/ujian": "Ujian",
  "/hasil": "Hasil",
  "/admin": "Admin",
  "/tolak": "Ditolak",
};

export function Breadcrumb() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = labels[href] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    return { href, label };
  });

  return (
    <nav className="mx-auto max-w-6xl px-4 pt-24 pb-2" aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-xs text-zinc-500">
        <li>
          <Link href="/" className="transition hover:text-gold">
            Beranda
          </Link>
        </li>
        {crumbs.map((crumb, i) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            <span className="text-zinc-600">/</span>
            {i === crumbs.length - 1 ? (
              <span className="font-medium text-zinc-300">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="transition hover:text-gold">
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
