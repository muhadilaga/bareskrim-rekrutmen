"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CandidatesTab } from "@/components/admin/CandidatesTab";
import { BlacklistTab } from "@/components/admin/BlacklistTab";
import { CasisManagement } from "@/components/admin/CasisManagement";
import { DiscordMessagesTab } from "@/components/admin/DiscordMessagesTab";
import { useToastContext } from "@/components/ui/Toast";

interface Stats {
  totalUsers: number;
  totalAttendance: number;
  totalAttempts: number;
  totalResults: number;
  passedResults: number;
  failedResults: number;
  inProgress: number;
  passRate: number;
  mcqCount: number;
  essayCount: number;
  periodId: string | null;
}

interface LogItem {
  id: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

interface PeriodItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isAttendanceOpen: boolean;
  isExamOpen: boolean;
  seed: number;
  mcqCount: number | null;
  essayCount: number | null;
  passThreshold: number;
  openedAt: string;
  closedAt: string | null;
  examStartTime: string | null;
  examEndTime: string | null;
  _count: { attempts: number; attendances: number };
  attempts: Array<{
    id: string;
    submittedAt: string | null;
    user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  }>;
  attendances: Array<{
    id: string;
    discordUserId: string | null;
    user: { id: string; username: string; displayName: string } | null;
  }>;
}

interface QuestionItem {
  id: string;
  type: "MCQ" | "ESSAY";
  prompt: string;
  options: Array<{ key: string; text: string }> | null;
  correctKey: string | null;
  keywords: string[] | null;
  points: number;
  isActive: boolean;
}

export function AdminPanel() {
  const [key, setKey] = useState(
    () => (typeof window !== "undefined" ? (sessionStorage.getItem("admin_key") ?? "") : "")
  );
  const [showKey, setShowKey] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"periode" | "bank" | "rekap" | "casis" | "data" | "log" | "discord" | "settings">("periode");
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
   const headers = useMemo(
     () => ({ "Content-Type": "application/json", "x-admin-key": key }),
     [key]
   );
  const toast = useToastContext();

  // Download backup JSON
  const downloadBackup = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/backup", { headers });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setMsg(json);
        setBusy(false);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bareskrim-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setMsg({ ok: true, text: "Backup JSON berhasil diunduh!" });
    } catch {
      setMsg({ ok: false, text: "Gagal mengunduh backup." });
    } finally {
      setBusy(false);
    }
  }, [headers]);

  // form periode
  const [periodName, setPeriodName] = useState("");
  const [periodMcq, setPeriodMcq] = useState("");
  const [periodEssay, setPeriodEssay] = useState("");
  const [periodKkm, setPeriodKkm] = useState("");
   // form edit periode (tanggal + konfigurasi)
   const [editingDates, setEditingDates] = useState<{
     id: string;
     openedAt: string;
     closedAt: string;
     mcqCount: string;
     essayCount: string;
     passThreshold: string;
     examStartTime: string;
     examEndTime: string;
   } | null>(null);
  // form soal
  const [qType, setQType] = useState<"MCQ" | "ESSAY">("MCQ");
  const [qPrompt, setQPrompt] = useState("");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState(0);
  const [qKeywords, setQKeywords] = useState("");
  const [qPoints, setQPoints] = useState(4);

  // Auto-login saat mount jika sudah ada kunci tersimpan di session.
  const initialCheckRef = useRef(false);
  useEffect(() => {
    if (initialCheckRef.current) return;
    initialCheckRef.current = true;
    if (sessionStorage.getItem("admin_key")) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    const [p, q, d] = await Promise.all([
      fetch("/api/admin/period", { headers }),
      fetch("/api/admin/questions", { headers }),
      fetch("/api/admin/init", { headers }),
    ]);
    // Hanya batalkan authed bila kunci ditolak server (401/403).
    // Kegagalan lain (network, 5xx) TIDAK membuat user keluar.
    if (p.status === 401 || p.status === 403 || q.status === 401 || q.status === 403) {
      setAuthed(false);
      setMsg({ ok: false, text: "Kunci admin salah." });
      return;
    }
    if (!p.ok || !q.ok) {
      setMsg({ ok: false, text: "Gagal memuat data. Coba lagi." });
      return;
    }
    const pj = await p.json();
    const qj = await q.json();
    const dj = d.ok ? await d.json() : null;
    setPeriods(pj.periods);
    setQuestions(qj.questions);
    setDbReady(dj?.initialized ?? true);
    setAuthed(true);
    // Simpan kunci agar tidak perlu memasukkan ulang saat pindah panel/refresh.
    if (key) sessionStorage.setItem("admin_key", key);
    // Muat statistik & log secara best-effort
    fetch("/api/admin/stats", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((sj) => setStats(sj?.stats ?? null))
      .catch(() => {});
    fetch("/api/admin/logs?limit=30", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((lj) => setLogs(lj?.logs ?? []))
      .catch(() => {});
  }, [headers, key]);

  async function initDb() {
    setBusy(true);
    const res = await fetch("/api/admin/init", { method: "POST", headers });
    const json = await res.json();
    setMsg(json);
    setDbReady(json.initialized ?? false);
    setBusy(false);
    if (json.initialized) await load();
  }

  async function openPeriod() {
    if (!periodName.trim()) return;
    setBusy(true);
    const body: Record<string, unknown> = { name: periodName.trim() };
    if (periodMcq.trim()) body.mcqCount = Number(periodMcq.trim());
    if (periodEssay.trim()) body.essayCount = Number(periodEssay.trim());
    if (periodKkm.trim()) body.passThreshold = Number(periodKkm.trim());
    const res = await fetch("/api/admin/period", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMsg(json);
    setPeriodName("");
    setPeriodMcq("");
    setPeriodEssay("");
    setPeriodKkm("");
    setBusy(false);
    if (json.ok) await load();
  }

  // Format ISO -> nilai input datetime-local (waktu lokal browser)
  function toLocalInputValue(d: string | null): string {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
      dt.getHours()
    )}:${pad(dt.getMinutes())}`;
  }

   async function savePeriodDates() {
     if (!editingDates) return;
     setBusy(true);
     const body: Record<string, unknown> = { periodId: editingDates.id, action: "edit" };
     if (editingDates.openedAt) body.openedAt = new Date(editingDates.openedAt).toISOString();
     else body.openedAt = null;
     if (editingDates.closedAt) body.closedAt = new Date(editingDates.closedAt).toISOString();
     else body.closedAt = null;
     if (editingDates.mcqCount.trim()) body.mcqCount = Number(editingDates.mcqCount.trim());
     if (editingDates.essayCount.trim()) body.essayCount = Number(editingDates.essayCount.trim());
     if (editingDates.passThreshold.trim())
       body.passThreshold = Number(editingDates.passThreshold.trim());
     if (editingDates.examStartTime) body.examStartTime = new Date(editingDates.examStartTime).toISOString();
     else body.examStartTime = null;
     if (editingDates.examEndTime) body.examEndTime = new Date(editingDates.examEndTime).toISOString();
     else body.examEndTime = null;
     const res = await fetch("/api/admin/period", {
       method: "PATCH",
       headers,
       body: JSON.stringify(body),
     });
     const json = await res.json();
     setMsg(json);
     setEditingDates(null);
     setBusy(false);
     if (json.ok) await load();
   }

  async function addQuestion() {
    if (!qPrompt.trim()) return;
    setBusy(true);
    const body =
      qType === "MCQ"
        ? {
            type: "MCQ",
            prompt: qPrompt.trim(),
            options: qOptions.filter((o) => o.trim()),
            correctIndex: qCorrect,
            points: qPoints,
          }
        : {
            type: "ESSAY",
            prompt: qPrompt.trim(),
            keywords: qKeywords.split(",").map((k) => k.trim()).filter(Boolean),
            points: qPoints,
          };
    const res = await fetch("/api/admin/questions", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setMsg(json);
    setQPrompt("");
    setBusy(false);
    if (json.ok) await load();
  }

  if (!authed) {
    return (
      <Card strong className="mx-auto w-full max-w-md p-8 animate-scale-in">
        <h2 className="font-display text-lg font-bold gold-text">Masuk Admin</h2>
        <div className="gold-line my-3" />
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            className="w-full rounded-lg border border-white/15 bg-white/5 py-2.5 pl-4 pr-11 text-sm text-zinc-100 outline-none focus:border-gold/60"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? "Sembunyikan kunci" : "Tampilkan kunci"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 transition hover:text-zinc-200"
          >
            {showKey ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            )}
          </button>
        </div>
        <Button variant="gold" className="mt-4 w-full" onClick={load}>
          Masuk
        </Button>
        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {msg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Status Database */}
      {dbReady === false && (
        <Card strong className="border-red-500/40 p-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-red-300">⚠️ Database Belum Siap</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Tabel belum ditemukan. Klik tombol di samping untuk membuat semua tabel secara
                otomatis (tidak perlu terminal/CLI).                 Pastikan <code className="text-gold">DATABASE_URL</code>{" "}
                sudah diisi di environment variables Vercel.
              </p>
            </div>
            <Button variant="gold" onClick={initDb} disabled={busy} className="shrink-0">
              {busy ? "Membuat tabel..." : "Initialize Database"}
            </Button>
          </div>
        </Card>
      )}

      {/* Ringkasan Statistik */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Casis Terdaftar", value: stats.totalUsers, icon: "👥" },
            { label: "Absensi", value: stats.totalAttendance, icon: "✅" },
            { label: "Ujian Selesai", value: stats.totalResults, icon: "📝" },
            { label: "Lulus", value: `${stats.passedResults} (${stats.passRate}%)`, icon: "🎖️" },
            { label: "Tidak Lulus", value: stats.failedResults, icon: "❌" },
            { label: "Sedang Mengerjakan", value: stats.inProgress, icon: "⏳" },
            { label: "Soal PG", value: stats.mcqCount, icon: "📋" },
            { label: "Soal Essay", value: stats.essayCount, icon: "✍️" },
          ].map((s) => (
            <Card key={s.label} strong className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{s.icon}</span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-zinc-400">{s.label}</p>
                  <p className="font-display text-xl font-bold gold-text">{s.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Navigasi tab */}
      <div className="flex overflow-hidden rounded-lg border border-white/15">
        {(
          [
            ["periode", "Periode"],
            ["bank", "Bank Soal"],
            ["rekap", "Rekap Nilai"],
            ["casis", "Kelola Casis"],
            ["data", "Putusan & Blacklist"],
["discord", "Discord"],
              ["settings", "Pengaturan"],
              ["log", "Audit Log"],
          ] as [typeof tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-2.5 text-sm font-semibold transition ${
              tab === t ? "bg-crimson-800 text-gold" : "bg-white/5 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "log" && (
        <Card strong className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold gold-text">📋 Audit Log</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (!confirm("Retry semua laporan Discord yang gagal? Maksimal 3x per laporan."))
                    return;
                  setBusy(true);
                  const res = await fetch("/api/cron/discord-retry", { method: "GET", headers });
                  const json = await res.json();
                  setMsg(json);
                  setBusy(false);
                  if (json.ok) {
                    toast.success(json.message);
                    if (json.processed > 0) await load();
                  } else {
                    toast.error(json.message ?? "Gagal retry.");
                  }
                }}
                disabled={busy}
                className="text-xs text-gold/80 underline-offset-2 hover:text-gold hover:underline disabled:opacity-50"
              >
                Retry Discord
              </button>
              <button
                onClick={() =>
                  fetch("/api/admin/logs?limit=30", { headers })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((lj) => setLogs(lj?.logs ?? []))
                    .catch(() => {})
                }
                className="text-xs text-gold/80 underline-offset-2 hover:underline"
              >
                Muat ulang
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Hapus seluruh log audit? Tindakan ini tidak dapat dibatalkan."))
                    return;
                  setBusy(true);
                  const res = await fetch("/api/admin/logs", { method: "DELETE", headers });
                  const json = await res.json();
                  setMsg(json);
                  setBusy(false);
                  if (json.ok) {
                    setLogs([]);
                    toast.success(json.message);
                  } else {
                    toast.error(json.message ?? "Gagal menghapus log.");
                  }
                }}
                disabled={busy || logs.length === 0}
                className="text-xs text-red-400/80 underline-offset-2 hover:text-red-300 hover:underline disabled:opacity-50"
              >
                Hapus Semua Log
              </button>
            </div>
          </div>
          <div className="gold-line my-3" />
          {logs.length === 0 ? (
            <p className="text-sm text-zinc-500">Belum ada aktivitas admin tercatat.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded bg-crimson-800/60 px-2 py-0.5 font-mono text-xs font-bold text-gold">
                      {log.action}
                    </span>
                    {log.target && <span className="text-zinc-200">{log.target}</span>}
                    <span className="ml-auto font-mono text-xs text-zinc-500">
                      {new Date(log.createdAt).toLocaleString("id-ID")}
                    </span>
                  </div>
                  {log.detail && Object.keys(log.detail).length > 0 && (
                    <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-zinc-400">
                      {JSON.stringify(log.detail, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "settings" && (
        <Card strong className="p-6">
          <h2 className="font-display text-lg font-bold gold-text">⚙️ Pengaturan Sistem</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Perubahan pada pengaturan di bawah ini akan mempengaruhi seluruh sistem. Beberapa pengaturan memerlukan restart server.
          </p>
          <SettingsForm headers={headers} />
        </Card>
      )}

      {tab === "periode" && (
        <>
      {/* Periode */}
      <Card strong className="p-6">
        <h2 className="font-display text-lg font-bold gold-text">🕐 Kelola Periode Rekrutmen</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={downloadBackup} disabled={busy} className="shrink-0">
            {busy ? "Membuat backup..." : "Unduh Backup JSON"}
          </Button>
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          <p>Membuka periode baru otomatis menutup periode lama dan mengacak ulang bank soal dengan seed baru.</p>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={periodName}
            onChange={(e) => setPeriodName(e.target.value)}
            placeholder="Nama periode, contoh: Rekrutmen Gelombang 2"
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-gold/60"
          />
          <Button variant="gold" onClick={openPeriod} disabled={busy}>
            {busy ? "Proses..." : "Buka Periode Baru"}
          </Button>
          <Button variant="ghost" onClick={load} disabled={busy} className="shrink-0">
            {busy ? "Memuat..." : "Refresh Data"}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                          Jumlah Soal Pilihan Ganda (kosong = default 15)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={periodMcq}
              onChange={(e) => setPeriodMcq(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              placeholder="15"
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Jumlah Soal Essay (kosong = default 5)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={periodEssay}
              onChange={(e) => setPeriodEssay(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
              placeholder="5"
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              KKM / Nilai Lulus (kosong = default 70)
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={periodKkm}
              onChange={(e) => setPeriodKkm(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              placeholder="75"
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
            />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {periods.map((p) => {
            const mengerjakan = p.attempts.filter((a) => !a.submittedAt);
            const selesai = p.attempts.filter((a) => a.submittedAt);
            const absenOnly = p.attendances.filter(
              (a) => !p.attempts.some((at) => at.user.id === a.user?.id)
            );

            return (
              <div
                key={p.id}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{p.name}</p>
                    <p className="text-xs text-zinc-500">
                      Seed: {p.seed} · Dibuka: {new Date(p.openedAt).toLocaleString("id-ID")}
                    </p>
                     <p className="text-xs text-zinc-500">
                       Soal: {p.mcqCount ?? "15"} Pilihan Ganda · {p.essayCount ?? "5"} Essay · KKM: {p.passThreshold}
                     </p>
                     {p.examStartTime && (
                       <p className="text-xs text-zinc-500">
                         Mulai: {new Date(p.examStartTime).toLocaleString("id-ID")}
                       </p>
                     )}
                     {p.examEndTime && (
                       <p className="text-xs text-zinc-500">
                         Tutup: {new Date(p.examEndTime).toLocaleString("id-ID")}
                       </p>
                     )}
                     {p.closedAt && (
                      <p className="text-xs text-red-400">
                        Ditutup: {new Date(p.closedAt).toLocaleString("id-ID")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={p.isActive ? "green" : "neutral"}>
                      {p.isActive ? "AKTIF" : "DITUTUP"}
                    </Badge>
                    {p.isActive && (
                      <Badge tone={p.isExamOpen ? "green" : "neutral"}>
                        {p.isExamOpen ? "UJIAN BUKA" : "UJIAN TUTUP"}
                      </Badge>
                    )}
                    {p.isActive && (
                      <Badge tone={p.isAttendanceOpen ? "green" : "neutral"}>
                        {p.isAttendanceOpen ? "ABSEN BUKA" : "ABSEN TUTUP"}
                      </Badge>
                    )}
                     <button
                       onClick={() =>
                         setEditingDates((cur) =>
                           cur?.id === p.id
                             ? null
                             : {
                                 id: p.id,
                                 openedAt: toLocalInputValue(p.openedAt),
                                 closedAt: toLocalInputValue(p.closedAt),
                                 mcqCount: p.mcqCount != null ? String(p.mcqCount) : "",
                                 essayCount: p.essayCount != null ? String(p.essayCount) : "",
                                 passThreshold: String(p.passThreshold),
                                 examStartTime: p.examStartTime
                                   ? toLocalInputValue(p.examStartTime)
                                   : "",
                                 examEndTime: p.examEndTime
                                   ? toLocalInputValue(p.examEndTime)
                                   : "",
                               }
                         )
                       }
                      className="rounded-md border border-gold/40 px-2.5 py-1 text-xs text-gold transition hover:bg-gold/10"
                    >
                      {editingDates?.id === p.id ? "Batal" : "Edit Periode"}
                    </button>
                    {p.isActive && (
                      <button
                        onClick={async () => {
                          const newExamOpen = !p.isExamOpen;
                          const res = await fetch("/api/admin/period", {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ periodId: p.id, action: "toggleExamOpen", isExamOpen: newExamOpen }),
                          });
                          const json = await res.json();
                          setMsg({ ok: json.ok, text: json.message });
                          if (json.ok) await load();
                        }}
                        className={`rounded-md border px-2.5 py-1 text-xs transition ${
                          p.isExamOpen
                            ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                            : "border-white/20 text-zinc-400 hover:bg-white/10"
                        }`}
                      >
                        {p.isExamOpen ? "Buka Ujian ✓" : "Buka Ujian"}
                      </button>
                    )}
                    {p.isActive && (
                      <button
                        onClick={async () => {
                          const newAttendanceOpen = !p.isAttendanceOpen;
                          const res = await fetch("/api/admin/period", {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ periodId: p.id, action: "toggleAttendanceOpen", isAttendanceOpen: newAttendanceOpen }),
                          });
                          const json = await res.json();
                          setMsg({ ok: json.ok, text: json.message });
                          if (json.ok) await load();
                        }}
                        className={`rounded-md border px-2.5 py-1 text-xs transition ${
                          p.isAttendanceOpen
                            ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                            : "border-white/20 text-zinc-400 hover:bg-white/10"
                        }`}
                      >
                        {p.isAttendanceOpen ? "Buka Absen ✓" : "Buka Absen"}
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!window.confirm(p.isActive ? "Tutup periode ini?" : "Buka kembali periode ini?"))
                          return;
                        const action = p.isActive ? "close" : "reopen";
                        const res = await fetch("/api/admin/period", {
                          method: "PATCH",
                          headers,
                          body: JSON.stringify({ periodId: p.id, action }),
                        });
                        const json = await res.json();
                        setMsg({ ok: json.ok, text: json.message });
                        if (json.ok) await load();
                      }}
                      className={`rounded-md border px-2.5 py-1 text-xs transition ${
                        p.isActive
                          ? "border-red-500/40 text-red-400 hover:bg-red-500/10"
                          : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                      }`}
                    >
                      {p.isActive ? "Tutup" : "Buka"}
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm("Reset ujian periode ini? Semua attempt dan hasil akan dihapus, tetapi attendance tetap. Casfis bisa mengikuti ujian lagi."))
                          return;
                        const res = await fetch("/api/admin/period", {
                          method: "PATCH",
                          headers,
                          body: JSON.stringify({ periodId: p.id, action: "reset" }),
                        });
                        const json = await res.json();
                        setMsg({ ok: json.ok, text: json.message });
                        if (json.ok) {
                          toast.success(json.message);
                          await load();
                        } else {
                          toast.error(json.message ?? "Gagal mereset.");
                        }
                      }}
                      className="rounded-md border border-orange-500/40 px-2.5 py-1 text-xs text-orange-400 transition hover:bg-orange-500/10"
                    >
                      Reset Ujian
                    </button>
                  </div>
                </div>

                {/* Form edit periode */}
                {editingDates?.id === p.id && (
                  <div className="mt-3 rounded-lg border border-gold/20 bg-gold/5 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                       <div>
                         <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                           Tanggal Buka Absen
                         </label>
                         <input
                           type="datetime-local"
                           value={editingDates.openedAt}
                           onChange={(e) =>
                             setEditingDates((cur) =>
                               cur ? { ...cur, openedAt: e.target.value } : cur
                             )
                           }
                           className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                         />
                       </div>
                       <div>
                         <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                           Tanggal Tutup Absen (kosongkan = tanpa tanggal tutup)
                         </label>
                         <input
                           type="datetime-local"
                           value={editingDates.closedAt}
                           onChange={(e) =>
                             setEditingDates((cur) =>
                               cur ? { ...cur, closedAt: e.target.value } : cur
                             )
                           }
                           className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                         />
                       </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Jumlah Soal Pilihan Ganda (kosong = default 15)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={editingDates.mcqCount}
                          onChange={(e) =>
                            setEditingDates((cur) =>
                              cur
                                ? {
                                    ...cur,
                                    mcqCount: e.target.value.replace(/[^0-9]/g, "").slice(0, 2),
                                  }
                                : cur
                            )
                          }
                          placeholder="15"
                          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Jumlah Soal Essay (kosong = default 5)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={editingDates.essayCount}
                          onChange={(e) =>
                            setEditingDates((cur) =>
                              cur
                                ? {
                                    ...cur,
                                    essayCount: e.target.value.replace(/[^0-9]/g, "").slice(0, 2),
                                  }
                                : cur
                            )
                          }
                          placeholder="5"
                          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          KKM / Nilai Lulus
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={editingDates.passThreshold}
                          onChange={(e) =>
                            setEditingDates((cur) =>
                              cur
                                ? {
                                    ...cur,
                                    passThreshold: e.target.value.replace(/[^0-9]/g, "").slice(0, 4),
                                  }
                                : cur
                            )
                          }
                           placeholder="70"
                           className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                         />
                       </div>
                       <div>
                         <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                           Waktu Mulai Ujian (kosongkan = tidak diatur)
                         </label>
                         <input
                           type="datetime-local"
                           value={editingDates.examStartTime}
                           onChange={(e) =>
                             setEditingDates((cur) =>
                               cur
                                 ? { ...cur, examStartTime: e.target.value }
                                 : cur
                             )
                           }
                           className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                         />
                       </div>
                       <div>
                         <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                           Waktu Tutup Ujian (kosongkan = tidak diatur)
                         </label>
                         <input
                           type="datetime-local"
                           value={editingDates.examEndTime}
                           onChange={(e) =>
                             setEditingDates((cur) =>
                               cur
                                 ? { ...cur, examEndTime: e.target.value }
                                 : cur
                             )
                           }
                           className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                         />
                       </div>
                     </div>
                     <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="gold"
                        onClick={savePeriodDates}
                        disabled={busy}
                        className="shrink-0"
                      >
                        {busy ? "Menyimpan..." : "Simpan Perubahan"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setEditingDates(null)}
                        disabled={busy}
                        className="shrink-0"
                      >
                        Batal
                      </Button>
                    </div>
                  </div>
                )}

                {/* Daftar Peserta */}
                <div className="mt-3 border-t border-white/5 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Peserta ({p._count.attendances} absen · {p._count.attempts} ujian)
                  </p>

                  {p.attendances.length === 0 && p.attempts.length === 0 ? (
                    <p className="text-xs text-zinc-600">Belum ada peserta.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {p.attendances.map((a) => {
                        const attempt = p.attempts.find((at) => at.user.id === a.user?.id);
                        const isDone = attempt?.submittedAt != null;
                        const isWorking = attempt && !attempt.submittedAt;

                        return (
                          <div
                            key={a.id}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                              isWorking
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                : isDone
                                  ? "border-white/10 bg-white/5 text-zinc-400"
                                  : "border-gold/30 bg-gold/5 text-gold"
                            }`}
                            title={
                              isWorking
                                ? "Sedang mengerjakan"
                                : isDone
                                  ? `Selesai - ${new Date(attempt.submittedAt!).toLocaleString("id-ID")}`
                                  : "Sudah absen, belum mulai"
                            }
                          >
                            <span>{a.user?.displayName ?? a.discordUserId ?? "?"}</span>
                            {isWorking && <span className="animate-pulse">●</span>}
                            {isDone && <span>✓</span>}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const name = a.user?.displayName ?? a.discordUserId ?? "?";
                                if (!window.confirm(`Hapus absensi & ujian "${name}" dari periode ini?`))
                                  return;
                                const res = await fetch(`/api/admin/attendance?id=${encodeURIComponent(a.id)}`, {
                                  method: "DELETE",
                                  headers,
                                });
                                const json = await res.json();
                                setMsg({ ok: json.ok, text: json.message });
                                if (json.ok) {
                                  toast.success(json.message);
                                  await load();
                                } else {
                                  toast.error(json.message ?? "Gagal menghapus.");
                                }
                              }}
                              aria-label="Hapus absensi"
                              className="rounded px-1 text-xs text-zinc-500 transition hover:text-red-400"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}

                      {/* Attempt tanpa absensi */}
                      {p.attempts
                        .filter((at) => !p.attendances.some((a) => a.user?.id === at.user.id))
                        .map((at) => (
                          <div
                            key={at.id}
                            className="flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-500/5 px-2 py-1 text-xs text-red-300"
                            title={
                              at.submittedAt
                                ? `Ujian (tanpa absen) - Selesai ${new Date(at.submittedAt).toLocaleString("id-ID")}`
                                : "Ujian (tanpa absen) - Sedang mengerjakan"
                            }
                          >
                            <span>{at.user.displayName}</span>
                            {at.submittedAt ? <span>✓</span> : <span className="animate-pulse">●</span>}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!window.confirm(`Hapus ujian "${at.user.displayName}" dari periode ini?`))
                                  return;
                                const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(at.user.id)}&periodId=${encodeURIComponent(p.id)}`, {
                                  method: "DELETE",
                                  headers,
                                });
                                const json = await res.json();
                                setMsg({ ok: json.ok, text: json.message });
                                if (json.ok) {
                                  toast.success(json.message);
                                  await load();
                                } else {
                                  toast.error(json.message ?? "Gagal menghapus.");
                                }
                              }}
                              aria-label="Hapus ujian"
                              className="rounded px-1 text-xs text-zinc-500 transition hover:text-red-400"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
        </>
      )}

      {tab === "bank" && (
        <>
      {/* Bank soal */}
      <Card strong className="p-6">
        <h2 className="font-display text-lg font-bold gold-text">🗂 Bank Soal ({questions.length})</h2>

        <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex overflow-hidden rounded-lg border border-white/15">
              {(["MCQ", "ESSAY"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setQType(t)}
                  className={`px-4 py-2 text-sm font-semibold transition ${
                    qType === t ? "bg-crimson-800 text-gold" : "bg-white/5 text-zinc-400"
                  }`}
                >
                  {t === "MCQ" ? "Pilihan Ganda" : "Essay"}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={qPoints}
              onChange={(e) => setQPoints(Number(e.target.value))}
              min={1}
              max={10}
              className="w-24 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none"
            />
          </div>
          <textarea
            value={qPrompt}
            onChange={(e) => setQPrompt(e.target.value)}
            rows={2}
            placeholder="Pertanyaan..."
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-gold/60"
          />
          {qType === "MCQ" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {qOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      checked={qCorrect === i}
                      onChange={() => setQCorrect(i)}
                      className="accent-gold"
                    />
                    <span className="font-mono text-xs text-gold">{String.fromCharCode(65 + i)}.</span>
                    <input
                      value={opt}
                      onChange={(e) =>
                        setQOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))
                      }
                      placeholder={`Opsi ${String.fromCharCode(65 + i)}`}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">Pilih radio = jawaban benar.</p>
            </>
          ) : (
            <input
              value={qKeywords}
              onChange={(e) => setQKeywords(e.target.value)}
              placeholder="Kata kunci auto-grading, pisahkan koma: reserse,kriminal,penyidikan"
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-gold/60"
            />
          )}
          <div>
            <Button variant="gold" onClick={addQuestion} disabled={busy}>
              {busy ? "Menyimpan..." : "Tambah Soal"}
            </Button>
          </div>
        </div>

        <div className="mt-5 max-h-96 space-y-2 overflow-y-auto pr-1">
          {questions.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2">
              <p className="text-xs text-zinc-400">{questions.length} soal total</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!confirm(`Hapus semua soal ${qType === "MCQ" ? "Pilihan Ganda" : "Essay"}?`)) return;
                    setBusy(true);
                    await fetch("/api/admin/questions", {
                      method: "DELETE",
                      headers,
                      body: JSON.stringify({ deleteAll: true, type: qType }),
                    });
                    await load();
                    setBusy(false);
                  }}
                  className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                >
                  Hapus Semua {qType === "MCQ" ? "PG" : "Essay"}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Hapus SEMUA soal (PG + Essay)?")) return;
                    setBusy(true);
                    await fetch("/api/admin/questions", {
                      method: "DELETE",
                      headers,
                      body: JSON.stringify({ deleteAll: true }),
                    });
                    await load();
                    setBusy(false);
                  }}
                  className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                >
                  Hapus Semua
                </button>
              </div>
            </div>
          )}
          {questions.map((q) => (
            <div key={q.id} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-zinc-200">{q.prompt}</p>
                <div className="flex items-center gap-2">
                  <Badge tone={q.type === "MCQ" ? "gold" : "neutral"}>
                    {q.type === "MCQ" ? `PG · ${q.points}pt` : `Essay · ${q.points}pt`}
                  </Badge>
                  <button
                    onClick={async () => {
                      if (!confirm("Hapus soal ini?")) return;
                      setBusy(true);
                      await fetch("/api/admin/questions", {
                        method: "DELETE",
                        headers,
                        body: JSON.stringify({ id: q.id }),
                      });
                      await load();
                      setBusy(false);
                    }}
                    className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
        </>
      )}

      {tab === "rekap" && <CandidatesTab headers={headers} />}
      {tab === "casis" && <CasisManagement headers={headers} onDeleted={() => load()} />}
      {tab === "data" && <BlacklistTab headers={headers} />}
      {tab === "discord" && <DiscordMessagesTab headers={headers} />}
    </div>
  );
}

// Settings Form Component
function SettingsForm({ headers }: { headers: Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);
  const toast = useToastContext();

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/admin/settings", { headers });
      const json = await res.json();
      if (res.ok) {
        setSettings(json.settings ?? {});
        setLoaded(true);
      }
    } catch {}
  }

  function handleChange(key: string, value: string | number | string[]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSettings() {
    setBusy(true);
    try {
      // Buang nilai placeholder tersembunyi (mis. "••••••••") agar tidak
      // ditimpa saat admin mengedit field lain. Nilai yang sudah diset
      // dan tidak disentuh admin akan dikirim kosong -> server mengabaikan.
      const payload = Object.fromEntries(
        Object.entries(settings).filter(
          ([key, value]) =>
            !["discordBotToken", "discordBotSecret", "discordWebhookUrl"].includes(key) ||
            (typeof value === "string" && value.length > 0 && value !== "••••••••")
        )
      );
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setMsg(json);
      if (json.ok) {
        toast.success(json.message);
      } else {
        toast.error(json.message ?? "Gagal menyimpan.");
      }
    } catch {
      setMsg({ ok: false, text: "Terjadi kesalahan jaringan." });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-white/5 rounded animate-pulse" />
          <div className="h-6 w-64 bg-white/5 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {msg && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {/* General Settings */}
        <Card className="p-4">
          <h3 className="font-semibold text-zinc-100 mb-4">Umum</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                KKM / Nilai Lulus (1-1000)
              </label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={((settings.kkm as number) ?? 70)}
                  onChange={(e) => handleChange("kkm", Number(e.target.value))}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Durasi Ujian (menit, 5-300)
              </label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={(settings.examDurationMinutes as number) ?? 45}
                  onChange={(e) => handleChange("examDurationMinutes", Number(e.target.value))}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Minimal Pangkat Polisi (rank number)
              </label>
              <input
                type="number"
                min={1}
                max={255}
                value={(settings.minPoliceRank as number) ?? 225}
                onChange={(e) => handleChange("minPoliceRank", Number(e.target.value))}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
            </div>
          </div>
        </Card>

        {/* Group IDs */}
        <Card className="p-4">
          <h3 className="font-semibold text-zinc-100 mb-4">Grup & Role ID</h3>
          <div className="space-y-4">
            <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Required Group ID ([RI] Republic Indonesia)
                </label>
                <input
                  type="text"
                  value={(settings.requiredGroupId as number) ?? 0}
                  onChange={(e) => handleChange("requiredGroupId", e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Police Group ID (Kepolisian)
              </label>
                <input
                  type="text"
                  value={(settings.policeGroupId as string) ?? ""}
                  onChange={(e) => handleChange("policeGroupId", e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
                />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Banned Group IDs (pisahkan koma)
              </label>
              <input
                type="text"
                value={Array.isArray(settings.bannedGroupIds) ? settings.bannedGroupIds.join(",") : settings.bannedGroupIds ?? ""}
                onChange={(e) => handleChange("bannedGroupIds", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
              <p className="mt-1 text-[11px] text-zinc-500">Contoh: 367050757,34766643</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Role ID: Tahap Akademik
              </label>
              <input
                type="text"
                value={settings.tahapAkademikRoleId ?? ""}
                onChange={(e) => handleChange("tahapAkademikRoleId", e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Role ID: Tahap Interview
              </label>
              <input
                type="text"
                value={settings.tahapInterviewRoleId ?? ""}
                onChange={(e) => handleChange("tahapInterviewRoleId", e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
            </div>
          </div>
        </Card>

        {/* Discord Bot */}
        <Card className="p-4 sm:col-span-2">
          <h3 className="font-semibold text-zinc-100 mb-4">Discord Bot & Webhook</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Discord Bot Token
              </label>
              <input
                type="password"
                value={settings.discordBotToken === "••••••••" ? "" : settings.discordBotToken ?? ""}
                onChange={(e) => handleChange("discordBotToken", e.target.value)}
                placeholder="Biarkan kosong untuk tidak mengubah"
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
              <p className="mt-1 text-[11px] text-zinc-500">Bot token untuk REST API (assign role, DM).</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Discord Bot Secret
              </label>
              <input
                type="password"
                value={settings.discordBotSecret === "••••••••" ? "" : settings.discordBotSecret ?? ""}
                onChange={(e) => handleChange("discordBotSecret", e.target.value)}
                placeholder="Biarkan kosong untuk tidak mengubah"
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
              <p className="mt-1 text-[11px] text-zinc-500">Secret untuk verifikasi request dari web ke bot.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Discord Guild ID
              </label>
              <input
                type="text"
                value={settings.discordGuildId ?? ""}
                onChange={(e) => handleChange("discordGuildId", e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Discord Channel ID (laporan ujian)
              </label>
              <input
                type="text"
                value={settings.discordChannelId ?? ""}
                onChange={(e) => handleChange("discordChannelId", e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Discord Bot API URL
              </label>
              <input
                type="url"
                value={settings.discordBotApiUrl ?? "http://localhost:3001"}
                onChange={(e) => handleChange("discordBotApiUrl", e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
              <p className="mt-1 text-[11px] text-zinc-500">URL server bot Discord (contoh: http://localhost:3001 atau URL production).</p>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Discord Webhook URL (laporan ujian)
              </label>
              <input
                type="url"
                value={settings.discordWebhookUrl === "••••••••" ? "" : settings.discordWebhookUrl ?? ""}
                onChange={(e) => handleChange("discordWebhookUrl", e.target.value)}
                placeholder="Biarkan kosong untuk tidak mengubah"
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
              <p className="mt-1 text-[11px] text-zinc-500">Webhook untuk kirim laporan ujian ke channel Discord.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
        <Button variant="gold" onClick={saveSettings} disabled={busy}>
          {busy ? "Menyimpan..." : "Simpan Pengaturan"}
        </Button>
        <Button variant="ghost" onClick={fetchSettings} disabled={busy}>
          Batal / Muat Ulang
        </Button>
      </div>

      <div className="text-xs text-zinc-500">
        <p>Catatan: Perubahan pada Discord Bot Token/Secret/Webhook dan Group ID memerlukan restart server agar berlaku penuh.</p>
        <p>Nilai yang ditampilkan sebagai "••••••••" adalah nilai yang tersembunyi (sudah diset). Biarkan kosong jika tidak ingin mengubah.</p>
      </div>
    </div>
  );
}
