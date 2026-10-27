"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { useToastContext } from "@/components/ui/Toast";

const CandidatesTab = dynamic(() => import("@/components/admin/CandidatesTab").then((mod) => mod.CandidatesTab), { ssr: false });
const BlacklistTab = dynamic(() => import("@/components/admin/BlacklistTab").then((mod) => mod.BlacklistTab), { ssr: false });
const CasisManagement = dynamic(() => import("@/components/admin/CasisManagement").then((mod) => mod.CasisManagement), { ssr: false });
const DiscordMessagesTab = dynamic(() => import("@/components/admin/DiscordMessagesTab").then((mod) => mod.DiscordMessagesTab), { ssr: false });
// TASK 03L.2E.4.1D — tab kelola pendaftaran (approval/rejection).
const ApplicationsTab = dynamic(() => import("@/components/admin/ApplicationsTab").then((mod) => mod.ApplicationsTab), { ssr: false });
const ContentSettingsTab = dynamic(() => import("@/components/admin/ContentSettingsTab").then((mod) => mod.ContentSettingsTab), { ssr: false });

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

interface DiagnosticsData {
  healthy: boolean;
  warnings: string[];
  checks: Record<string, { ok: boolean; detail: string }>;
}

interface DiscordRetryQueueData {
  pending: number;
  total: number;
  exhausted: number;
  items: Array<{
    id: string;
    resultId: string;
    attempts: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

interface VerifiedAdmin {
  discordUserId: string;
  discordUsername: string;
  staffRoleId?: string;
  staffRoleName?: string;
}

function formatDiagnosticName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\w/g, (char) => char.toUpperCase());
}

interface PeriodItem {
  id: string;
  name: string;
  description: string | null;
  recruitmentPeriodId?: string | null;
  recruitmentPeriod?: { id: string; code: string; name: string; deletedAt?: string | Date | null } | null;
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
  const [staffDiscordUsername, setStaffDiscordUsername] = useState(
    () => (typeof window !== "undefined" ? (sessionStorage.getItem("admin_staff_discord_username") ?? "") : "")
  );
  const [verifiedAdmin, setVerifiedAdmin] = useState<VerifiedAdmin | null>(null);
  const [authStep, setAuthStep] = useState<"key" | "staff">("key");
  const [authBusy, setAuthBusy] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"periode" | "bank" | "rekap" | "casis" | "data" | "log" | "discord" | "settings" | "pendaftaran" | "content">("periode");
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [retryQueue, setRetryQueue] = useState<DiscordRetryQueueData | null>(null);
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

  const downloadCsvExport = useCallback(
    async (kind: "attendance" | "results" | "blacklist" | "verdicts") => {
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/export/${kind}`, { headers });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setMsg(json);
          return;
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `bareskrim-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        setMsg({ ok: true, text: `Export CSV ${kind} berhasil diunduh!` });
      } catch {
        setMsg({ ok: false, text: `Gagal mengunduh export CSV ${kind}.` });
      } finally {
        setBusy(false);
      }
    },
    [headers]
  );

  // form periode
  const [periodName, setPeriodName] = useState("");
  const [periodMcq, setPeriodMcq] = useState("");
  const [periodEssay, setPeriodEssay] = useState("");
  const [recruitmentPeriods, setRecruitmentPeriods] = useState<Array<{ id: string; code: string; name: string; isActive: boolean }>>([]);
  const [selectedRecruitmentPeriodId, setSelectedRecruitmentPeriodId] = useState<string>("");
  const [createAsDraft, setCreateAsDraft] = useState<boolean>(false);
   // form edit periode (tanggal + konfigurasi)
   const [editingDates, setEditingDates] = useState<{
     id: string;
     openedAt: string;
     closedAt: string;
     mcqCount: string;
     essayCount: string;
     examStartTime: string;
     examEndTime: string;
     recruitmentPeriodId: string;
   } | null>(null);
  // form soal
  const [qType, setQType] = useState<"MCQ" | "ESSAY">("MCQ");
  const [qPrompt, setQPrompt] = useState("");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrect, setQCorrect] = useState(0);
  const [qKeywords, setQKeywords] = useState("");
  const [qPoints, setQPoints] = useState(4);

  // Auto-login saat mount jika sudah ada kunci tersimpan di session atau redirect Discord OAuth.
  const initialCheckRef = useRef(false);
  const oauthClientIdRef = useRef("");

  useEffect(() => {
    if (initialCheckRef.current) return;
    initialCheckRef.current = true;

    // Tangani redirect Discord OAuth (access_token via URL hash atau code via query param)
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      const search = window.location.search;
      let accessToken = "";
      let code = "";

      if (hash && hash.includes("access_token=")) {
        const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
        accessToken = hashParams.get("access_token") || "";
      } else if (search && search.includes("code=")) {
        const searchParams = new URLSearchParams(search);
        code = searchParams.get("code") || "";
      }

      if (accessToken || code) {
        const savedKey = sessionStorage.getItem("admin_key");
        if (savedKey) {
          setKey(savedKey);
          setAuthBusy(true);
          setMsg({ ok: true, text: "Memverifikasi akun Discord dan role Staf Pusdik... ⏳" });
          fetch("/api/admin/auth/verify-staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              adminKey: savedKey,
              discordAccessToken: accessToken || undefined,
              code: code || undefined,
              redirectUri: window.location.origin + "/admin",
            }),
          })
            .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
            .then(({ ok, data }) => {
              if (ok && data.ok) {
                setVerifiedAdmin(data.verifiedAdmin ?? null);
                setAuthed(true);
                sessionStorage.setItem("admin_key", savedKey);
                if (data.verifiedAdmin?.discordUsername) {
                  sessionStorage.setItem("admin_staff_discord_username", data.verifiedAdmin.discordUsername);
                  setStaffDiscordUsername(data.verifiedAdmin.discordUsername);
                }
                setMsg({ ok: true, text: `Admin terverifikasi sebagai ${data.verifiedAdmin?.discordUsername}.` });
                window.history.replaceState({}, document.title, window.location.pathname);
                load(savedKey);
              } else {
                setAuthStep("staff");
                setMsg({ ok: false, text: data.message || "Verifikasi akun Discord staf gagal." });
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            })
            .catch(() => {
              setAuthStep("staff");
              setMsg({ ok: false, text: "Gagal menghubungi server untuk verifikasi Discord." });
              window.history.replaceState({}, document.title, window.location.pathname);
            })
            .finally(() => {
              setAuthBusy(false);
            });
          return;
        } else {
          setAuthStep("key");
          setMsg({ ok: false, text: "Sesi verifikasi habis. Masukkan kembali Kunci Keamanan Instruktur." });
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
      }
    }

    const savedKey = sessionStorage.getItem("admin_key");
    const savedStaff = sessionStorage.getItem("admin_staff_discord_username");
    if (savedKey) setKey(savedKey);
    if (savedStaff) setStaffDiscordUsername(savedStaff);
    if (!savedKey) return;

    fetch("/api/admin/auth/session", {
      headers: { "Content-Type": "application/json", "x-admin-key": savedKey },
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((sj) => {
        if (!sj || !sj.ok) {
          sessionStorage.removeItem("admin_key");
          sessionStorage.removeItem("admin_staff_discord_username");
          setKey("");
          setAuthStep("key");
          return;
        }
        if (sj.verified) {
          setVerifiedAdmin(sj.verifiedAdmin ?? null);
          setAuthed(true);
          load(savedKey);
        } else {
          setAuthStep("staff");
        }
      })
      .catch(() => setAuthStep("key"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (overrideKey?: string | unknown) => {
    const activeKey =
      typeof overrideKey === "string"
        ? overrideKey
        : key || (typeof window !== "undefined" ? sessionStorage.getItem("admin_key") || "" : "");
    const activeHeaders = { "Content-Type": "application/json", "x-admin-key": activeKey };

    try {
      const [p, q] = await Promise.all([
        fetch("/api/admin/period", { headers: activeHeaders }),
        fetch("/api/admin/questions", { headers: activeHeaders }),
      ]);
      // Hanya batalkan authed bila kunci ditolak server (401/403).
      // Kegagalan lain (network, 5xx) TIDAK membuat user keluar.
      if (p.status === 401 || p.status === 403 || q.status === 401 || q.status === 403) {
        setAuthed(false);
        setMsg({ ok: false, text: "Admin belum lolos verifikasi dua tahap atau sesi sudah habis." });
        return;
      }
      const pj = p.ok ? await p.json().catch(() => null) : null;
      const qj = q.ok ? await q.json().catch(() => null) : null;

      if (pj && Array.isArray(pj.periods)) {
        setPeriods(pj.periods);
        if (Array.isArray(pj.recruitmentPeriods)) {
          setRecruitmentPeriods(pj.recruitmentPeriods);
        }
      } else if (!p.ok) {
        setMsg({ ok: false, text: "Gagal memuat data periode dari database. Silakan muat ulang." });
      }

      if (qj && Array.isArray(qj.questions)) {
        setQuestions(qj.questions);
      }
      setDbReady(true);
      setAuthed(true);
      // Simpan kunci agar tidak perlu memasukkan ulang saat pindah panel/refresh.
      if (activeKey) {
        setKey(activeKey);
        sessionStorage.setItem("admin_key", activeKey);
      }
      // Muat statistik ringan saja; log/diagnostics/discord queue dimuat saat tab terkait dibuka.
      fetch("/api/admin/stats", { headers: activeHeaders })
        .then((r) => (r.ok ? r.json() : null))
        .then((sj) => setStats(sj?.stats ?? null))
        .catch(() => {});
    } catch (e) {
      console.error("[AdminPanel] load error:", e);
      setAuthed(true);
    }
  }, [key]);

  const handlePasscodeSubmit = useCallback(async () => {
    if (!key.trim()) {
      setMsg({ ok: false, text: "Kunci keamanan instruktur wajib diisi." });
      return;
    }
    setAuthBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/auth/verify-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminKey: key.trim(), checkKeyOnly: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg({ ok: false, text: data.message || "Kunci keamanan instruktur salah." });
        return;
      }
      if (data.clientId) {
        oauthClientIdRef.current = data.clientId;
      }
      sessionStorage.setItem("admin_key", key.trim());
      setAuthStep("staff");
      setMsg(null);
    } catch {
      setMsg({ ok: false, text: "Gagal memeriksa kunci keamanan instruktur." });
    } finally {
      setAuthBusy(false);
    }
  }, [key]);

  const handleDiscordOAuth = useCallback(async () => {
    if (!key.trim()) {
      setAuthStep("key");
      setMsg({ ok: false, text: "Masukkan kunci keamanan instruktur terlebih dahulu." });
      return;
    }

    setAuthBusy(true);
    sessionStorage.setItem("admin_key", key.trim());

    let clientId = oauthClientIdRef.current;
    if (!clientId) {
      try {
        const res = await fetch("/api/admin/auth/verify-staff");
        const data = await res.json().catch(() => ({}));
        if (data?.clientId) {
          clientId = data.clientId;
          oauthClientIdRef.current = clientId;
        }
      } catch {
        // ignore
      }
    }

    if (!clientId) {
      setMsg({
        ok: false,
        text: "Discord Client ID belum tersedia di server. Silakan gunakan verifikasi manual di bawah.",
      });
      setAuthBusy(false);
      return;
    }

    const redirectUri = window.location.origin + "/admin";
    const scope = encodeURIComponent("identify");
    const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
      clientId
    )}&response_type=token&scope=${scope}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&prompt=consent`;

    window.location.href = oauthUrl;
  }, [key]);

  const logoutAdmin = useCallback(async () => {
    await fetch("/api/admin/auth/session", { method: "DELETE", credentials: "include" }).catch(() => null);
    sessionStorage.removeItem("admin_key");
    sessionStorage.removeItem("admin_staff_discord_username");
    setKey("");
    setStaffDiscordUsername("");
    setVerifiedAdmin(null);
    setAuthed(false);
    setAuthStep("key");
    setMsg(null);
  }, []);

  useEffect(() => {
    if (!authed) return;
    if (tab === "log") {
      if (logs.length === 0) {
        fetch("/api/admin/logs?limit=30", { headers })
          .then((r) => (r.ok ? r.json() : null))
          .then((lj) => setLogs(lj?.logs ?? []))
          .catch(() => {});
      }
      if (!retryQueue) {
        fetch("/api/admin/discord-retry", { headers })
          .then((r) => (r.ok ? r.json() : null))
          .then((rq) => setRetryQueue(rq ? { pending: rq.pending ?? 0, total: rq.total ?? 0, exhausted: rq.exhausted ?? 0, items: rq.items ?? [] } : null))
          .catch(() => {});
      }
    }
    if (tab === "settings" && !diagnostics) {
      fetch("/api/admin/diagnostics", { headers })
        .then((r) => (r.ok ? r.json() : null))
        .then((dj) => setDiagnostics(dj ? { healthy: !!dj.healthy, warnings: dj.warnings ?? [], checks: dj.checks ?? {} } : null))
        .catch(() => {});
    }
  }, [authed, tab, headers, logs.length, retryQueue, diagnostics]);

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
    const isAuto = selectedRecruitmentPeriodId === "auto";
    const isDraft = (!isAuto && !selectedRecruitmentPeriodId) || selectedRecruitmentPeriodId === "draft" || createAsDraft;
    const body: Record<string, unknown> = {
      name: periodName.trim(),
      autoCreateRecruitment: isAuto,
      recruitmentPeriodId: isAuto || isDraft ? null : selectedRecruitmentPeriodId,
      draftMode: isDraft,
    };
    if (periodMcq.trim()) body.mcqCount = Number(periodMcq.trim());
    if (periodEssay.trim()) body.essayCount = Number(periodEssay.trim());
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
    setSelectedRecruitmentPeriodId("");
    setCreateAsDraft(false);
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
     if (editingDates.recruitmentPeriodId !== undefined) {
       body.recruitmentPeriodId = editingDates.recruitmentPeriodId === "" ? null : editingDates.recruitmentPeriodId;
     }
     if (editingDates.openedAt) body.openedAt = new Date(editingDates.openedAt).toISOString();
     else body.openedAt = null;
     if (editingDates.closedAt) body.closedAt = new Date(editingDates.closedAt).toISOString();
     else body.closedAt = null;
     if (editingDates.mcqCount.trim()) body.mcqCount = Number(editingDates.mcqCount.trim());
     if (editingDates.essayCount.trim()) body.essayCount = Number(editingDates.essayCount.trim());
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
      <div className="admin-root min-h-screen bg-[#0b0b0b] text-[#eeeae2] flex flex-col justify-between">
        <header className="system-header">
          <div className="system-brand">
            <img src="/design-assets/logo-pusdik.png" alt="Logo Pusdik Reserse" />
            <div>
              <strong>BARESKRIM POLRI RBX</strong>
              <span>PUSDIK RESERSE</span>
            </div>
          </div>
          <div className="system-header-right">
            <span className="system-label">ADMIN PANEL</span>
            <button
              className="theme-button"
              id="themeToggle"
              type="button"
              aria-label="Toggle theme"
              onClick={() => {
                if (typeof document !== "undefined") {
                  document.body.classList.toggle("light-mode");
                }
              }}
            >
              ◐
            </button>
          </div>
        </header>

        <main className="system-main py-8 px-4 flex items-center justify-center flex-1">
          <section className="login-view w-full max-w-md mx-auto" id="loginView">
            <div className="login-card">
              <div className="system-heading">
                <div>
                  <span className="section-kicker">PORTAL ADMINISTRATOR</span>
                  <h1 className="font-serif">Masuk Admin</h1>
                </div>
                <span className="step-indicator">
                  {authStep === "key" ? "Tahap 1/2: Passcode" : "Tahap 2/2: Discord Staf"}
                </span>
              </div>

              {authStep === "key" ? (
                <form
                  className="login-stage active"
                  id="stageOne"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handlePasscodeSubmit();
                  }}
                >
                  <div style={{ marginBottom: "16px" }}>
                    <label htmlFor="adminKey">KUNCI KEAMANAN INSTRUKTUR (PASSCODE)</label>
                    <div className="password-input">
                      <input
                        type={showKey ? "text" : "password"}
                        id="adminKey"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder="Masukkan sandi rahasia instruktur"
                        autoComplete="current-password"
                        disabled={authBusy}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowKey((v) => !v)}
                        aria-label={showKey ? "Sembunyikan kunci" : "Tampilkan kunci"}
                      >
                        {showKey ? "🙈" : "👁️"}
                      </button>
                    </div>
                    <p className="input-help">Sandi rahasia internal instruktur Pusdik Reserse.</p>
                  </div>

                  {msg && (
                    <p className={`login-error ${msg.ok ? "!text-[#68b478]" : "!text-[#d87575]"}`}>
                      {msg.text}
                    </p>
                  )}

                  <button
                    className="primary-button"
                    id="continueLogin"
                    type="submit"
                    disabled={authBusy || !key.trim()}
                    style={{ width: "100%", marginTop: "12px" }}
                  >
                    {authBusy ? "Memeriksa Kunci..." : "Lanjut ke Verifikasi Discord"} <span>→</span>
                  </button>
                </form>
              ) : (
                <div className="login-stage active" id="stageTwo">
                  <div
                    style={{
                      marginBottom: "20px",
                      padding: "14px",
                      borderRadius: "6px",
                      background: "rgba(88, 101, 242, 0.12)",
                      border: "1px solid rgba(88, 101, 242, 0.35)",
                      fontSize: "13px",
                      lineHeight: "1.6",
                      color: "#c9cdfb",
                    }}
                  >
                    Kunci instruktur terverifikasi. Silakan hubungkan akun Discord resmi staf Anda (model Bloxlink) untuk memvalidasi role Personel Staff Pusdik.
                  </div>

                  {msg && (
                    <p
                      className={`login-error ${msg.ok ? "!text-[#68b478]" : "!text-[#d87575]"}`}
                      style={{ marginBottom: "16px" }}
                    >
                      {msg.text}
                    </p>
                  )}

                  <button
                    type="button"
                    className="primary-button"
                    id="discordOAuthLogin"
                    onClick={handleDiscordOAuth}
                    disabled={authBusy}
                    style={{
                      width: "100%",
                      background: "#5865F2",
                      borderColor: "#5865F2",
                      color: "#ffffff",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 18px",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                      style={{ flexShrink: 0 }}
                    >
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                    <span>{authBusy ? "Membuka Discord..." : "Verifikasi via Discord"}</span>
                  </button>

                  <button
                    type="button"
                    className="back-button"
                    onClick={() => {
                      setAuthStep("key");
                      setMsg(null);
                    }}
                    disabled={authBusy}
                    style={{ marginTop: "14px" }}
                  >
                    ← Kembali ke Kunci Keamanan
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>

        <footer className="system-footer">
          <div className="footer-brand">
            <img src="/design-assets/logo-pusdik.png" alt="Logo Pusdik Reserse" />
            <div>
              <strong>BARESKRIM POLRI RBX</strong>
              <span>PUSDIK RESERSE</span>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Bareskrim Polri RBX. Hak Cipta Dilindungi.</span>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="admin-root min-h-screen bg-[#0b0b0b] text-[#eeeae2] flex flex-col justify-between">
      <header className="system-header">
        <div className="system-brand">
          <img src="/design-assets/logo-pusdik.png" alt="Logo Pusdik Reserse" />
          <div>
            <strong>BARESKRIM POLRI RBX</strong>
            <span>PUSDIK RESERSE</span>
          </div>
        </div>
        <div className="system-header-right">
          <span className="system-label">ADMIN PANEL</span>
          <button
            className="theme-button"
            id="themeToggle"
            type="button"
            aria-label="Toggle theme"
            onClick={() => {
              if (typeof document !== "undefined") {
                document.body.classList.toggle("light-mode");
              }
            }}
          >
            ◐
          </button>
        </div>
      </header>

      <main className="system-main p-6 max-w-7xl mx-auto w-full flex-1">
        <section className="dashboard" id="dashboardView">
          <div className="dashboard-top">
            <div>
              <span className="section-kicker">ADMINISTRATION / PUSDIK RESERSE</span>
              <h1 className="font-serif">Admin Panel</h1>
              <p>Kelola penerimaan, calon siswa, seleksi, dan data administrasi Pusdik Reserse.</p>
            </div>

            <div className="account-box">
              <div className="online-dot"></div>
              <div>
                <strong id="verifiedStaff">{verifiedAdmin?.discordUsername || "Staff Pusdik"}</strong>
                <span id="sessionInfo">{verifiedAdmin?.staffRoleName || "Session Aktif"}</span>
              </div>
              <button id="logoutButton" type="button" onClick={logoutAdmin}>
                Keluar
              </button>
            </div>
          </div>

          {Boolean(msg?.text) && (
            <div
              className={`my-4 rounded-[3px] border px-4 py-3 text-sm ${
                msg!.ok
                  ? "border-[#68b478]/40 bg-[var(--surface-2)] text-[#68b478]"
                  : "border-[#d87575]/40 bg-[#1e1313] text-[#d87575]"
              }`}
            >
              {msg!.text}
            </div>
          )}

          {/* Status Database */}
          {dbReady === false && (
            <div className="p-4 mb-6 border border-[#d87575]/40 bg-[#1e1313] rounded-[3px]">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-serif text-lg font-normal text-[#d87575]">Database Belum Siap</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Tabel belum ditemukan. Klik tombol di samping untuk membuat semua tabel secara
                    otomatis. Pastikan DATABASE_URL sudah diatur di environment variables.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={initDb}
                  disabled={busy}
                  className="primary-button !min-h-[40px] px-5 text-xs shrink-0"
                >
                  {busy ? "Membuat tabel..." : "Initialize Database"}
                </button>
              </div>
            </div>
          )}

          {/* Navigasi Tab Prototype */}
          <nav className="admin-nav mb-8">
            {(
              [
                ["periode", "Ikhtisar & Periode"],
                ["pendaftaran", "Calon Siswa"],
                ["casis", "Seleksi & Casis"],
                ["data", "Putusan & Blacklist"],
                ["bank", "Bank Soal"],
                ["rekap", "Rekap Nilai"],
                ["discord", "Discord"],
                ["content", "Konten Web"],
                ["settings", "Pengaturan"],
                ["log", "Audit Log"],
              ] as [typeof tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`admin-tab ${tab === t ? "active" : ""}`}
              >
                {label}
                {t === "bank" && questions.length > 0 ? (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-white/10">
                    {questions.length}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          {/* Ringkasan Statistik Grid */}
          {stats && tab === "periode" && (
            <div className="stats-grid mb-8">
              <article className="stat-card">
                <span>Total Casis</span>
                <strong id="totalApplicants">{stats.totalUsers}</strong>
                <small>terdaftar di sistem</small>
              </article>
              <article className="stat-card">
                <span>Kehadiran Absensi</span>
                <strong id="pendingApplicants">{stats.totalAttendance}</strong>
                <small>peserta hadir</small>
              </article>
              <article className="stat-card">
                <span>Ujian Selesai</span>
                <strong id="verifiedApplicants">{stats.totalResults}</strong>
                <small>hasil ujian masuk</small>
              </article>
              <article className="stat-card">
                <span>Kelulusan ({stats.passRate}%)</span>
                <strong id="rejectedApplicants" className="text-[#68b478]">{stats.passedResults} Lulus</strong>
                <small>{stats.failedResults} tidak lulus</small>
              </article>
            </div>
          )}

      {tab === "log" && (
        <section className="admin-panel active" data-panel="audit">
          <div className="panel-heading mb-6">
            <div>
              <span className="section-kicker">SYSTEM</span>
              <h2 className="font-serif text-2xl font-normal">Audit Log</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Retry semua laporan Discord yang gagal?\n\nSistem akan mencoba ulang maksimal 3x per laporan yang masih pending."))
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
                className="outline-button !min-h-[36px] !py-1 text-xs"
              >
                Retry Discord
              </button>
              <button
                type="button"
                onClick={() =>
                  fetch("/api/admin/logs?limit=30", { headers })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((lj) => setLogs(lj?.logs ?? []))
                    .catch(() => {})
                }
                className="outline-button !min-h-[36px] !py-1 text-xs"
              >
                Muat Ulang
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Hapus seluruh log audit?\n\nSemua jejak aktivitas admin akan hilang dari panel ini. Tindakan ini tidak dapat dibatalkan."))
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
                className="outline-button reject-button !min-h-[36px] !py-1 text-xs"
              >
                Hapus Semua Log
              </button>
            </div>
          </div>

          <article className="panel-card mb-6">
            <div className="card-heading">
              <div>
                <span className="section-kicker">QUEUE</span>
                <h3 className="font-serif text-lg font-normal">Retry Queue Discord</h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  fetch("/api/admin/discord-retry", { headers })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((rq) => setRetryQueue(rq ? { pending: rq.pending ?? 0, total: rq.total ?? 0, exhausted: rq.exhausted ?? 0, items: rq.items ?? [] } : null))
                    .catch(() => setMsg({ ok: false, text: "Gagal memuat retry queue Discord." }))
                }
                className="outline-button !min-h-[36px] !py-1 text-xs"
              >
                Muat Ulang Queue
              </button>
            </div>

            {retryQueue ? (
              <div className="space-y-4 mt-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="panel-card !min-h-0 !p-3">
                    <span className="section-kicker">PENDING AKTIF</span>
                    <p className="mt-1 font-serif text-2xl font-normal text-[var(--text)]">{retryQueue.pending}</p>
                  </div>
                  <div className="panel-card !min-h-0 !p-3">
                    <span className="section-kicker">MENTOK 3X</span>
                    <p className="mt-1 font-serif text-2xl font-normal text-[#d87575]">{retryQueue.exhausted}</p>
                  </div>
                  <div className="panel-card !min-h-0 !p-3">
                    <span className="section-kicker">TOTAL QUEUE</span>
                    <p className="mt-1 font-serif text-2xl font-normal text-[var(--text)]">{retryQueue.total}</p>
                  </div>
                </div>

                {retryQueue.items.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">Tidak ada retry queue aktif. Kalau laporan gagal, entri akan tercatat di sini.</p>
                ) : (
                  <div className="space-y-2">
                    {retryQueue.items.slice(0, 5).map((item) => (
                      <div key={item.id} className="p-3 border border-[var(--border)] rounded-[3px] bg-[var(--surface-2)] text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[var(--text)]">{item.resultId}</span>
                          <span className="status-badge pending">attempt {item.attempts}</span>
                          <span className="text-[var(--muted)] ml-auto">{new Date(item.updatedAt).toLocaleString("id-ID")}</span>
                        </div>
                        {item.lastError && <p className="mt-1 text-[var(--muted)]">Error terakhir: {item.lastError}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)] mt-4">Retry queue belum dimuat.</p>
            )}
          </article>

          <article className="panel-card">
            <div className="card-heading mb-4">
              <div>
                <span className="section-kicker">RIWAYAT</span>
                <h3 className="font-serif text-lg font-normal">Aktivitas Terbaru</h3>
              </div>
              <span className="panel-count">{logs.length} catatan</span>
            </div>

            {logs.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Belum ada aktivitas admin tercatat. Coba lakukan export, ubah pengaturan, atau lookup blacklist agar jejak audit mulai terisi.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="p-3 border border-[var(--border)] rounded-[3px] bg-[var(--surface-2)] text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="status-badge">
                        {log.action}
                      </span>
                      {log.target && <span className="text-[var(--text)]">{log.target}</span>}
                      <span className="ml-auto font-mono text-[var(--muted)]">
                        {new Date(log.createdAt).toLocaleString("id-ID")}
                      </span>
                    </div>
                    {log.detail && Object.keys(log.detail).length > 0 && (
                      <pre className="mt-2 p-2 border border-[var(--border)] rounded-[3px] bg-[var(--surface)] whitespace-pre-wrap font-mono text-[11px] text-[var(--muted)]">
                        {JSON.stringify(log.detail, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      )}

      {tab === "settings" && (
        <section className="admin-panel active" data-panel="settings">
          <div className="panel-heading mb-6">
            <div>
              <span className="section-kicker">KONFIGURASI</span>
              <h2 className="font-serif text-2xl font-normal">Pengaturan Sistem</h2>
            </div>
            <p className="text-xs text-[var(--muted)] max-w-xl">
              Perubahan pada pengaturan di bawah ini akan mempengaruhi seluruh sistem. Beberapa pengaturan memerlukan restart server.
            </p>
          </div>

          <article className="panel-card mb-6">
            <div className="card-heading">
              <div>
                <span className="section-kicker">SYSTEM HEALTH</span>
                <h3 className="font-serif text-lg font-normal">Diagnostic Panel</h3>
              </div>
              <button
                type="button"
                className="outline-button !min-h-[36px] !py-1 text-xs"
                onClick={() =>
                  fetch("/api/admin/diagnostics", { headers })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((dj) => setDiagnostics(dj ? { healthy: !!dj.healthy, warnings: dj.warnings ?? [], checks: dj.checks ?? {} } : null))
                    .catch(() => setMsg({ ok: false, text: "Gagal memuat diagnostics." }))
                }
              >
                Refresh Diagnostics
              </button>
            </div>

            {diagnostics ? (
              <div className="space-y-4 mt-4">
                <div className={`p-3 rounded-[3px] border text-xs ${diagnostics.healthy ? "border-[var(--green)]/30 bg-[var(--surface-2)] text-[var(--green)]" : "border-[var(--gold)]/30 bg-[var(--surface-2)] text-[var(--gold)]"}`}>
                  {diagnostics.healthy ? "Semua check utama sehat." : "Ada check yang perlu perhatian sebelum deploy berikutnya."}
                </div>
                <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
                  <div className="panel-card !min-h-0 !p-3">
                    <span className="section-kicker">TOTAL CHECK</span>
                    <p className="mt-1 font-serif text-2xl font-normal text-[var(--text)]">{Object.keys(diagnostics.checks).length}</p>
                  </div>
                  <div className="panel-card !min-h-0 !p-3">
                    <span className="section-kicker">CHECK SEHAT</span>
                    <p className="mt-1 font-serif text-2xl font-normal text-[var(--green)]">{Object.values(diagnostics.checks).filter((check) => check.ok).length}</p>
                  </div>
                  <div className="panel-card !min-h-0 !p-3">
                    <span className="section-kicker">PERLU PERHATIAN</span>
                    <p className="mt-1 font-serif text-2xl font-normal text-[var(--gold)]">{Object.values(diagnostics.checks).filter((check) => !check.ok).length}</p>
                  </div>
                  <div className="panel-card !min-h-0 !p-3">
                    <span className="section-kicker">WARNING</span>
                    <p className="mt-1 font-serif text-2xl font-normal text-[var(--text)]">{diagnostics.warnings.length}</p>
                  </div>
                </div>
                {diagnostics.warnings.length > 0 && (
                  <div className="notice-box text-xs">
                    {diagnostics.warnings.map((warning) => (
                      <div key={warning}>• {warning}</div>
                    ))}
                  </div>
                )}
                <div className="grid gap-3 xl:grid-cols-2">
                  {Object.entries(diagnostics.checks).map(([name, check]) => (
                    <div key={name} className="p-3 border border-[var(--border)] rounded-[3px] bg-[var(--surface-2)]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--text)]">{formatDiagnosticName(name)}</span>
                        <span className={`status-badge ${check.ok ? "active" : "pending"}`}>{check.ok ? "OK" : "WARN"}</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--muted)]">{check.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)] mt-4">Diagnostics belum dimuat. Tekan "Refresh Diagnostics" untuk cek status.</p>
            )}
          </article>

          <article className="panel-card">
            <SettingsForm headers={headers} />
          </article>
        </section>
      )}

      {tab === "periode" && (
        <section className="admin-panel active" data-panel="overview">
          <div className="panel-heading mb-6">
            <div>
              <span className="section-kicker">MANAJEMEN REKRUTMEN</span>
              <h2 className="font-serif text-2xl font-normal">Kelola Periode Rekrutmen</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="outline-button !min-h-[40px] text-xs"
                onClick={load}
                disabled={busy}
              >
                {busy ? "Memuat..." : "Refresh Data"}
              </button>
            </div>
          </div>

          {/* Ekspor & Cadangan Data */}
          <article className="panel-card mb-6">
            <div className="card-heading">
              <div>
                <span className="section-kicker">OPERASIONAL</span>
                <h3 className="font-serif text-lg font-normal">Ekspor & Cadangan Data</h3>
              </div>
              <button
                type="button"
                className="outline-button !min-h-[38px] text-xs"
                onClick={downloadBackup}
                disabled={busy}
              >
                {busy ? "Memproses..." : "Unduh Backup JSON"}
              </button>
            </div>

            <div className="grid gap-2 grid-cols-2 lg:grid-cols-4 mt-4">
              <button
                type="button"
                className="outline-button !min-h-[42px] text-xs justify-between"
                onClick={() => downloadCsvExport("attendance")}
                disabled={busy}
              >
                <span>Export Attendance CSV</span>
                <span className="text-[var(--muted)]">↓</span>
              </button>
              <button
                type="button"
                className="outline-button !min-h-[42px] text-xs justify-between"
                onClick={() => downloadCsvExport("results")}
                disabled={busy}
              >
                <span>Export Hasil CSV</span>
                <span className="text-[var(--muted)]">↓</span>
              </button>
              <button
                type="button"
                className="outline-button !min-h-[42px] text-xs justify-between"
                onClick={() => downloadCsvExport("blacklist")}
                disabled={busy}
              >
                <span>Export Blacklist CSV</span>
                <span className="text-[var(--muted)]">↓</span>
              </button>
              <button
                type="button"
                className="outline-button !min-h-[42px] text-xs justify-between"
                onClick={() => downloadCsvExport("verdicts")}
                disabled={busy}
              >
                <span>Export Putusan CSV</span>
                <span className="text-[var(--muted)]">↓</span>
              </button>
            </div>

            <div className="notice-box mt-3 text-xs flex flex-col gap-1">
              <p>• Membuka periode baru otomatis menutup periode lama dan mengacak ulang bank soal dengan seed baru.</p>
              <p>• Export CSV dibuat untuk operasional admin harian: attendance, hasil, blacklist, dan putusan.</p>
            </div>
          </article>

          {/* Form Buka Periode Baru */}
          <article className="panel-card mb-6">
            <div className="card-heading">
              <div>
                <span className="section-kicker">KONFIGURASI</span>
                <h3 className="font-serif text-lg font-normal">Buat Periode Baru</h3>
              </div>
              <span className="status-badge">PENERIMAAN</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div className="setting-field !p-3">
                <label htmlFor="recruitmentPeriodSelect" className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                  Periode Pendaftaran (RecruitmentPeriod)
                </label>
                <select
                  id="recruitmentPeriodSelect"
                  value={selectedRecruitmentPeriodId}
                  onChange={(e) => setSelectedRecruitmentPeriodId(e.target.value)}
                  className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                >
                  <option value="" className="bg-[#171717] text-[#918d86]">
                    [Belum Dipetakan / Simpan sbg Draft]
                  </option>
                  <option value="auto" className="bg-[#171717] text-[#e0a842] font-semibold">
                    ⚡ Buat Otomatis Periode Pendaftaran Baru
                  </option>
                  {recruitmentPeriods.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#171717] text-[#eeeae2]">
                      {r.code} — {r.name} {r.isActive ? "(Aktif)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="setting-field !p-3">
                <label htmlFor="mcqCountInput" className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                  Jumlah Soal Pilihan Ganda (kosong = default 15)
                </label>
                <input
                  id="mcqCountInput"
                  type="number"
                  min={1}
                  max={50}
                  value={periodMcq}
                  onChange={(e) => setPeriodMcq(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                  placeholder="15"
                  className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                />
              </div>

              <div className="setting-field !p-3">
                <label htmlFor="essayCountInput" className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                  Jumlah Soal Essay (kosong = default 5)
                </label>
                <input
                  id="essayCountInput"
                  type="number"
                  min={1}
                  max={50}
                  value={periodEssay}
                  onChange={(e) => setPeriodEssay(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                  placeholder="5"
                  className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                value={periodName}
                onChange={(e) => setPeriodName(e.target.value)}
                placeholder="Nama periode, contoh: Rekrutmen Gelombang 2"
                className="flex-1 h-12 px-4 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
              />
              <button
                type="button"
                className="primary-button !mt-0 !w-auto !min-h-[48px] px-6 shrink-0 inline-flex items-center justify-center gap-2"
                onClick={openPeriod}
                disabled={busy || !periodName.trim()}
              >
                Buka Periode Baru
              </button>
            </div>
          </article>

          {/* Riwayat & Daftar Periode */}
          <div className="space-y-4">
            <div className="card-heading !border-0 !p-0">
              <div>
                <span className="section-kicker">DAFTAR PERIODE</span>
                <h3 className="font-serif text-lg font-normal">Riwayat & Status Periode</h3>
              </div>
              <span className="panel-count">{periods.length} periode</span>
            </div>

            {periods.map((p) => {
              const mengerjakan = p.attempts.filter((a) => !a.submittedAt);
              const selesai = p.attempts.filter((a) => a.submittedAt);
              const absenOnly = p.attendances.filter(
                (a) => !p.attempts.some((at) => at.user.id === a.user?.id)
              );
              const countsLabel = `Mengerjakan ${mengerjakan.length} • Selesai ${selesai.length} • Absen saja ${absenOnly.length}`;

              return (
                <article key={p.id} className="panel-card !min-h-0">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[var(--border)]">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-serif text-lg font-normal text-[var(--text)]">{p.name}</h4>
                        {p.recruitmentPeriod ? (
                          <span className="status-badge active !text-xs">
                            Terhubung: {p.recruitmentPeriod.code} ({p.recruitmentPeriod.name})
                          </span>
                        ) : (
                          <span className="status-badge pending !text-xs">
                            Belum Dipetakan (Draft)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted)] mt-1">{countsLabel}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`status-badge ${p.isActive ? "active" : ""}`}>
                        {p.isActive ? "AKTIF" : "DITUTUP"}
                      </span>
                      {p.isActive && (
                        <span className={`status-badge ${p.isExamOpen ? "active" : ""}`}>
                          {p.isExamOpen ? "UJIAN BUKA" : "UJIAN TUTUP"}
                        </span>
                      )}
                      {p.isActive && (
                        <span className={`status-badge ${p.isAttendanceOpen ? "active" : ""}`}>
                          {p.isAttendanceOpen ? "ABSEN BUKA" : "ABSEN TUTUP"}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setEditingDates((cur) =>
                            cur?.id === p.id
                              ? null
                              : {
                                  id: p.id,
                                  recruitmentPeriodId: p.recruitmentPeriodId ?? "",
                                  openedAt: toLocalInputValue(p.openedAt),
                                  closedAt: toLocalInputValue(p.closedAt),
                                  mcqCount: p.mcqCount != null ? String(p.mcqCount) : "",
                                  essayCount: p.essayCount != null ? String(p.essayCount) : "",
                                  examStartTime: p.examStartTime
                                    ? toLocalInputValue(p.examStartTime)
                                    : "",
                                  examEndTime: p.examEndTime
                                    ? toLocalInputValue(p.examEndTime)
                                    : "",
                                }
                          )
                        }
                        className="outline-button !min-h-[36px] !py-1 text-xs"
                      >
                        {editingDates?.id === p.id ? "Batal" : "Edit Periode"}
                      </button>

                      {p.isActive && (
                        <button
                          type="button"
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
                          className={`outline-button !min-h-[36px] !py-1 text-xs ${
                            p.isExamOpen ? "verify-button" : ""
                          }`}
                        >
                          {p.isExamOpen ? "Buka Ujian ✓" : "Buka Ujian"}
                        </button>
                      )}

                      {p.isActive && (
                        <button
                          type="button"
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
                          className={`outline-button !min-h-[36px] !py-1 text-xs ${
                            p.isAttendanceOpen ? "verify-button" : ""
                          }`}
                        >
                          {p.isAttendanceOpen ? "Buka Absen ✓" : "Buka Absen"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(p.isActive ? "Tutup periode ini?\n\nAbsensi dan ujian pada periode ini akan berhenti sampai Anda buka lagi." : "Buka kembali periode ini?\n\nPeriode akan aktif lagi dan bisa dipakai untuk operasional lanjutan."))
                            return;
                          const action = p.isActive ? "close" : "reopen";
                          const res = await fetch("/api/admin/period", {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                              periodId: p.id,
                              action,
                              autoCreateRecruitment: !p.recruitmentPeriodId,
                            }),
                          });
                          const json = await res.json();
                          setMsg({ ok: json.ok, text: json.message });
                          if (json.ok) await load();
                        }}
                        className={`outline-button !min-h-[36px] !py-1 text-xs ${
                          p.isActive ? "reject-button" : "verify-button"
                        }`}
                      >
                        {p.isActive ? "Tutup" : "Buka"}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("Reset ujian periode ini?\n\nPERINGATAN: ExamAttempt (sesi ujian) dan ExamResult (hasil ujian) pada periode ini akan dihapus PERMANEN dan tidak dapat dikembalikan.\n\nData Attendance tetap ada dan casis bisa mengerjakan ulang."))
                            return;
                          const res = await fetch("/api/admin/period", {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ periodId: p.id, action: "reset", confirmReset: true }),
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
                        className="outline-button reject-button !min-h-[36px] !py-1 text-xs"
                      >
                        Reset Ujian
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Hapus periode "${p.name}"?\n\nPastikan backup JSON sudah diunduh. Periode, absensi, attempt, jawaban, dan hasil terkait akan dihapus permanen.`))
                            return;
                          const res = await fetch("/api/admin/period", {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({ periodId: p.id, action: "delete" }),
                          });
                          const json = await res.json();
                          setMsg({ ok: json.ok, text: json.message });
                          if (json.ok) {
                            toast.success(json.message);
                            await load();
                          } else {
                            toast.error(json.message ?? "Gagal menghapus periode.");
                          }
                        }}
                        className="outline-button reject-button !min-h-[36px] !py-1 text-xs"
                      >
                        Hapus Periode
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 my-3 text-xs">
                    <div className="data-row">
                      <span>Seed Acak:</span>
                      <strong>{p.seed}</strong>
                    </div>
                    <div className="data-row">
                      <span>Konfigurasi Soal:</span>
                      <strong>{p.mcqCount ?? "15"} PG · {p.essayCount ?? "5"} Essay</strong>
                    </div>
                    <div className="data-row">
                      <span>Jadwal Absen:</span>
                      <strong>{p.openedAt ? new Date(p.openedAt).toLocaleDateString("id-ID") : "Belum diatur"}</strong>
                    </div>
                    <div className="data-row">
                      <span>Jadwal Ujian:</span>
                      <strong>{p.examStartTime ? new Date(p.examStartTime).toLocaleDateString("id-ID") : "Belum diatur"}</strong>
                    </div>
                  </div>

                  {/* Form edit periode */}
                  {editingDates?.id === p.id && (
                    <div className="mt-4 p-4 border border-[var(--border-strong)] bg-[var(--surface-2)] rounded-[3px]">
                      <div className="card-heading !pb-2 mb-3">
                        <span className="section-kicker">EDIT PERIODE</span>
                        <h5 className="font-serif text-sm">Konfigurasi Jadwal & Soal</h5>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="setting-field !p-3 sm:col-span-2">
                          <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                            Hubungkan ke Periode Pendaftaran
                          </label>
                          <select
                            value={editingDates.recruitmentPeriodId ?? ""}
                            onChange={(e) =>
                              setEditingDates((cur) =>
                                cur ? { ...cur, recruitmentPeriodId: e.target.value } : cur
                              )
                            }
                            className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                          >
                            <option value="">[Putus Relasi / Draft Tanpa Pendaftaran]</option>
                            <option value="auto" className="bg-[#171717] text-[#e0a842] font-semibold">
                              ⚡ [+ Buat Otomatis Sesuai Nama Periode Ujian]
                            </option>
                            {recruitmentPeriods.map((r) => (
                              <option key={r.id} value={r.id} className="bg-[#171717] text-[#eeeae2]">
                                {r.code} — {r.name} {r.isActive ? "(Aktif)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="setting-field !p-3">
                          <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
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
                            className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                          />
                        </div>
                        <div className="setting-field !p-3">
                          <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                            Batas Waktu Penutupan Pendaftaran & Absen (kosongkan = tanpa batas waktu)
                          </label>
                          <input
                            type="datetime-local"
                            value={editingDates.closedAt}
                            onChange={(e) =>
                              setEditingDates((cur) =>
                                cur ? { ...cur, closedAt: e.target.value } : cur
                              )
                            }
                            className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                          />
                        </div>
                        <div className="setting-field !p-3">
                          <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
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
                            className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                          />
                        </div>
                        <div className="setting-field !p-3">
                          <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
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
                            className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                          />
                        </div>
                        <div className="setting-field !p-3">
                          <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
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
                            className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                          />
                        </div>
                        <div className="setting-field !p-3">
                          <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
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
                            className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          type="button"
                          className="primary-button !min-h-[40px] px-5 text-xs"
                          onClick={savePeriodDates}
                          disabled={busy}
                        >
                          {busy ? "Menyimpan..." : "Simpan Perubahan"}
                        </button>
                        <button
                          type="button"
                          className="outline-button !min-h-[40px] px-4 text-xs"
                          onClick={() => setEditingDates(null)}
                          disabled={busy}
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Daftar Peserta */}
                  <div className="mt-3 pt-3 border-t border-[var(--border)]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] block mb-2">
                      Peserta ({p._count.attendances} absen · {p._count.attempts} ujian)
                    </span>

                    {p.attendances.length === 0 && p.attempts.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">Belum ada peserta pada periode ini.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {p.attendances.map((a) => {
                          const attempt = p.attempts.find((at) => at.user.id === a.user?.id);
                          const isDone = attempt?.submittedAt != null;
                          const isWorking = attempt && !attempt.submittedAt;

                          return (
                            <div
                              key={a.id}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border text-xs ${
                                isWorking
                                  ? "border-[var(--gold)] bg-[var(--surface-2)] text-[var(--gold)]"
                                  : isDone
                                    ? "border-[var(--green)] bg-[var(--surface-2)] text-[var(--green)]"
                                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]"
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
                                  if (!window.confirm(`Hapus absensi & ujian "${name}" dari periode ini?\n\nAbsensi, sesi ujian, dan hasil terkait periode ini akan dihapus.`))
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
                                className="ml-1 text-[var(--muted)] hover:text-[#d87575] transition"
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
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border border-[#d87575]/40 bg-[var(--surface-2)] text-xs text-[#d87575]"
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
                                  if (!window.confirm(`Hapus ujian "${at.user.displayName}" dari periode ini?\n\nCasis akan bisa mengikuti ujian lagi pada periode ini.`))
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
                                className="ml-1 text-[var(--muted)] hover:text-[#d87575] transition"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === "bank" && (
        <section className="admin-panel active" data-panel="questions">
          <div className="panel-heading mb-6">
            <div>
              <span className="section-kicker">EXAMINATION</span>
              <h2 className="font-serif text-2xl font-normal">Bank Soal ({questions.length})</h2>
            </div>
            {questions.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Hapus semua soal ${qType === "MCQ" ? "Pilihan Ganda" : "Essay"}?\n\nSemua soal pada kategori ini akan hilang permanen.`)) return;
                    setBusy(true);
                    await fetch("/api/admin/questions", {
                      method: "DELETE",
                      headers,
                      body: JSON.stringify({ deleteAll: true, type: qType }),
                    });
                    await load();
                    setBusy(false);
                  }}
                  className="outline-button reject-button !min-h-[36px] !py-1 text-xs"
                >
                  Hapus Semua {qType === "MCQ" ? "PG" : "Essay"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm("Hapus SEMUA soal (PG + Essay)?\n\nBank soal akan kosong total sampai Anda menambahkannya lagi.")) return;
                    setBusy(true);
                    await fetch("/api/admin/questions", {
                      method: "DELETE",
                      headers,
                      body: JSON.stringify({ deleteAll: true }),
                    });
                    await load();
                    setBusy(false);
                  }}
                  className="outline-button reject-button !min-h-[36px] !py-1 text-xs"
                >
                  Hapus Semua Soal
                </button>
              </div>
            )}
          </div>

          <article className="panel-card mb-6">
            <div className="card-heading mb-4">
              <div>
                <span className="section-kicker">TAMBAH SOAL</span>
                <h3 className="font-serif text-lg font-normal">Form Input Pertanyaan</h3>
              </div>
              <span className="status-badge">BANK</span>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex border border-[var(--border-strong)] rounded-[3px] overflow-hidden">
                  {(["MCQ", "ESSAY"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setQType(t)}
                      className={`px-4 py-2 text-xs font-semibold tracking-wider uppercase transition ${
                        qType === t
                          ? "bg-[var(--accent)] text-[var(--accent-text)]"
                          : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      {t === "MCQ" ? "Pilihan Ganda" : "Essay"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold">Bobot:</span>
                  <input
                    type="number"
                    value={qPoints}
                    onChange={(e) => setQPoints(Number(e.target.value))}
                    min={1}
                    max={10}
                    className="w-20 h-9 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                  />
                  <span className="text-xs text-[var(--muted)]">poin</span>
                </div>
              </div>

              <textarea
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                rows={3}
                placeholder="Tuliskan pertanyaan ujian..."
                className="w-full p-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
              />

              {qType === "MCQ" ? (
                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block">
                    Pilihan Jawaban (Pilih radio untuk jawaban benar)
                  </span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {qOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 border border-[var(--border)] rounded-[3px] bg-[var(--surface)]">
                        <input
                          type="radio"
                          name="correct"
                          checked={qCorrect === i}
                          onChange={() => setQCorrect(i)}
                          className="accent-[#b52228] cursor-pointer"
                        />
                        <span className="font-mono text-xs font-bold text-[var(--muted)]">{String.fromCharCode(65 + i)}.</span>
                        <input
                          value={opt}
                          onChange={(e) =>
                            setQOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))
                          }
                          placeholder={`Opsi ${String.fromCharCode(65 + i)}`}
                          className="w-full bg-transparent text-sm text-[var(--text)] outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="setting-field !p-3">
                  <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                    Kata Kunci Auto-Grading (pisahkan koma)
                  </label>
                  <input
                    value={qKeywords}
                    onChange={(e) => setQKeywords(e.target.value)}
                    placeholder="reserse,kriminal,penyidikan"
                    className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
                  />
                </div>
              )}

              <div>
                <button
                  type="button"
                  className="primary-button !min-h-[42px] px-6 text-xs"
                  onClick={addQuestion}
                  disabled={busy}
                >
                  {busy ? "Menyimpan..." : "Tambah Soal"}
                </button>
              </div>
            </div>
          </article>

          <article className="panel-card">
            <div className="card-heading mb-4">
              <div>
                <span className="section-kicker">DAFTAR SOAL</span>
                <h3 className="font-serif text-lg font-normal">Semua Pertanyaan ({questions.length})</h3>
              </div>
            </div>

            {questions.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Belum ada soal dalam bank soal.</p>
            ) : (
              <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
                {questions.map((q) => (
                  <div key={q.id} className="p-3 border border-[var(--border)] rounded-[3px] bg-[var(--surface-2)]">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-[var(--text)] leading-relaxed">{q.prompt}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="status-badge">
                          {q.type === "MCQ" ? `PG · ${q.points} pt` : `Essay · ${q.points} pt`}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm("Hapus soal ini?\n\nSoal yang dihapus tidak bisa dipulihkan dari panel ini.")) return;
                            setBusy(true);
                            await fetch("/api/admin/questions", {
                              method: "DELETE",
                              headers,
                              body: JSON.stringify({ id: q.id }),
                            });
                            await load();
                            setBusy(false);
                          }}
                          className="outline-button reject-button !min-h-[30px] !py-0 px-2 text-xs"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      )}

      {tab === "rekap" && <CandidatesTab headers={headers} />}
      {tab === "pendaftaran" && <ApplicationsTab headers={headers} />}
      {tab === "casis" && <CasisManagement headers={headers} onDeleted={() => load()} />}
      {tab === "data" && <BlacklistTab headers={headers} />}
      {tab === "discord" && <DiscordMessagesTab headers={headers} />}
      {tab === "content" && <ContentSettingsTab headers={headers} />}
        </section>
      </main>

      <footer className="system-footer mt-16">
        <div className="footer-brand">
          <img src="/design-assets/logo-pusdik.png" alt="Logo Pusdik Reserse" />
          <div>
            <strong>BARESKRIM POLRI RBX</strong>
            <span>PUSDIK RESERSE</span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Bareskrim Polri RBX. Hak Cipta Dilindungi.</span>
        </div>
      </footer>
    </div>
  );
}

// Settings Form Component
function SettingsForm({ headers }: { headers: Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({
    kkm: 70,
    examDurationMinutes: 45,
    minPoliceRank: 224,
    requiredGroupId: "",
    policeGroupId: "",
    bannedGroupIds: [],
    tahapAkademikRoleId: "",
    tahapInterviewRoleId: "",
    discordBotToken: "",
    discordBotSecret: "",
    discordGuildId: "",
    discordChannelId: "",
    discordBlacklistPendidikanChannelId: "",
    discordBotApiUrl: "http://localhost:3001",
    discordWebhookUrl: "",
  });
  const [loaded, setLoaded] = useState(false);
  const toast = useToastContext();

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings", { headers });
      const json = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...(json.settings ?? {}) }));
      } else {
        toast.error(json.message ?? "Gagal memuat pengaturan.");
      }
    } catch {
      toast.error("Gagal memuat pengaturan.");
    } finally {
      setLoaded(true);
    }
  }, [headers, toast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

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
        <div className="panel-card !min-h-0">
          <div className="card-heading mb-4">
            <span className="section-kicker">PARAMETER</span>
            <h3 className="font-serif text-base font-normal">Umum</h3>
          </div>
          <div className="space-y-4">
            <div className="setting-field !p-3">
              <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                Durasi Ujian (menit, 5-300)
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={(settings.examDurationMinutes as number) ?? 45}
                onChange={(e) => handleChange("examDurationMinutes", Number(e.target.value))}
                className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
              />
            </div>
            <div className="setting-field !p-3">
              <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                Minimal Pangkat Polisi (rank number)
              </label>
              <input
                type="number"
                min={1}
                max={255}
                value={(settings.minPoliceRank as number) ?? 224}
                onChange={(e) => handleChange("minPoliceRank", Number(e.target.value))}
                className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
              />
            </div>
          </div>
        </div>

        {/* Group IDs */}
        <div className="panel-card !min-h-0">
          <div className="card-heading mb-4">
            <span className="section-kicker">INTEGRASI ROBLOX</span>
            <h3 className="font-serif text-base font-normal">Grup & Role ID</h3>
          </div>
          <div className="space-y-3">
            <div className="setting-field !p-3">
              <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                Required Group ID ([RI] Republic Indonesia)
              </label>
              <input
                type="text"
                value={String(settings.requiredGroupId ?? 0)}
                onChange={(e) => handleChange("requiredGroupId", e.target.value)}
                className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
              />
            </div>
            <div className="setting-field !p-3">
              <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                Police Group ID (Kepolisian)
              </label>
              <input
                type="text"
                value={String(settings.policeGroupId ?? "")}
                onChange={(e) => handleChange("policeGroupId", e.target.value)}
                className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
              />
            </div>
            <div className="setting-field !p-3">
              <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                Banned Group IDs (pisahkan koma)
              </label>
              <input
                type="text"
                value={Array.isArray(settings.bannedGroupIds) ? settings.bannedGroupIds.join(",") : ""}
                onChange={(e) => handleChange("bannedGroupIds", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
              />
              <p className="mt-1 text-[11px] text-[var(--muted)]">Contoh: 367050757,34766643</p>
            </div>
            <div className="setting-field !p-3">
              <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                Role ID: Tahap Akademik
              </label>
              <input
                type="text"
                value={String(settings.tahapAkademikRoleId ?? "")}
                onChange={(e) => handleChange("tahapAkademikRoleId", e.target.value)}
                className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
              />
            </div>
            <div className="setting-field !p-3">
              <label className="text-xs uppercase tracking-wider text-[var(--muted)] font-bold block mb-1">
                Role ID: Tahap Interview
              </label>
              <input
                type="text"
                value={String(settings.tahapInterviewRoleId ?? "")}
                onChange={(e) => handleChange("tahapInterviewRoleId", e.target.value)}
                className="w-full h-10 px-3 border border-[var(--border-strong)] rounded-[3px] bg-[var(--surface-2)] text-[var(--text)] text-sm outline-none focus:border-[#b52228]"
              />
            </div>
          </div>
        </div>

        {/* Discord Bot */}
        <div className="panel-card sm:col-span-2 !min-h-0">
          <h3 className="font-semibold text-zinc-100 mb-4">Discord Bot & Webhook</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Discord Bot Token
              </label>
                <input
                  type="text"
                  value={String(settings.discordBotToken === "••••••••" ? "" : settings.discordBotToken ?? "")}
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
                value={String(settings.discordBotSecret === "••••••••" ? "" : settings.discordBotSecret ?? "")}
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
                value={String(settings.discordGuildId ?? "")}
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
                value={String(settings.discordChannelId ?? "")}
                onChange={(e) => handleChange("discordChannelId", e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Discord Channel ID (blacklist pendidikan)
              </label>
              <input
                type="text"
                value={String(settings.discordBlacklistPendidikanChannelId ?? "")}
                onChange={(e) => handleChange("discordBlacklistPendidikanChannelId", e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
              <p className="mt-1 text-[11px] text-zinc-500">Channel Discord blacklist pusdik yang dibaca fitur pencarian admin.</p>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Discord Bot API URL
              </label>
              <input
                type="url"
                value={String(settings.discordBotApiUrl ?? "http://localhost:3001")}
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
                value={String(settings.discordWebhookUrl === "••••••••" ? "" : settings.discordWebhookUrl ?? "")}
                onChange={(e) => handleChange("discordWebhookUrl", e.target.value)}
                placeholder="Biarkan kosong untuk tidak mengubah"
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
              />
              <p className="mt-1 text-[11px] text-zinc-500">Webhook untuk kirim laporan ujian ke channel Discord.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border)] mt-6">
        <button
          type="button"
          className="primary-button !min-h-[42px] px-6 text-xs"
          onClick={saveSettings}
          disabled={busy}
        >
          {busy ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
        <button
          type="button"
          className="outline-button !min-h-[42px] px-4 text-xs"
          onClick={fetchSettings}
          disabled={busy}
        >
          Batal / Muat Ulang
        </button>
      </div>

      <div className="text-xs text-zinc-500">
        <p>Catatan: Perubahan pada Discord Bot Token/Secret/Webhook dan Group ID memerlukan restart server agar berlaku penuh.</p>
        <p>Nilai yang ditampilkan sebagai &quot;••••••••&quot; adalah nilai yang tersembunyi (sudah diset). Biarkan kosong jika tidak ingin mengubah.</p>
      </div>
    </div>
  );
}
