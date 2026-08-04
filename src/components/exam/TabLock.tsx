"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

const STORAGE_KEY = "brk_exam_tab_lock";
const HEARTBEAT_MS = 5_000;
const STALE_MS = 15_000;

// Mengunci tab: hanya satu tab per browser yang boleh mengerjakan ujian.
// sessionStorage = unik per tab; localStorage = dibagi antar tab.
export function TabLock({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const claim = useCallback(() => {
    if (!tokenRef.current) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: tokenRef.current, updatedAt: Date.now() })
      );
    } catch {
      /* storage penuh / tidak tersedia — abaikan */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Token unik untuk tab ini, bertahan saat refresh (sessionStorage per tab).
    let token = sessionStorage.getItem("brk_tab_token");
    if (!token) {
      token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem("brk_tab_token", token);
    }
    tokenRef.current = token;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const active = JSON.parse(raw) as { token: string; updatedAt: number };
        // Tab lain masih aktif (heartbeat fresh) dan tokennya beda => terkunci.
        if (active.token !== token && Date.now() - active.updatedAt < STALE_MS) {
          setLocked(true);
          return;
        }
      }
    } catch {
      /* abaikan parse error */
    }

    claim();
    heartbeatRef.current = setInterval(claim, HEARTBEAT_MS);

    // Jika tab lain membuka ujian, tab ini pun terkunci (storage event antar tab).
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        const active = JSON.parse(e.newValue ?? "null") as { token: string; updatedAt: number } | null;
        if (active && active.token !== tokenRef.current) {
          setLocked(true);
        }
      } catch {
        /* abaikan */
      }
    };
    window.addEventListener("storage", onStorage);

    const clear = () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      window.removeEventListener("storage", onStorage);
      // Lepas klaim dari localStorage agar tab baru bisa langsung mengambil alih.
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const active = JSON.parse(raw) as { token: string } | null;
          if (active && active.token === tokenRef.current) {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch {
        /* abaikan */
      }
    };

    // Lepas klaim saat tab ditutup/berpindah halaman agar tab lain bisa lanjut.
    window.addEventListener("pagehide", clear);
    window.addEventListener("beforeunload", clear);
    return clear;
  }, [claim]);

  if (locked) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
          <div className="text-4xl">🚫</div>
          <h1 className="mt-4 font-display text-xl font-bold text-red-300">
            Ujian Terbuka di Tab Lain
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Ujian sedang berlangsung di tab lain pada browser ini. Tutup tab tersebut terlebih
            dahulu, lalu muat ulang halaman ini untuk melanjutkan.
          </p>
          <Link href="/" className="mt-6 inline-block">
            <Button variant="ghost">Kembali ke Beranda</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
