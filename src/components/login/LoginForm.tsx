"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CasisCard } from "@/components/casis/CasisCard";
import type { VerifyResponse } from "@/types";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [discordUsername, setDiscordUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyResponse | null>(null);

  async function handleVerify() {
    if (!username.trim() || !discordUsername.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          discordUsername: discordUsername.trim(),
        }),
      });
      const json: VerifyResponse = await res.json();
      if (!json.success) {
        if (json.code === "MATRA_BLOCKED") {
          router.push("/tolak");
          return;
        }
        setError(json.message ?? "Verifikasi gagal.");
        return;
      }
      if (json.code === "NO_ATTENDANCE") {
        router.push("/absen?peringatan=absen");
        return;
      }
      setVerified(json);
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (verified?.success && verified.user) {
    return (
      <div className="flex flex-col items-center gap-6">
        <CasisCard user={verified.user} onBack={() => setVerified(null)} />
      </div>
    );
  }

  return (
    <Card strong className="w-full max-w-md p-8">
      <div className="mb-6 text-center">
        <p className="font-display text-2xl font-bold gold-text">VERIFIKASI IDENTITAS</p>
        <div className="gold-line mx-auto mt-4 w-24" />
        <p className="mt-3 text-sm text-zinc-400">
          Masukkan username Roblox Anda untuk memulai ujian rekrutmen.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="username" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Username / Roblox ID
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder="Contoh: BangReskrim_01"
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          />
        </div>

        <div>
          <label htmlFor="discordUsername" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Username Discord
          </label>
          <input
            id="discordUsername"
            type="text"
            value={discordUsername}
            onChange={(e) => setDiscordUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder="Contoh: bang_reskrim"
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <Button
          variant="gold"
          className="w-full"
          onClick={handleVerify}
          disabled={loading || !username.trim() || !discordUsername.trim()}
        >
          {loading ? "Memverifikasi..." : "Verifikasi & Mulai Ujian"}
        </Button>

        <ul className="space-y-1.5 text-xs text-zinc-500">
          <li>• Sistem otomatis mengambil foto profil & pangkat dari Roblox.</li>
          <li>• Username Discord diwajibkan untuk keperluan verifikasi identitas.</li>
          <li>• Peserta anggota matra lain (TNI AD/AL) ditolak otomatis.</li>
          <li>• Pangkat di grup Kepolisian minimal <span className="text-gold">Bhayangkara Kepala</span>.</li>
          <li>• Batas pengerjaan: <span className="text-gold">1x saja</span> per periode.</li>
        </ul>
      </div>
    </Card>
  );
}
