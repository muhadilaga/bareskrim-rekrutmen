"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToastContext } from "@/components/ui/Toast";

interface CasisManagementProps {
  headers: Record<string, string>;
  onDeleted?: () => void;
}

interface CasisUser {
  id: string;
  username: string;
  displayName: string;
  robloxId: number;
  avatarUrl: string | null;
  discordUsername: string | null;
  policeGroupRank: string | null;
  attendance: { id: string; discordUserId: string | null; createdAt: string } | null;
  attempt: { id: string; startedAt: string; submittedAt: string | null } | null;
  status: "belum_absen" | "sudah_absen" | "sedang_mengerjakan" | "selesai";
}

interface CasisGroup {
  groupId: number;
  groupName: string;
  roleName: string;
  roleRank: number;
  isPrimary: boolean;
}

interface DiscordGuild {
  guildId: string;
  guildName: string;
  memberCount: number | null;
  isPrimary: boolean;
}

const statusConfig: Record<string, { label: string; tone: "green" | "gold" | "neutral" | "red" }> = {
  belum_absen: { label: "Belum Absen", tone: "neutral" },
  sudah_absen: { label: "Sudah Absen", tone: "gold" },
  sedang_mengerjakan: { label: "Sedang Mengerjakan", tone: "green" },
  selesai: { label: "Selesai", tone: "neutral" },
};

export function CasisManagement({ headers, onDeleted }: CasisManagementProps) {
  const [users, setUsers] = useState<CasisUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [groupModal, setGroupModal] = useState<{
    user: CasisUser;
    groups: CasisGroup[];
    discordGuilds: DiscordGuild[];
    loading: boolean;
    discordError: string | null;
  } | null>(null);
  const toast = useToastContext();

  const loadUsers = useCallback(async () => {
    setBusy(true);
    const res = await fetch("/api/admin/users", { headers });
    const json = await res.json();
    if (!res.ok) {
      setMsg({ ok: false, text: json.message ?? "Gagal memuat data casis." });
    } else {
      setUsers(json.users ?? []);
      setMsg(null);
    }
    setBusy(false);
  }, [headers]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function deleteUser(userId: string, username: string) {
    if (
      !window.confirm(
        `Hapus semua data "${username}"? Ini akan menghapus absensi, attempt, hasil ujian, dan data user.`
      )
    )
      return;
    setDeletingId(userId);
    try {
      const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers,
      });
      const json = await res.json();
      console.log("[CasisManagement] Delete response:", json);
      if (!res.ok) {
        throw new Error(json.message ?? "Gagal menghapus");
      }
      setMsg({ ok: true, text: json.message ?? "Berhasil dihapus." });
      toast.success(json.message ?? "Berhasil dihapus");
      setDeletingId(null);
      await loadUsers();
      onDeleted?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus";
      console.error("[CasisManagement] Delete error:", err);
      setMsg({ ok: false, text: msg });
      toast.error(msg);
      setDeletingId(null);
    }
  }

  async function deleteAllUsers() {
    const total = users.length;
    const totalAbsen = users.filter((u) => u.attendance).length;
    if (
      !window.confirm(
        `HAPUS SEMUA ${total} casis (termasuk ${totalAbsen} absensi)?\n\n` +
          "Semua absensi, attempt, hasil ujian, dan data user akan dihapus permanen. Tindakan ini TIDAK bisa dibatalkan!"
      )
    )
      return;
    if (!window.confirm("Konfirmasi kedua: Yakin ingin menghapus SEMUA data casis?")) return;
    setDeletingId("__all__");
    try {
      const res = await fetch("/api/admin/users?all=1", {
        method: "DELETE",
        headers,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message ?? "Gagal menghapus semua");
      }
      setMsg({ ok: true, text: json.message ?? "Semua data casis dihapus." });
      toast.success(json.message ?? "Semua data casis dihapus");
      setDeletingId(null);
      await loadUsers();
      onDeleted?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus semua";
      console.error("[CasisManagement] Delete all error:", err);
      setMsg({ ok: false, text: msg });
      toast.error(msg);
      setDeletingId(null);
    }
  }

  async function loadGroups(user: CasisUser) {
    setGroupModal({ user, groups: [], discordGuilds: [], loading: true, discordError: null });

    const [robloxRes, discordRes] = await Promise.allSettled([
      fetch(`/api/admin/groups?robloxId=${encodeURIComponent(String(user.robloxId))}`, {
        headers,
      }),
      user.discordUsername
        ? fetch(
            `/api/admin/discord-groups?username=${encodeURIComponent(user.discordUsername)}`,
            { headers }
          )
        : Promise.resolve(null),
    ]);

    let groups: CasisGroup[] = [];
    let discordGuilds: DiscordGuild[] = [];
    let discordError: string | null = null;

    if (robloxRes.status === "fulfilled" && robloxRes.value.ok) {
      const json = await robloxRes.value.json();
      if (json.ok) groups = json.groups ?? [];
    } else {
      discordError = "Gagal memuat grup Roblox.";
    }

    if (discordRes.status === "fulfilled" && discordRes.value) {
      try {
        const json = await discordRes.value.json();
        if (json.ok) {
          discordGuilds = json.guilds ?? [];
        } else {
          discordError = json.message ?? "Gagal memuat server Discord.";
        }
      } catch {
        discordError = "Gagal memuat server Discord.";
      }
    } else if (!user.discordUsername) {
      discordError = "Casis tidak mencantumkan username Discord.";
    } else {
      discordError = "Bot Discord tidak bisa dijangkau.";
    }

    setGroupModal({ user, groups, discordGuilds, loading: false, discordError });
  }

  const sedangMengerjakan = users.filter((u) => u.status === "sedang_mengerjakan");
  const sudahSelesai = users.filter((u) => u.status === "selesai");
  const sudahAbsen = users.filter((u) => u.status === "sudah_absen");
  const belumAbsen = users.filter((u) => u.status === "belum_absen");

  return (
    <Card strong className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold gold-text">Manajemen Casis</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={deleteAllUsers}
            disabled={deletingId === "__all__" || users.length === 0}
            className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
          >
            {deletingId === "__all__" ? "Menghapus semua..." : `Hapus Semua (${users.length})`}
          </button>
          <Button variant="ghost" onClick={loadUsers} disabled={busy} className="text-xs">
            {busy ? "Memuat..." : "Refresh"}
          </Button>
        </div>
      </div>

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      {/* Belum Absen (terdaftar tapi belum absen) */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">
          Belum Absen ({belumAbsen.length})
        </h3>
        {belumAbsen.length === 0 ? (
          <p className="text-xs text-zinc-500">Tidak ada.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {belumAbsen.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              >
                <img
                  src={u.avatarUrl ?? "/shield.svg"}
                  alt={u.displayName}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-gold/40 object-cover"
                />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-medium text-zinc-200">{u.displayName}</p>
                  <p className="text-xs text-zinc-400">
                    @{u.username} · {u.policeGroupRank ?? "-"}
                    {u.discordUsername && <> · Discord: {u.discordUsername}</>}
                  </p>
                </div>
                <Badge tone="neutral">Belum Absen</Badge>
                <button
                  onClick={() => deleteUser(u.id, u.username)}
                  disabled={deletingId === u.id}
                  className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  {deletingId === u.id ? "..." : "Hapus"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sedang Mengerjakan */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">
          Sedang Mengerjakan ({sedangMengerjakan.length})
        </h3>
        {sedangMengerjakan.length === 0 ? (
          <p className="text-xs text-zinc-500">Tidak ada yang sedang mengerjakan.</p>
        ) : (
          <div className="space-y-2">
            {sedangMengerjakan.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3"
              >
                <img
                  src={u.avatarUrl ?? "/shield.svg"}
                  alt={u.displayName}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full border border-gold/40 object-cover"
                />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-semibold text-zinc-100">{u.displayName}</p>
                  <p className="text-xs text-zinc-400">
                    @{u.username} · {u.policeGroupRank ?? "-"}
                    {u.discordUsername && <> · Discord: {u.discordUsername}</>}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Mulai: {new Date(u.attempt!.startedAt).toLocaleString("id-ID")}
                  </p>
                </div>
                <Badge tone="green">Mengerjakan</Badge>
                <button
                  onClick={() => loadGroups(u)}
                  className="rounded-md border border-gold/40 px-2.5 py-1 text-xs text-gold transition hover:bg-gold/10"
                >
                  Grup
                </button>
                <button
                  onClick={() => deleteUser(u.id, u.username)}
                  disabled={deletingId === u.id}
                  className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  {deletingId === u.id ? "..." : "Hapus"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sudah Selesai */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">
          Sudah Selesai ({sudahSelesai.length})
        </h3>
        {sudahSelesai.length === 0 ? (
          <p className="text-xs text-zinc-500">Belum ada yang selesai.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {sudahSelesai.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              >
                <img
                  src={u.avatarUrl ?? "/shield.svg"}
                  alt={u.displayName}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-gold/40 object-cover"
                />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-medium text-zinc-200">{u.displayName}</p>
                  <p className="text-xs text-zinc-400">
                    @{u.username} · {u.policeGroupRank ?? "-"}
                  </p>
                </div>
                <Badge tone="neutral">Selesai</Badge>
                <button
                  onClick={() => loadGroups(u)}
                  className="rounded-md border border-gold/40 px-2.5 py-1 text-xs text-gold transition hover:bg-gold/10"
                >
                  Grup
                </button>
                <button
                  onClick={() => deleteUser(u.id, u.username)}
                  disabled={deletingId === u.id}
                  className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  {deletingId === u.id ? "..." : "Hapus"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sudah Absen, Belum Mulai */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">
          Sudah Absen, Belum Mulai ({sudahAbsen.length})
        </h3>
        {sudahAbsen.length === 0 ? (
          <p className="text-xs text-zinc-500">Tidak ada.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {sudahAbsen.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              >
                <img
                  src={u.avatarUrl ?? "/shield.svg"}
                  alt={u.displayName}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full border border-gold/40 object-cover"
                />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-medium text-zinc-200">{u.displayName}</p>
                  <p className="text-xs text-zinc-400">
                    @{u.username} · {u.policeGroupRank ?? "-"}
                    {u.discordUsername && <> · Discord: {u.discordUsername}</>}
                  </p>
                </div>
                <Badge tone="gold">Absen</Badge>
                <button
                  onClick={() => loadGroups(u)}
                  className="rounded-md border border-gold/40 px-2.5 py-1 text-xs text-gold transition hover:bg-gold/10"
                >
                  Grup
                </button>
                <button
                  onClick={() => deleteUser(u.id, u.username)}
                  disabled={deletingId === u.id}
                  className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                >
                  {deletingId === u.id ? "..." : "Hapus"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Daftar Grup */}
      {groupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setGroupModal(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-xl border border-gold/30 bg-[#12151c] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <img
                  src={groupModal.user.avatarUrl ?? "/shield.svg"}
                  alt={groupModal.user.displayName}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full border border-gold/40 object-cover"
                />
                <div>
                  <p className="text-sm font-semibold text-zinc-100">
                    {groupModal.user.displayName}
                  </p>
                  <p className="text-xs text-zinc-400">@{groupModal.user.username}</p>
                </div>
              </div>
              <button
                onClick={() => setGroupModal(null)}
                className="rounded p-1 text-zinc-400 transition hover:text-zinc-100"
                aria-label="Tutup"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              {groupModal.loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Grup Roblox */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Grup Roblox ({groupModal.groups.length})
                    </p>
                    {groupModal.groups.length === 0 ? (
                      <p className="text-sm text-zinc-500">Tidak ada grup Roblox.</p>
                    ) : (
                      <div className="space-y-2">
                        {groupModal.groups.map((g) => (
                          <div
                            key={g.groupId}
                            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-zinc-200">
                                {g.groupName}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {g.roleName} · Rank {g.roleRank}
                              </p>
                            </div>
                            {g.isPrimary && (
                              <span className="shrink-0 rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                                PRIMARY
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Server Discord */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Server Discord ({groupModal.discordGuilds.length})
                    </p>
                    {groupModal.discordError ? (
                      <p className="text-sm text-yellow-300/80">{groupModal.discordError}</p>
                    ) : groupModal.discordGuilds.length === 0 ? (
                      <p className="text-sm text-zinc-500">Tidak ada server Discord bersama.</p>
                    ) : (
                      <div className="space-y-2">
                        {groupModal.discordGuilds.map((g) => (
                          <div
                            key={g.guildId}
                            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-zinc-200">
                                  {g.guildName}
                                </p>
                                {g.memberCount != null && (
                                  <p className="text-xs text-zinc-500">
                                    {g.memberCount.toLocaleString("id-ID")} anggota
                                  </p>
                                )}
                              </div>
                            </div>
                            {g.isPrimary && (
                              <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                                UTAMA
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
