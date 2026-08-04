// src/components/ui/MobileCTA.jsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileCTA() {
  const pathname = usePathname();

  // Hanya tampil di halaman tertentu
  if (pathname !== "/") return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 md:hidden">
      <div className="rounded-xl border border-gold/30 bg-gradient-to-r from-gold to-gold/80 p-4 text-center shadow-lg">
        <Link
          href="/login"
          className="block rounded-lg bg-crimson-900 px-6 py-3 text-center font-semibold text-white transition hover:bg-crimson-800"
        >
          Daftar & Ikuti Ujian Sekarang
        </Link>
      </div>
    </div>
  );
}
