"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ResultCard } from "@/components/result/ResultCard";
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
      } else {
        setError(json.message ?? "Gagal memuat hasil.");
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  // Pengaman: bila hasil masih baru dan laporan Discord belum sempat terkirim
  // saat submit, kirim ulang lewat /api/exam/report (idempoten - tidak
  // mengirim duplikat karena dicek discordMessageId di server).
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

  if (result) {
    return (
      <div className="bg-hero-radial px-4 py-10">
        <ResultCard result={result} kkm={kkm} showAnswers={false} />
      </div>
    );
  }

  return (
    <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
      <Card strong className="w-full max-w-md p-8 text-center">
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
          {busy ? "Memeriksa..." : "Cek Hasil"}
        </Button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Card>
    </div>
  );
}
