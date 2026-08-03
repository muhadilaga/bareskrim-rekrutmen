"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ResultCard } from "@/components/result/ResultCard";
import { useToastContext } from "@/components/ui/Toast";
import type { ResultPayload } from "@/types";

interface HasilApiResponse {
  ok: boolean;
  code?: string;
  message?: string;
  result?: ResultPayload;
}

export function HasilChecker({ kkm }: { kkm: number }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const toast = useToastContext();

  async function check() {
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hasil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const json: HasilApiResponse = await res.json();
      if (json.ok && json.result) {
        setResult(json.result);
        toast.success("Berhasil memuat hasil ujian!");
      } else {
        setError(json.message ?? "Gagal memuat hasil.");
        toast.error(json.message ?? "Gagal memuat hasil.");
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!result) return;
    const fresh = Date.now() - new Date(result.submittedAt).getTime() < 5 * 60_000;
    if (!fresh) return;
    fetch("/api/exam/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId: result.id }),
    }).catch(() => {});
  }, [result]);

  if (busy) {
    return (
      <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card strong className="w-full max-w-md p-8 text-center space-y-4">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="mx-auto h-4 w-64" />
          <Skeleton className="mx-auto h-10 w-full rounded-lg" />
          <Skeleton className="mx-auto h-10 w-full rounded-lg" />
        </Card>
      </div>
    );
  }

  if (result) {
    return (
      <div className="bg-hero-radial px-4 py-10">
        <div className="mx-auto max-w-3xl mb-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-gold">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Kembali ke Beranda
          </Link>
        </div>
        <ResultCard result={result} kkm={kkm} showAnswers={false} />
      </div>
    );
  }

  return (
    <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
        <div className="text-4xl">📄</div>
        <h1 className="mt-4 font-display text-xl font-bold gold-text">Cek Hasil Ujian</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Masukkan username Roblox Anda untuk melihat hasil ujian.
        </p>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && check()}
          placeholder="Username Roblox"
          className="mt-5 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-center text-sm text-zinc-100 outline-none focus:border-gold/60"
        />
        <Button
          variant="gold"
          className="mt-4 w-full"
          onClick={check}
          disabled={busy || !username.trim()}
        >
          Cek Hasil
        </Button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>
    </div>
  );
}
