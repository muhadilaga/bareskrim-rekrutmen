"use client";

import type { VerifyResponse } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function CasisCard({
  user,
  onBack,
}: {
  user: NonNullable<VerifyResponse["user"]>;
  onBack: () => void;
}) {
  return (
    <Card strong className="w-full max-w-md overflow-hidden">
      <div className="chequered border-b border-gold/20 bg-gradient-to-br from-crimson-900/60 to-transparent p-6 text-center">
        <div className="relative mx-auto mb-4 h-28 w-28">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-gold to-crimson opacity-70 blur-sm" />
          <img
            src={user.avatarUrl ?? "/shield.svg"}
            alt={user.displayName}
            width={112}
            height={112}
            loading="lazy"
            className="relative h-28 w-28 rounded-full border-2 border-gold object-cover"
          />
        </div>
        <h3 className="font-display text-xl font-bold gold-text">{user.displayName}</h3>
        <p className="text-sm text-zinc-400">@{user.username}</p>
      </div>

      <div className="space-y-3 p-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Roblox ID</span>
          <span className="font-mono text-sm text-zinc-200">{user.robloxId}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Discord</span>
          <span className="font-mono text-sm text-zinc-200">{user.discordUsername ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Pangkat Grup Kepolisian</span>
          <Badge tone="gold">{user.policeGroupRank ?? "Belum terdeteksi"}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Grup Wajib</span>
          <Badge tone="green">[RI] Republic Indonesia ✓</Badge>
        </div>
        <div className="gold-line my-2" />
        <p className="text-xs leading-relaxed text-zinc-400">
          Data di atas diverifikasi langsung dari Roblox. Pastikan akun ini adalah akun Roblox asli
          Anda. Ujian hanya dapat diikuti <span className="font-semibold text-gold">1 kali</span> per
          periode rekrutmen.
        </p>
        <div className="flex gap-3 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onBack}>
            Kembali
          </Button>
          <a href="/ujian" className="flex-1">
            <Button variant="gold" className="w-full">
              Mulai Ujian →
            </Button>
          </a>
        </div>
      </div>
    </Card>
  );
}
