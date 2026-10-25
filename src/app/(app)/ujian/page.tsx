import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { startExamSession } from "@/lib/exam-service";
import { CONFIG } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { ExamForm } from "@/components/exam/ExamForm";
import { TabLock } from "@/components/exam/TabLock";
import { isNextRedirectError } from "@/lib/utils";
import { ensureCandidateApplication } from "@/lib/application-service";
import { getRobloxUserSummary } from "@/lib/roblox";
import Link from "next/link";
import "@/styles/casis.css";

export const metadata = { title: "Jadwal & Ruang Ujian - Rekrutmen Bareskrim" };

function formatWib(date: Date | string | null | undefined): string {
  if (!date) return "Ditentukan oleh instruktur";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "Ditentukan oleh instruktur";
    return (
      new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }).format(d) + " WIB"
    );
  } catch {
    return "Ditentukan oleh instruktur";
  }
}

interface ExamPageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}

export default async function ExamPage({ searchParams }: ExamPageProps) {
  try {
    const user = await getSessionUser();
    if (!user) {
      redirect("/login?callbackUrl=/ujian");
    }

    if (user.matraBlocked) {
      redirect("/tolak");
    }

    const resolvedParams = searchParams ? await Promise.resolve(searchParams) : {};
    const shouldStart = resolvedParams.start === "1" || resolvedParams.start === "true";

    // Periode seleksi aktif
    const activePeriod = await prisma.examPeriod.findFirst({
      where: { isActive: true, deletedAt: null },
      include: { recruitmentPeriod: true },
    });

    // Auto-ensure candidate application terhubung tanpa token claim manual
    if (activePeriod) {
      await ensureCandidateApplication(prisma, user, activePeriod.recruitmentPeriodId).catch(() => null);
    }

    // Cek absensi user untuk periode ini
    const attendance = activePeriod
      ? await prisma.attendance.findFirst({
          where: {
            periodId: activePeriod.id,
            tahap: "AKADEMIK",
            userId: user.id,
            deletedAt: null,
          },
        })
      : null;

    // Cek attempt ujian yang sudah ada
    const existingAttempt = activePeriod
      ? await prisma.examAttempt.findFirst({
          where: {
            periodId: activePeriod.id,
            userId: user.id,
          },
          include: { result: true },
        })
      : null;

    // Pangkat grup POLRI & profil Roblox akurat dari grup "POLRI | Kepolisian Republik Indonesia" (14460225)
    let robloxProfile = null;
    try {
      robloxProfile = await getRobloxUserSummary(user.username, CONFIG.policeGroupId);
    } catch {
      // Fallback ke data user di DB
    }
    const policeRank = robloxProfile?.policeGroupRank || user.policeGroupRank || "CASIS";
    const avatarUrl = robloxProfile?.avatarUrl || user.avatarUrl || `https://images.rbxcdn.com/placeholder-avatar.png`;

    // 1. Jika attempt sudah selesai disubmit -> Tampilkan status selesai V2
    if (existingAttempt?.submittedAt) {
      return (
        <div className="casis-root">
          <header className="student-header">
            <Link href="/dashboard" className="student-brand" aria-label="Portal Casis Bareskrim">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/design-assets/logo-pusdik.png" alt="" width={34} height={34} />
              <div>
                <strong>BARESKRIM POLRI RBX</strong>
                <span>PUSDIK RESERSE</span>
              </div>
            </Link>
            <div className="student-header-right">
              <div className="student-user">
                <span>CALON SISWA</span>
                <strong>{user.displayName || user.username}</strong>
              </div>
              <Link href="/dashboard" className="logout-button">
                DASHBOARD
              </Link>
            </div>
          </header>

          <main id="casis-main" className="casis-main--dashboard" style={{ padding: "40px 0 80px" }}>
            <div className="student-welcome">
              <span className="casis-eyebrow">
                STATUS UJIAN SELEKSI / {activePeriod?.name?.toUpperCase() ?? "SELEKSI CASIS"}
              </span>
              <h1>
                Ujian Telah <span>Selesai Dikerjakan.</span>
              </h1>
              <p>
                Lembar jawaban ujian seleksi akademik Anda telah berhasil tersimpan dan diverifikasi oleh sistem.
              </p>
            </div>

            <div className="casis-dashboard-grid" style={{ marginTop: "24px" }}>
              <div className="casis-section">
                <div className="casis-section-label">RINCIAN PENGERJAAN</div>
                <div className="student-card" style={{ padding: "24px" }}>
                  <div className="profile-list">
                    <div className="spec-item">
                      <span className="spec-label">PERIODE SELEKSI</span>
                      <strong className="spec-val">{activePeriod?.name ?? "-"}</strong>
                    </div>
                    <div className="spec-item">
                      <span className="spec-label">WAKTU SUBMIT</span>
                      <strong className="spec-val">{formatWib(existingAttempt.submittedAt)}</strong>
                    </div>
                    <div className="spec-item">
                      <span className="spec-label">STATUS VERIFIKASI</span>
                      <strong className="spec-val text-green-400" style={{ color: "#78c889" }}>
                        ✓ TERSIMPAN DI SERVER
                      </strong>
                    </div>
                    <div className="spec-item">
                      <span className="spec-label">STATUS KELULUSAN</span>
                      <strong className="spec-val text-gold" style={{ color: "var(--casis-gold)" }}>
                        {existingAttempt.result ? "HASIL TELAH DIUMUMKAN" : "MENUNGGU PENETAPAN RESMI"}
                      </strong>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-4 border-t border-white/10">
                    <Link href="/hasil" className="attendance-submit-btn flex-1" style={{ marginTop: 0, textDecoration: "none" }}>
                      Lihat Hasil Kelulusan Ujian →
                    </Link>
                    <Link href="/dashboard" className="attendance-secondary-btn flex-1" style={{ textDecoration: "none" }}>
                      Kembali ke Dashboard
                    </Link>
                  </div>
                </div>
              </div>

              <div className="casis-section">
                <div className="casis-section-label">DATA CALON SISWA</div>
                <div className="student-card" style={{ padding: "24px" }}>
                  <div className="flex items-center gap-4 mb-4">
                    <img
                      src={avatarUrl}
                      alt={user.displayName || user.username}
                      className="w-16 h-16 rounded-full border border-white/20 bg-black/40 object-cover"
                    />
                    <div>
                      <h3 className="font-bold text-white text-base m-0">
                        {user.displayName || user.username}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">@{user.username}</p>
                      <span
                        className="inline-block mt-1 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase border rounded"
                        style={{ borderColor: "rgba(173, 149, 100, 0.4)", color: "var(--casis-gold)", background: "rgba(173, 149, 100, 0.1)" }}
                      >
                        {policeRank}
                      </span>
                    </div>
                  </div>

                  <div className="profile-list pt-2 border-t border-white/10">
                    <div className="spec-item">
                      <span className="spec-label">GRUP KEPOLISIAN</span>
                      <span className="spec-val">{CONFIG.policeGroupName}</span>
                    </div>
                    <div className="spec-item">
                      <span className="spec-label">DISCORD CASIS</span>
                      <span className="spec-val">@{user.discordUsername || "-"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      );
    }

    // 2. Jika sesi ujian sedang aktif berjalan (attempt belum disubmit) ATAU user menekan tombol Mulai Ujian:
    const isAttemptInProgress = Boolean(existingAttempt && !existingAttempt.submittedAt);
    let sessionError: string | null = null;

    if (isAttemptInProgress || shouldStart) {
      const session = await startExamSession(user);

      if (session.ok) {
        return (
          <TabLock>
            <div className="casis-root">
              <header className="student-header">
                <Link href="/dashboard" className="student-brand" aria-label="Portal Casis Bareskrim">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/design-assets/logo-pusdik.png" alt="" width={34} height={34} />
                  <div>
                    <strong>BARESKRIM POLRI RBX</strong>
                    <span>PUSDIK RESERSE</span>
                  </div>
                </Link>
                <div className="student-header-right">
                  <div className="student-user">
                    <span>CALON SISWA</span>
                    <strong>{user.displayName || user.username}</strong>
                  </div>
                  <span
                    style={{
                      padding: "4px 10px",
                      border: "1px solid rgba(80, 170, 120, 0.4)",
                      background: "rgba(80, 170, 120, 0.12)",
                      color: "#62c799",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                    }}
                  >
                    SESI UJIAN AKTIF
                  </span>
                </div>
              </header>

              <main id="casis-main" className="casis-main--dashboard" style={{ padding: "40px 0 80px" }}>
                <div className="student-welcome" style={{ maxWidth: "860px", margin: "0 auto 24px" }}>
                  <div>
                    <span className="casis-eyebrow">
                      LEMBAR UJIAN SELEKSI / {session.period.name.toUpperCase()}
                    </span>
                    <h1>
                      Ujian Seleksi <span>Akademik Kepolisian.</span>
                    </h1>
                    <p className="welcome-copy">
                      Halo, <strong>{user.displayName || user.username}</strong>. Selesaikan butir soal pilihan ganda dan esai di bawah ini secara teliti. Sistem anti-cheat aktif selama pengerjaan.
                    </p>
                  </div>
                </div>

                <ExamForm
                  attemptId={session.attemptId}
                  questions={session.questions}
                  periodName={session.period.name}
                  durationMinutes={CONFIG.examDurationMinutes}
                  remainingSeconds={session.remainingSeconds}
                  serverSavedAnswers={session.savedAnswers}
                  serverFlaggedQuestions={session.flaggedQuestions}
                  serverBookmarkedQuestions={session.bookmarkedQuestions}
                />
              </main>
            </div>
          </TabLock>
        );
      }

      // Jika gagal start session, simpan error untuk ditampilkan dalam V2 design
      sessionError = session.message;
    }

    // 3. Tampilan Halaman Jadwal Ruang Ujian V2 (Acuan Desain V2 & Setting Tab Periode Admin)
    const isExamOpen = Boolean(activePeriod?.isExamOpen);
    const hasAttended = Boolean(attendance);

    return (
      <div className="casis-root">
        <header className="student-header">
          <Link href="/dashboard" className="student-brand" aria-label="Portal Casis Bareskrim">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design-assets/logo-pusdik.png" alt="" width={34} height={34} />
            <div>
              <strong>BARESKRIM POLRI RBX</strong>
              <span>PUSDIK RESERSE</span>
            </div>
          </Link>
          <div className="student-header-right">
            <div className="student-user">
              <span>CALON SISWA</span>
              <strong>{user.displayName || user.username}</strong>
            </div>
            <Link href="/dashboard" className="logout-button">
              DASHBOARD
            </Link>
          </div>
        </header>

        <main id="casis-main" className="casis-main--dashboard" style={{ padding: "40px 0 80px" }}>
          {/* Header Sambutan V2 */}
          <div className="student-welcome">
            <span className="casis-eyebrow">
              JADWAL & RUANG UJIAN / {activePeriod?.name?.toUpperCase() ?? "PUSDIK RESERSE"}
            </span>
            <h1>
              Jadwal Ruang <span>Ujian Seleksi.</span>
            </h1>
            <p>
              Informasi sesi pengerjaan ujian akademik calon siswa Pusdik Reserse Bareskrim Polri.
              Pengaturan jadwal dan pembukaan sesi ujian dikonfigurasi melalui tab Periode di Admin Panel.
            </p>
          </div>

          {/* Banner Pesan Error / Status Mulai */}
          {sessionError && (
            <div className="attendance-feedback error" style={{ marginTop: "24px" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>⚠️ Pemberitahuan Sesi Ujian</p>
              <p style={{ margin: "6px 0 0" }}>{sessionError}</p>
            </div>
          )}

          {/* Banner Status Sesi Ujian */}
          <div
            className={`attendance-feedback ${isExamOpen ? "success" : ""}`}
            style={{
              marginTop: sessionError ? "12px" : "24px",
              background: isExamOpen ? "rgba(18, 34, 22, 0.75)" : "rgba(28, 24, 18, 0.75)",
              borderColor: isExamOpen ? "rgba(104, 180, 120, 0.4)" : "rgba(173, 149, 100, 0.4)",
              color: isExamOpen ? "#78c889" : "var(--casis-gold)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{isExamOpen ? "🟢" : "🔒"}</span>
              <strong>
                {isExamOpen
                  ? "STATUS: RUANG UJIAN TERBUKA"
                  : "STATUS: SESI UJIAN BELUM DIBUKA OLEH INSTRUKTUR"}
              </strong>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: isExamOpen ? "#b8e2c2" : "var(--casis-muted)" }}>
              {isExamOpen
                ? "Sesi ujian saat ini sedang dibuka oleh instruktur. Pastikan Anda telah mengisi absensi sebelum memulai pengerjaan."
                : "Sesi ujian saat ini belum dibuka oleh instruktur melalui tab Periode di Admin Panel. Silakan menunggu arahan atau pembukaan jadwal resmi."}
            </p>
          </div>

          {/* Grid Layout V2 */}
          <div className="casis-dashboard-grid" style={{ marginTop: "24px" }}>
            {/* Kolom Kiri: Konfigurasi Jadwal Ujian dari Tab Periode Admin */}
            <div className="casis-section">
              <div className="casis-section-label">KONFIGURASI JADWAL DARI ADMIN PANEL</div>
              <div className="student-card" style={{ padding: "24px" }}>
                <div className="profile-list">
                  <div className="spec-item">
                    <span className="spec-label">PERIODE SELEKSI</span>
                    <strong className="spec-val">{activePeriod?.name ?? "Tidak Ada Periode Aktif"}</strong>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">WAKTU MULAI UJIAN</span>
                    <strong className="spec-val">{formatWib(activePeriod?.examStartTime)}</strong>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">WAKTU SELESAI UJIAN</span>
                    <strong className="spec-val">{formatWib(activePeriod?.examEndTime)}</strong>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">DURASI PENGERJAAN</span>
                    <strong className="spec-val">{CONFIG.examDurationMinutes} Menit</strong>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">PASSING GRADE (KKM)</span>
                    <strong className="spec-val">{activePeriod?.passThreshold ?? 70}%</strong>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">KOMPOSISI SOAL</span>
                    <strong className="spec-val">
                      {activePeriod?.mcqCount ?? 15} PG & {activePeriod?.essayCount ?? 5} Essay
                    </strong>
                  </div>
                </div>

                {/* Tata Tertib */}
                <div className="mt-6 pt-4 border-t border-white/10">
                  <h4 className="text-xs font-bold tracking-wider uppercase text-zinc-300 mb-2">
                    Tata Tertib Pengerjaan Ujian
                  </h4>
                  <ul className="text-xs text-zinc-400 space-y-1.5 pl-4 list-disc">
                    <li>Peserta wajib mengisi absensi casis terlebih dahulu sebelum ujian dimulai.</li>
                    <li>Sistem Anti-Cheat dan Tab Lock aktif: dilarang berpindah tab atau meminimalkan browser.</li>
                    <li>Waktu pengerjaan {CONFIG.examDurationMinutes} menit akan berjalan mundur setelah menekan Mulai.</li>
                    <li>Jawaban disimpan otomatis ke server secara berkala selama ujian.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Kolom Kanan: Kartu Profil Casis & Aksi Ruang Ujian */}
            <div className="casis-section">
              <div className="casis-section-label">PROFIL PESERTA & STATUS KELAYAKAN</div>
              <div className="student-card" style={{ padding: "24px" }}>
                <div className="flex items-center gap-4 mb-4">
                  <img
                    src={avatarUrl}
                    alt={user.displayName || user.username}
                    className="w-16 h-16 rounded-full border border-white/20 bg-black/40 object-cover"
                  />
                  <div>
                    <h3 className="font-bold text-white text-base m-0">
                      {user.displayName || user.username}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5">@{user.username}</p>
                    <span
                      className="inline-block mt-1 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase border rounded"
                      style={{
                        borderColor: "rgba(173, 149, 100, 0.4)",
                        color: "var(--casis-gold)",
                        background: "rgba(173, 149, 100, 0.1)",
                      }}
                    >
                      {policeRank}
                    </span>
                  </div>
                </div>

                <div className="profile-list pt-2 border-t border-white/10">
                  <div className="spec-item">
                    <span className="spec-label">GRUP KEPOLISIAN</span>
                    <span className="spec-val">{CONFIG.policeGroupName}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">DISCORD CASIS</span>
                    <span className="spec-val">@{user.discordUsername || "-"}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">STATUS ABSENSI</span>
                    <strong
                      className="spec-val"
                      style={{ color: hasAttended ? "#78c889" : "var(--casis-gold)" }}
                    >
                      {hasAttended ? "✓ TERVERIFIKASI HADIR" : "⚠️ BELUM ABSEN"}
                    </strong>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">SYARAT AKADEMIK</span>
                    <strong
                      className="spec-val"
                      style={{
                        color: attendance?.roleEligible ? "#78c889" : "var(--casis-muted)",
                      }}
                    >
                      {attendance?.roleEligible
                        ? "MEMENUHI PERSYARATAN"
                        : hasAttended
                        ? "DALAM PENINJAUAN"
                        : "MENUNGGU ABSENSI"}
                    </strong>
                  </div>
                </div>

                {/* Tombol Aksi */}
                <div className="mt-6 pt-4 border-t border-white/10 flex flex-col gap-3">
                  {!hasAttended ? (
                    <>
                      <Link
                        href="/absen"
                        className="attendance-submit-btn"
                        style={{ marginTop: 0, textDecoration: "none" }}
                      >
                        Isi Absensi Casis Terlebih Dahulu →
                      </Link>
                      <p className="text-[11px] text-zinc-400 text-center m-0">
                        Absensi kehadiran wajib diverifikasi sebelum Anda dapat memasuki ruang ujian.
                      </p>
                    </>
                  ) : isExamOpen ? (
                    <>
                      <Link
                        href="/ujian?start=1"
                        className="attendance-submit-btn"
                        style={{ marginTop: 0, textDecoration: "none" }}
                      >
                        Mulai Mengerjakan Ujian Sekarang →
                      </Link>
                      <p className="text-[11px] text-zinc-400 text-center m-0">
                        Waktu pengerjaan {CONFIG.examDurationMinutes} menit akan langsung dimulai.
                      </p>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled
                        className="attendance-submit-btn"
                        style={{
                          marginTop: 0,
                          opacity: 0.5,
                          cursor: "not-allowed",
                          background: "#404040",
                        }}
                      >
                        Menunggu Pembukaan Sesi Oleh Instruktur
                      </button>
                      <p className="text-[11px] text-zinc-400 text-center m-0">
                        Sesi ujian akan dibuka oleh instruktur melalui panel kontrol periode.
                      </p>
                    </>
                  )}

                  <Link
                    href="/dashboard"
                    className="attendance-secondary-btn"
                    style={{ textDecoration: "none", textAlign: "center", marginTop: "4px" }}
                  >
                    Kembali ke Dashboard Casis
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ExamPage] server error:", msg);
    return (
      <div className="casis-root">
        <div className="casis-main--dashboard" style={{ padding: "60px 0" }}>
          <div className="student-card" style={{ padding: "32px", maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: "36px", marginBottom: "16px" }}>⚠️</div>
            <h2 style={{ fontFamily: "var(--font-cinzel), serif", fontSize: "24px", color: "var(--casis-gold)", margin: 0 }}>
              Gagal Memuat Jadwal Ujian
            </h2>
            <p style={{ marginTop: "12px", color: "var(--casis-muted)", fontSize: "14px", lineHeight: 1.6 }}>
              Terjadi kendala saat membaca data sesi ujian seleksi. Silakan muat ulang halaman atau kembali ke dashboard.
            </p>
            <p style={{ marginTop: "8px", fontSize: "12px", color: "#efa3a5" }}>{msg}</p>
            <div style={{ marginTop: "24px", display: "flex", gap: "12px", justifyContent: "center" }}>
              <Link href="/ujian" className="attendance-secondary-btn" style={{ textDecoration: "none" }}>
                Muat Ulang
              </Link>
              <Link href="/dashboard" className="attendance-submit-btn" style={{ marginTop: 0, textDecoration: "none" }}>
                Ke Dashboard Casis
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

