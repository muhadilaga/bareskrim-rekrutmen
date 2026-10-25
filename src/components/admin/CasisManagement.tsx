"use client";

import { useCallback, useEffect, useState } from "react";
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
  attendance: { id: string; discordUserId: string | null; createdAt: string; motivation: string | null; motivationStatus: string | null; motivationReason: string | null; motivationAttemptCount: number; roleEligible: boolean } | null;
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
  const [overrideModal, setOverrideModal] = useState<{
    user: CasisUser;
    saving: boolean;
    customReason: string;
  } | null>(null);
  const toast = useToastContext();

  async function overrideMotivation(
    attendanceId: string,
    motivationStatus: "APPROVED" | "REVIEW" | "REJECTED",
    roleEligible: boolean,
    reason?: string
  ) {
    if (!overrideModal) return;
    setOverrideModal((prev) => (prev ? { ...prev, saving: true } : null));
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          attendanceId,
          motivationStatus,
          roleEligible,
          motivationReason: reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Gagal update status.");
      toast.success(json.message ?? "Status motivasi berhasil diperbarui.");
      setOverrideModal(null);
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengupdate motivasi.");
      setOverrideModal((prev) => (prev ? { ...prev, saving: false } : null));
    }
  }

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
        `Hapus semua data "${username}"?\n\nYang ikut terhapus: absensi, sesi ujian, hasil ujian, dan data user. Tindakan ini permanen.`
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
        "Semua absensi, sesi ujian, hasil ujian, dan data user akan dihapus permanen. Tindakan ini TIDAK bisa dibatalkan."
      )
    )
      return;
    setDeletingId("__all__");
    // Yield ke main thread agar UI update sebelum fetch
    await new Promise((r) => setTimeout(r, 50));
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
    <article className="panel-card !p-6 sm:!p-8">
      {/* Panel Heading Prototype */}
      <div className="panel-heading !pb-4">
        <div>
          <span className="section-kicker">SELECTION</span>
          <h2 className="font-serif">Manajemen Casis</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Pantau status pengerjaan ujian dan kehadiran casis secara real-time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={deleteAllUsers}
            disabled={deletingId === "__all__" || users.length === 0}
            className="reject-button !min-h-[42px] px-4 text-xs font-semibold shrink-0"
          >
            {deletingId === "__all__" ? "Menghapus semua..." : `Hapus Semua (${users.length})`}
          </button>
          <button
            type="button"
            onClick={loadUsers}
            disabled={busy}
            className="outline-button !min-h-[42px] px-4 text-xs font-semibold shrink-0"
          >
            {busy ? "Memuat..." : "Refresh"}
          </button>
        </div>
      </div>

      {Boolean(msg?.text) && (
        <div
          className={`mt-4 rounded-[3px] border px-4 py-2.5 text-xs ${
            msg!.ok
              ? "border-[#68b478]/40 bg-[var(--surface-2)] text-[#68b478]"
              : "border-[#d87575]/40 bg-[#1e1313] text-[#d87575]"
          }`}
        >
          {msg!.text}
        </div>
      )}

      {/* Grid Status Ringkasan */}
      <div className="stats-grid !mt-6">
        <div className="stat-card">
          <span>Belum Absen</span>
          <strong>{belumAbsen.length}</strong>
          <small>terdaftar belum konfirmasi</small>
        </div>
        <div className="stat-card">
          <span>Sudah Absen</span>
          <strong>{sudahAbsen.length}</strong>
          <small>siap mulai ujian</small>
        </div>
        <div className="stat-card">
          <span>Sedang Mengerjakan</span>
          <strong className="text-[#68b478]">{sedangMengerjakan.length}</strong>
          <small>sesi ujian aktif</small>
        </div>
        <div className="stat-card">
          <span>Sudah Selesai</span>
          <strong>{sudahSelesai.length}</strong>
          <small>jawaban terkumpul</small>
        </div>
      </div>

      {/* Belum Absen */}
      <div className="mt-8 border-t border-[var(--border)] pt-6">
        <div className="card-heading !pb-3">
          <div>
            <span className="section-kicker">STATUS</span>
            <h3>Belum Absen ({belumAbsen.length})</h3>
          </div>
        </div>
        {belumAbsen.length === 0 ? (
          <p className="py-4 text-xs text-[var(--muted)]">Tidak ada. Semua casis yang terdaftar sudah pernah absen atau daftar user masih kosong.</p>
        ) : (
          <div className="case-list !mt-2">
            {belumAbsen.map((u) => (
              <div
                key={u.id}
                className="case-card flex flex-wrap items-center justify-between gap-3 !py-3"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={u.avatarUrl ?? "/shield.svg"}
                    alt={u.displayName}
                    width={34}
                    height={34}
                    className="h-8.5 w-8.5 rounded-full border border-[var(--border-strong)] object-cover"
                  />
                  <div>
                    <strong className="text-sm font-semibold text-[var(--text)]">{u.displayName}</strong>
                    <p className="text-xs text-[var(--muted)]">
                      @{u.username} · {u.policeGroupRank ?? "-"}
                      {u.discordUsername && <> · Discord: {u.discordUsername}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="status-badge">Belum Absen</span>
                  <button
                    type="button"
                    onClick={() => deleteUser(u.id, u.username)}
                    disabled={deletingId === u.id}
                    className="reject-button !min-h-[34px] !px-3 text-xs"
                  >
                    {deletingId === u.id ? "..." : "Hapus"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sedang Mengerjakan */}
      <div className="mt-6 border-t border-[var(--border)] pt-6">
        <div className="card-heading !pb-3">
          <div>
            <span className="section-kicker">AKTIF</span>
            <h3 className="text-[#68b478]">Sedang Mengerjakan ({sedangMengerjakan.length})</h3>
          </div>
        </div>
        {sedangMengerjakan.length === 0 ? (
          <p className="py-4 text-xs text-[var(--muted)]">Tidak ada yang sedang mengerjakan. Kalau seharusnya ada, cek apakah sesi ujian sudah expired atau belum dibuat.</p>
        ) : (
          <div className="case-list !mt-2">
            {sedangMengerjakan.map((u) => (
              <div
                key={u.id}
                className="case-card flex flex-wrap items-center justify-between gap-3 !py-3 border-l-2 border-l-[#68b478] pl-3"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={u.avatarUrl ?? "/shield.svg"}
                    alt={u.displayName}
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full border border-[var(--border-strong)] object-cover"
                  />
                  <div>
                    <strong className="text-sm font-semibold text-[var(--text)]">{u.displayName}</strong>
                    <p className="text-xs text-[var(--muted)]">
                      @{u.username} · {u.policeGroupRank ?? "-"}
                      {u.discordUsername && <> · Discord: {u.discordUsername}</>}
                    </p>
                    <p className="text-[11px] text-[var(--muted-2)]">
                      Mulai: {new Date(u.attempt!.startedAt).toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="status-badge active">Mengerjakan</span>
                  <button
                    type="button"
                    onClick={() => loadGroups(u)}
                    className="outline-button !min-h-[34px] !px-3 text-xs"
                  >
                    Grup
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteUser(u.id, u.username)}
                    disabled={deletingId === u.id}
                    className="reject-button !min-h-[34px] !px-3 text-xs"
                  >
                    {deletingId === u.id ? "..." : "Hapus"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sudah Selesai */}
      <div className="mt-6 border-t border-[var(--border)] pt-6">
        <div className="card-heading !pb-3">
          <div>
            <span className="section-kicker">SELESAI</span>
            <h3>Sudah Selesai ({sudahSelesai.length})</h3>
          </div>
        </div>
        {sudahSelesai.length === 0 ? (
          <p className="py-4 text-xs text-[var(--muted)]">Belum ada yang selesai.</p>
        ) : (
          <div className="case-list !mt-2">
            {sudahSelesai.map((u) => (
              <div
                key={u.id}
                className="case-card flex flex-wrap items-center justify-between gap-3 !py-3"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={u.avatarUrl ?? "/shield.svg"}
                    alt={u.displayName}
                    width={34}
                    height={34}
                    className="h-8.5 w-8.5 rounded-full border border-[var(--border-strong)] object-cover"
                  />
                  <div>
                    <strong className="text-sm font-semibold text-[var(--text)]">{u.displayName}</strong>
                    <p className="text-xs text-[var(--muted)]">
                      @{u.username} · {u.policeGroupRank ?? "-"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="status-badge">Selesai</span>
                  <button
                    type="button"
                    onClick={() => loadGroups(u)}
                    className="outline-button !min-h-[34px] !px-3 text-xs"
                  >
                    Grup
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteUser(u.id, u.username)}
                    disabled={deletingId === u.id}
                    className="reject-button !min-h-[34px] !px-3 text-xs"
                  >
                    {deletingId === u.id ? "..." : "Hapus"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sudah Absen, Belum Mulai */}
      <div className="mt-6 border-t border-[var(--border)] pt-6">
        <div className="card-heading !pb-3">
          <div>
            <span className="section-kicker">KEHADIRAN</span>
            <h3>Sudah Absen, Belum Mulai ({sudahAbsen.length})</h3>
          </div>
        </div>
        {sudahAbsen.length === 0 ? (
          <p className="py-4 text-xs text-[var(--muted)]">Tidak ada.</p>
        ) : (
          <div className="case-list !mt-2">
            {sudahAbsen.map((u) => (
              <div
                key={u.id}
                className="case-card flex flex-wrap items-center justify-between gap-3 !py-3"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={u.avatarUrl ?? "/shield.svg"}
                    alt={u.displayName}
                    width={34}
                    height={34}
                    className="h-8.5 w-8.5 rounded-full border border-[var(--border-strong)] object-cover"
                  />
                  <div>
                    <strong className="text-sm font-semibold text-[var(--text)]">{u.displayName}</strong>
                    <p className="text-xs text-[var(--muted)]">
                      @{u.username} · {u.policeGroupRank ?? "-"}
                      {u.discordUsername && <> · Discord: {u.discordUsername}</>}
                    </p>
                    {u.attendance?.motivationStatus && (
                      <p className="mt-1 text-[11px] text-[var(--muted-2)]">
                        Motivasi: {u.attendance.motivationStatus} · percobaan {u.attendance.motivationAttemptCount}/2
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="status-badge pending">Absen</span>
                  {u.attendance && (
                    <button
                      type="button"
                      onClick={() =>
                        setOverrideModal({
                          user: u,
                          saving: false,
                          customReason: u.attendance?.motivationReason || "",
                        })
                      }
                      className="outline-button !min-h-[34px] !px-3 text-xs border-[#d4af37]/40 text-[#f5d77f] hover:bg-[#d4af37]/10"
                    >
                      Tinjau Motivasi
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => loadGroups(u)}
                    className="outline-button !min-h-[34px] !px-3 text-xs"
                  >
                    Grup
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteUser(u.id, u.username)}
                    disabled={deletingId === u.id}
                    className="reject-button !min-h-[34px] !px-3 text-xs"
                  >
                    {deletingId === u.id ? "..." : "Hapus"}
                  </button>
                </div>
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
            className="w-full max-w-md overflow-hidden rounded-[3px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-3">
                <img
                  src={groupModal.user.avatarUrl ?? "/shield.svg"}
                  alt={groupModal.user.displayName}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full border border-[var(--border-strong)] object-cover"
                />
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {groupModal.user.displayName}
                  </p>
                  <p className="text-xs text-[var(--muted)]">@{groupModal.user.username}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGroupModal(null)}
                className="rounded p-1 text-[var(--muted)] transition hover:text-[var(--text)]"
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
                  <Skeleton className="h-10 w-full rounded" />
                  <Skeleton className="h-10 w-full rounded" />
                  <Skeleton className="h-10 w-full rounded" />
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Grup Roblox */}
                  <div>
                    <span className="section-kicker mb-2 block">
                      Grup Roblox ({groupModal.groups.length})
                    </span>
                    {groupModal.groups.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">Tidak ada grup Roblox.</p>
                    ) : (
                      <div className="space-y-2">
                        {groupModal.groups.map((g) => (
                          <div
                            key={g.groupId}
                            className="flex items-center justify-between gap-2 rounded-[3px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--text)]">
                                {g.groupName}
                              </p>
                              <p className="text-xs text-[var(--muted)]">
                                {g.roleName} · Rank {g.roleRank}
                              </p>
                            </div>
                            {g.isPrimary && (
                              <span className="status-badge pending shrink-0 text-[10px]">
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
                    <span className="section-kicker mb-2 block">
                      Server Discord ({groupModal.discordGuilds.length})
                    </span>
                    {groupModal.discordError ? (
                      <p className="text-sm text-yellow-300/80">{groupModal.discordError}</p>
                    ) : groupModal.discordGuilds.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">Tidak ada server Discord bersama.</p>
                    ) : (
                      <div className="space-y-2">
                        {groupModal.discordGuilds.map((g) => (
                          <div
                            key={g.guildId}
                            className="flex items-center justify-between gap-2 rounded-[3px] border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-[var(--text)]">
                                  {g.guildName}
                                </p>
                                {g.memberCount != null && (
                                  <p className="text-xs text-[var(--muted)]">
                                    {g.memberCount.toLocaleString("id-ID")} anggota
                                  </p>
                                )}
                              </div>
                            </div>
                            {g.isPrimary && (
                              <span className="status-badge active shrink-0 text-[10px]">
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

      {/* Modal Tinjau & Override Motivasi Casis */}
      {overrideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOverrideModal(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-[3px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <span className="section-kicker">EVALUASI INSTRUKTUR</span>
                <h3 className="font-serif text-lg text-[var(--text)]">Tinjau & Override Motivasi</h3>
                <p className="text-xs text-[var(--muted)]">
                  Casis: <strong className="text-[var(--text)]">{overrideModal.user.displayName}</strong> (@{overrideModal.user.username})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOverrideModal(null)}
                className="text-lg text-[var(--muted)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Teks Motivasi Casis:
                </label>
                <div className="mt-1.5 p-3 rounded-[3px] border border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--text)] leading-relaxed italic max-h-40 overflow-y-auto">
                  {overrideModal.user.attendance?.motivation || "(Casis belum mengisi motivasi)"}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-[3px] border border-[var(--border)] bg-[var(--surface-2)]">
                  <span className="text-[var(--muted)] block">Status Motivasi:</span>
                  <strong className="text-sm">
                    {overrideModal.user.attendance?.motivationStatus || "REVIEW"}
                  </strong>
                </div>
                <div className="p-2.5 rounded-[3px] border border-[var(--border)] bg-[var(--surface-2)]">
                  <span className="text-[var(--muted)] block">Kelayakan Tahap Akademik:</span>
                  <strong
                    className={`text-sm ${
                      overrideModal.user.attendance?.roleEligible
                        ? "text-[#68b478]"
                        : "text-[#d87575]"
                    }`}
                  >
                    {overrideModal.user.attendance?.roleEligible ? "Lolos (Aktif)" : "Belum Lolos"}
                  </strong>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Catatan / Alasan Instruktur:
                </label>
                <input
                  type="text"
                  value={overrideModal.customReason}
                  onChange={(e) =>
                    setOverrideModal((prev) =>
                      prev ? { ...prev, customReason: e.target.value } : null
                    )
                  }
                  placeholder="Catatan persetujuan / revisi untuk casis..."
                  className="mt-1 w-full rounded-[3px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text)]"
                />
              </div>

              <div className="pt-2 border-t border-[var(--border)] flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  disabled={overrideModal.saving}
                  onClick={() =>
                    overrideModal.user.attendance &&
                    overrideMotivation(
                      overrideModal.user.attendance.id,
                      "APPROVED",
                      true,
                      overrideModal.customReason || "Disetujui instruktur Pusdik Reserse."
                    )
                  }
                  className="primary-button !min-h-[38px] !px-4 text-xs font-semibold !bg-[#68b478] hover:!bg-[#58a468] !text-black"
                >
                  {overrideModal.saving ? "Menyimpan..." : "✓ Setujui (Lolos Akademik)"}
                </button>
                <button
                  type="button"
                  disabled={overrideModal.saving}
                  onClick={() =>
                    overrideModal.user.attendance &&
                    overrideMotivation(
                      overrideModal.user.attendance.id,
                      "REVIEW",
                      false,
                      overrideModal.customReason || "Perlu revisi motivasi lebih terstruktur."
                    )
                  }
                  className="outline-button !min-h-[38px] !px-3 text-xs font-semibold border-amber-500/50 text-amber-300"
                >
                  ⚡ Minta Revisi
                </button>
                <button
                  type="button"
                  disabled={overrideModal.saving}
                  onClick={() =>
                    overrideModal.user.attendance &&
                    overrideMotivation(
                      overrideModal.user.attendance.id,
                      "REJECTED",
                      false,
                      overrideModal.customReason || "Motivasi tidak memenuhi standar Pusdik Reserse."
                    )
                  }
                  className="reject-button !min-h-[38px] !px-3 text-xs font-semibold"
                >
                  ✕ Tolak Motivasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
