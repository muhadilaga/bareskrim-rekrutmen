"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface AttendanceRecord {
  id: string;
  status: string;
  motivation?: string | null;
  motivationStatus?: string | null;
  motivationReason?: string | null;
  motivationAttemptCount?: number;
  roleEligible?: boolean;
  createdAt: string;
}

interface CasisProfile {
  id?: string;
  username: string;
  displayName?: string;
  discordUsername?: string | null;
  avatarUrl?: string | null;
  policeGroupRank?: string | null;
}

export function AttendanceChecker() {
  const [activeTab, setActiveTab] = useState<"absen" | "status">("absen");
  const [attended, setAttended] = useState(false);
  const [noPeriod, setNoPeriod] = useState<boolean | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);

  // Form input state
  const [robloxUsername, setRobloxUsername] = useState("");
  const [discordUsername, setDiscordUsername] = useState("");
  const [motivation, setMotivation] = useState("");

  // Result & feedback state
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
    roleEligible?: boolean;
    motivationStatus?: string;
  } | null>(null);

  const [attendanceData, setAttendanceData] = useState<AttendanceRecord | null>(null);
  const [casisProfile, setCasisProfile] = useState<CasisProfile | null>(null);

  // Status check input & result
  const [checkUsername, setCheckUsername] = useState("");
  const [checkResult, setCheckResult] = useState<{
    searched: boolean;
    registered?: boolean;
    attended?: boolean;
    attendance?: AttendanceRecord | null;
    period?: {
      name?: string;
      isExamOpen?: boolean;
      examStartTime?: string | null;
      examEndTime?: string | null;
    } | null;
    message?: string;
    user?: CasisProfile | null;
  } | null>(null);

  useEffect(() => {
    // Cek periode aktif + apakah sudah absen saat mount
    Promise.all([
      fetch("/api/period/active").then((r) => (r.ok ? r.json() : { active: false })),
      fetch("/api/attendance/check").then((r) => (r.ok ? r.json() : { attended: false })),
    ])
      .then(([periodData, attendData]) => {
        setNoPeriod(!periodData.active);
        if (attendData.attended && attendData.attendance) {
          setAttended(true);
          setAttendanceData(attendData.attendance);
          if (attendData.user) {
            setCasisProfile(attendData.user);
          }
        }
      })
      .catch(() => {
        setFetchError(true);
      });
  }, []);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!robloxUsername.trim()) {
      setFeedback({ ok: false, message: "Username Roblox wajib diisi." });
      return;
    }
    if (!discordUsername.trim()) {
      setFeedback({ ok: false, message: "Username Discord wajib diisi." });
      return;
    }
    if (!motivation.trim()) {
      setFeedback({
        ok: false,
        message: "Motivasi wajib diisi untuk absensi.",
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/attendance/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          robloxUsername: robloxUsername.trim(),
          discordUsername: discordUsername.trim(),
          motivation: motivation.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.ok) {
        setFeedback({
          ok: true,
          message: json.message,
          roleEligible: json.roleEligible,
          motivationStatus: json.motivationStatus,
        });
        if (json.attendance) {
          setAttended(true);
          setAttendanceData(json.attendance);
        }
        if (json.user) {
          setCasisProfile(json.user);
        }
      } else {
        setFeedback({
          ok: false,
          message: json.message || "Gagal mengirimkan absensi.",
        });
      }
    } catch {
      setFeedback({
        ok: false,
        message: "Terjadi kesalahan jaringan. Silakan periksa koneksi Anda.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckStatus(e: React.FormEvent) {
    e.preventDefault();
    const target = checkUsername.trim() || robloxUsername.trim();
    if (!target) {
      setFeedback({ ok: false, message: "Masukkan username Roblox untuk memeriksa status." });
      return;
    }

    setChecking(true);
    try {
      const res = await fetch(`/api/attendance/check?username=${encodeURIComponent(target)}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setCheckResult({
          searched: true,
          registered: json.registered,
          attended: json.attended,
          attendance: json.attendance,
          period: json.period,
          message: json.message,
          user: json.user,
        });
      } else {
        setCheckResult({
          searched: true,
          registered: false,
          attended: false,
          message: json.message || "Gagal menemukan data calon siswa.",
        });
      }
    } catch {
      setCheckResult({
        searched: true,
        message: "Terjadi kesalahan saat memeriksa data calon siswa.",
      });
    } finally {
      setChecking(false);
    }
  }

  // Fetch error
  if (fetchError) {
    return (
      <div className="attendance-panel-wrapper flex items-center justify-center py-8">
        <div className="attendance-panel animate-scale-in text-center" style={{ maxWidth: 480 }}>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="font-serif text-xl font-bold text-red-300">Gagal Memuat Data</h1>
          <p className="casis-login-description mt-3">
            Tidak dapat terhubung ke server. Periksa koneksi jaringan Anda dan coba lagi.
          </p>
          <button
            type="button"
            className="attendance-secondary-btn mt-6"
            onClick={() => window.location.reload()}
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  // Tidak ada periode aktif
  if (noPeriod) {
    return (
      <div className="attendance-panel-wrapper flex items-center justify-center py-8">
        <div className="attendance-panel animate-scale-in text-center">
          <div className="casis-eyebrow mb-2">STATUS PENDAFTARAN</div>
          <h1 className="font-serif text-2xl font-normal text-white">Belum Ada Periode Aktif</h1>
          <p className="casis-login-description mt-3">
            Pendaftaran belum dibuka. Pantau server Discord resmi Bareskrim Polri RBX untuk pengumuman jadwal seleksi.
          </p>
          <div className="mt-8">
            <Link href="/" className="attendance-secondary-btn">
              Kembali ke Beranda
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Sudah absen (dari check API / baru submit)
  if (attended && attendanceData) {
    return (
      <div className="attendance-panel-wrapper flex items-center justify-center py-4">
        <div className="attendance-panel animate-scale-in">
          <div className="attendance-header">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="casis-eyebrow">STUDENT ACCESS / STATUS CASIS</p>
                <h1>Absensi Terverifikasi</h1>
                <p className="casis-login-description" style={{ marginTop: "8px", fontSize: "14px" }}>
                  Data kehadiran dan evaluasi motivasi Anda telah tercatat dalam sistem Pusdik Reserse.
                </p>
              </div>
              <span style={{ fontSize: "10px", letterSpacing: ".14em", padding: "4px 8px", border: "1px solid #78c889", color: "#78c889", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap" }}>
                HADIR
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Profil Casis V2 dari grup POLRI | Kepolisian Republik Indonesia */}
            {casisProfile && (
              <article className="student-card" style={{ marginTop: "16px" }}>
                <div className="card-heading">
                  <div>
                    <p>PROFIL AKUN ROBLOX</p>
                  </div>
                  <span className="card-status" style={{ color: "var(--casis-gold)" }}>
                    {casisProfile.policeGroupRank || "CASIS"}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    padding: "16px 0",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
                  }}
                >
                  {casisProfile.avatarUrl ? (
                    <img
                      src={casisProfile.avatarUrl}
                      alt={casisProfile.displayName || casisProfile.username}
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        border: "2px solid var(--casis-border)",
                        backgroundColor: "#111",
                        objectFit: "cover",
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        border: "2px solid var(--casis-border)",
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "24px",
                        flexShrink: 0,
                      }}
                    >
                      👤
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--casis-text)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {casisProfile.displayName || casisProfile.username}
                    </strong>
                    <span
                      style={{
                        display: "block",
                        marginTop: "2px",
                        fontSize: "12px",
                        color: "var(--casis-muted)",
                      }}
                    >
                      @{casisProfile.username}
                    </span>
                  </div>
                </div>

                <div className="profile-list">
                  <div>
                    <span>PANGKAT POLRI</span>
                    <strong style={{ color: "var(--casis-gold)", fontWeight: 700 }}>
                      {casisProfile.policeGroupRank || "CASIS"}
                    </strong>
                  </div>
                  <div>
                    <span>SUMBER GRUP</span>
                    <strong style={{ fontSize: "12px" }}>POLRI | Kepolisian Republik Indonesia</strong>
                  </div>
                  <div>
                    <span>DISCORD</span>
                    <strong>
                      {casisProfile.discordUsername ? `@${casisProfile.discordUsername}` : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>STATUS VERIFIKASI</span>
                    <strong style={{ color: "var(--casis-green)" }}>TERVERIFIKASI</strong>
                  </div>
                </div>
              </article>
            )}

            {/* Status Panel V2 */}
            <div className="status-panel" style={{ marginTop: "16px" }}>
              <div className="status-panel-main">
                <div
                  className="status-dot"
                  style={{
                    background: attendanceData.roleEligible ? "var(--casis-green)" : "var(--casis-gold)",
                    boxShadow: attendanceData.roleEligible
                      ? "0 0 0 4px rgba(120, 200, 137, 0.15)"
                      : "0 0 0 4px rgba(173, 149, 100, 0.15)",
                  }}
                />
                <div>
                  <h2 style={{ color: "var(--casis-text)" }}>
                    HADIR ({attendanceData.status})
                  </h2>
                  <p>
                    {attendanceData.roleEligible
                      ? "✓ Memenuhi Syarat (Lolos Tahap Akademik). Telah diverifikasi oleh instruktur pada admin panel."
                      : "⚡ Data kehadiran diterima. Menunggu verifikasi instruktur seleksi pada admin panel untuk penetapan status Lolos Tahap Akademik."}
                  </p>
                  {attendanceData.motivationReason && (
                    <p style={{ marginTop: "6px", fontSize: "12px", fontStyle: "italic" }}>
                      Catatan Instruktur: {attendanceData.motivationReason}
                    </p>
                  )}
                </div>
              </div>
              <div className="status-date">
                <span>STATUS SELEKSI</span>
                <strong style={{ color: attendanceData.roleEligible ? "var(--casis-green)" : "var(--casis-gold)" }}>
                  {attendanceData.roleEligible ? "LOLOS TAHAP AKADEMIK" : "DALAM PENINJAUAN INSTRUKTUR"}
                </strong>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link href="/" className="attendance-secondary-btn flex-1" style={{ textDecoration: "none" }}>
                ← Kembali ke Beranda
              </Link>
              {attendanceData.roleEligible ? (
                <Link href="/ujian" className="attendance-submit-btn flex-1" style={{ textDecoration: "none", marginTop: 0 }}>
                  Masuk Ruang Ujian →
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAttended(false);
                    setActiveTab("status");
                  }}
                  className="attendance-submit-btn flex-1"
                  style={{ textDecoration: "none", marginTop: 0 }}
                >
                  Cek Status Verifikasi Instruktur →
                </button>
              )}
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-between text-xs text-zinc-500">
              <button
                type="button"
                onClick={() => setAttended(false)}
                className="hover:text-zinc-300 transition underline underline-offset-4 bg-transparent border-0 cursor-pointer p-0 text-zinc-500"
              >
                Isi Ulang Absen / Cek Akun Lain
              </button>
              <Link href="/" className="hover:text-zinc-300 transition text-zinc-500">
                Kembali ke Beranda
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Form Absensi & Cek Status Aktif
  return (
    <div className="attendance-panel-wrapper flex items-center justify-center py-4">
      <div className="attendance-panel animate-scale-in">
        {/* Header Prototype */}
        <div className="attendance-header">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="casis-eyebrow">STUDENT ACCESS / PORTAL CASIS</p>
              <h1>Absensi & Status Seleksi</h1>
              <p className="casis-login-description" style={{ marginTop: "8px", fontSize: "14px" }}>
                Verifikasi kehadiran peserta dan evaluasi motivasi menuju Tahap Akademik.
              </p>
            </div>
            <span style={{ fontSize: "10px", letterSpacing: ".14em", padding: "4px 8px", border: "1px solid var(--casis-gold)", color: "var(--casis-gold)", textTransform: "uppercase", fontWeight: 700, whiteSpace: "nowrap" }}>
              PUSDIK RESERSE
            </span>
          </div>
        </div>

        {/* Tab Navigasi Mode */}
        <div className="attendance-tabs">
          <button
            type="button"
            onClick={() => {
              setActiveTab("absen");
              setFeedback(null);
            }}
            className={`attendance-tab-btn ${activeTab === "absen" ? "active" : ""}`}
          >
            Form Absensi Casis
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("status");
              setFeedback(null);
            }}
            className={`attendance-tab-btn ${activeTab === "status" ? "active" : ""}`}
          >
            Cek Hasil Absen & Status Tahap Akademik
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div className={`attendance-feedback ${feedback.ok ? "success" : "error"}`}>
            <p style={{ fontWeight: 700, margin: 0 }}>
              {feedback.ok ? "✓ Status Absensi" : "⚠️ Perhatian"}
            </p>
            <p style={{ margin: "4px 0 0" }}>{feedback.message}</p>
            {feedback.ok && feedback.roleEligible && (
              <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                <Link href="/dashboard" className="attendance-submit-btn" style={{ marginTop: 0, textDecoration: "none", minHeight: "40px", fontSize: "11px", padding: "8px 14px" }}>
                  Ke Dashboard Casis →
                </Link>
                <Link href="/ujian" className="attendance-secondary-btn" style={{ textDecoration: "none", minHeight: "40px", fontSize: "11px", padding: "8px 14px" }}>
                  Masuk Ruang Ujian →
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Form Absensi Casis */}
        {activeTab === "absen" && (
          <form onSubmit={handleFormSubmit}>
            <div className="attendance-form-group">
              <label htmlFor="casisRobloxUsername">Username Roblox</label>
              <input
                id="casisRobloxUsername"
                type="text"
                required
                value={robloxUsername}
                onChange={(e) => setRobloxUsername(e.target.value)}
                placeholder="Contoh: AresInvestigator"
                autoComplete="username"
              />
              <small>Harus cocok dengan username pendaftaran whitelist yang diterima.</small>
            </div>

            <div className="attendance-form-group">
              <label htmlFor="casisDiscordUsername">Username Discord</label>
              <input
                id="casisDiscordUsername"
                type="text"
                required
                value={discordUsername}
                onChange={(e) => setDiscordUsername(e.target.value)}
                placeholder="Contoh: ares#1234 atau ares_discord"
              />
            </div>

            <div className="attendance-form-group">
              <label htmlFor="casisMotivation">
                <span>Motivasi Bergabung</span>
                <span style={{ fontSize: "10px", color: "var(--casis-gold)" }}>
                  Min. 20 karakter ({motivation.trim().length}/20)
                </span>
              </label>
              <textarea
                id="casisMotivation"
                required
                rows={3}
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
                placeholder="Jelaskan alasan dan komitmen Anda ingin bergabung dalam Pusdik Reserse Bareskrim Polri..."
              />
              <small>Motivasi yang masuk akal dan terstruktur akan otomatis meloloskan ke Tahap Akademik.</small>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="attendance-submit-btn"
            >
              {submitting ? "Memproses Absensi..." : "Kirim Absensi & Verifikasi Tahap Akademik →"}
            </button>
          </form>
        )}

        {/* Tab Cek Status & Jadwal */}
        {activeTab === "status" && (
          <div className="space-y-4">
            <form onSubmit={handleCheckStatus} className="flex gap-2">
              <input
                type="text"
                value={checkUsername}
                onChange={(e) => setCheckUsername(e.target.value)}
                placeholder="Masukkan username Roblox..."
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  background: "#080909",
                  border: "1px solid rgba(255, 255, 255, .2)",
                  color: "#f1f1ed",
                  fontFamily: "inherit",
                  fontSize: "14px",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={checking}
                className="attendance-secondary-btn"
                style={{ padding: "0 18px", color: "var(--casis-gold)", borderColor: "var(--casis-gold)" }}
              >
                {checking ? "Cek..." : "Periksa"}
              </button>
            </form>

            {checkResult && checkResult.searched && (
              <div style={{ marginTop: "20px" }}>
                {checkResult.attendance ? (
                  <div className="space-y-4">
                    {/* Profil Akun Roblox & Pangkat V2 */}
                    {checkResult.user && (
                      <article className="student-card">
                        <div className="card-heading">
                          <div>
                            <p>PROFIL AKUN ROBLOX</p>
                          </div>
                          <span className="card-status" style={{ color: "var(--casis-gold)" }}>
                            {checkResult.user.policeGroupRank || "CASIS"}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "14px",
                            padding: "14px 0",
                            borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
                          }}
                        >
                          {checkResult.user.avatarUrl ? (
                            <img
                              src={checkResult.user.avatarUrl}
                              alt={checkResult.user.displayName || checkResult.user.username}
                              style={{
                                width: "48px",
                                height: "48px",
                                borderRadius: "50%",
                                border: "2px solid var(--casis-border)",
                                backgroundColor: "#111",
                                objectFit: "cover",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "48px",
                                height: "48px",
                                borderRadius: "50%",
                                border: "2px solid var(--casis-border)",
                                backgroundColor: "rgba(255, 255, 255, 0.05)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "20px",
                                flexShrink: 0,
                              }}
                            >
                              👤
                            </div>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <strong
                              style={{
                                display: "block",
                                fontSize: "14px",
                                fontWeight: 600,
                                color: "var(--casis-text)",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {checkResult.user.displayName || checkResult.user.username}
                            </strong>
                            <span
                              style={{
                                display: "block",
                                marginTop: "2px",
                                fontSize: "11px",
                                color: "var(--casis-muted)",
                              }}
                            >
                              @{checkResult.user.username}
                            </span>
                          </div>
                        </div>

                        <div className="profile-list">
                          <div>
                            <span>PANGKAT POLRI</span>
                            <strong style={{ color: "var(--casis-gold)", fontWeight: 700 }}>
                              {checkResult.user.policeGroupRank || "CASIS"}
                            </strong>
                          </div>
                          <div>
                            <span>SUMBER GRUP</span>
                            <strong style={{ fontSize: "11px" }}>POLRI | Kepolisian Republik Indonesia</strong>
                          </div>
                        </div>
                      </article>
                    )}

                    <div className="status-panel">
                      <div className="status-panel-main">
                        <div
                          className="status-dot"
                          style={{
                            background: checkResult.attendance.roleEligible ? "var(--casis-green)" : "var(--casis-gold)",
                            boxShadow: checkResult.attendance.roleEligible
                              ? "0 0 0 4px rgba(120, 200, 137, 0.15)"
                              : "0 0 0 4px rgba(173, 149, 100, 0.15)",
                          }}
                        />
                        <div>
                          <h2 style={{ color: "var(--casis-text)" }}>
                            STATUS: SUDAH HADIR
                          </h2>
                          <p>
                            {checkResult.attendance.roleEligible
                              ? "✓ Motivasi dan syarat disetujui (Lolos Tahap Akademik). Telah diverifikasi oleh instruktur pada admin panel."
                              : "⚡ Data kehadiran tercatat. Menunggu verifikasi instruktur seleksi pada admin panel untuk penetapan status Lolos Tahap Akademik."}
                          </p>
                          {checkResult.attendance.motivationReason && (
                            <p style={{ marginTop: "6px", fontSize: "12px", fontStyle: "italic" }}>
                              Catatan Instruktur: {checkResult.attendance.motivationReason}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="status-date">
                        <span>STATUS SELEKSI</span>
                        <strong style={{ color: checkResult.attendance.roleEligible ? "var(--casis-green)" : "var(--casis-gold)" }}>
                          {checkResult.attendance.roleEligible ? "LOLOS TAHAP AKADEMIK" : "DALAM PENINJAUAN INSTRUKTUR"}
                        </strong>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 mt-4 pt-3 border-t border-white/10">
                      {checkResult.attendance.roleEligible ? (
                        <Link href="/ujian" className="attendance-submit-btn flex-1" style={{ marginTop: 0, textDecoration: "none", minHeight: "40px", fontSize: "11px" }}>
                          Masuk Ruang Ujian →
                        </Link>
                      ) : (
                        <div style={{ fontSize: "12px", color: "var(--casis-muted)", textAlign: "center", width: "100%", padding: "6px" }}>
                          Role Tahap Akademik akan aktif setelah diverifikasi & disetujui oleh instruktur di Admin Panel.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="attendance-result-card text-center py-2" style={{ color: "var(--casis-muted)" }}>
                    <p style={{ fontWeight: 700, color: "var(--casis-text)", margin: 0 }}>
                      {checkResult.registered ? "Belum Mengisi Absensi" : "Perhatian"}
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: "12px" }}>
                      {checkResult.registered
                        ? "Anda dapat mengisi form absensi di tab FORM ABSENSI CASIS."
                        : checkResult.message || "Pastikan penulisan username Roblox Anda benar."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigasi Tambahan */}
        <div className="mt-8 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-zinc-500 gap-3">
          <span className="text-zinc-500">
            Pusdik Reserse Bareskrim Polri RBX
          </span>
          <Link href="/" className="hover:text-zinc-300 transition text-zinc-500">
            Kembali ke Beranda →
          </Link>
        </div>
      </div>
    </div>
  );
}
