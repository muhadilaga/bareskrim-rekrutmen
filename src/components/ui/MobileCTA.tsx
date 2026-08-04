"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const hiddenPaths = ["/login", "/ujian", "/tolak", "/absen"];

export function MobileCTA() {
  const pathname = usePathname();

  if (hiddenPaths.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#140507]/95 px-4 py-3 backdrop-blur-md md:hidden">
      <Link
        href="/absen"
        className="block w-full rounded-lg border border-gold/40 bg-gradient-to-r from-gold-300 via-gold to-gold-600 py-3 text-center text-sm font-bold text-crimson-950 shadow-glow transition hover:brightness-110"
      >
        Mulai Sekarang
      </Link>
    </div>
  );
}
