import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const recruitmentSteps = [
  {
    step: "1",
    title: "Daftar & Login",
    desc: "Masuk dengan akun Roblox dan Discord. Sistem akan memverifikasi data utama secara otomatis.",
  },
  {
    step: "2",
    title: "Absensi",
    desc: "Lakukan absensi untuk mengonfirmasi kehadiran. Role Tahap Akademik dan nickname Discord akan diperbarui otomatis.",
  },
  {
    step: "3",
    title: "Tunggu Jadwal Ujian",
    desc: "Instruktur akan mengumumkan jadwal sesi ujian melalui Discord pusdik. Pantau pengumuman agar tidak tertinggal.",
  },
  {
    step: "4",
    title: "Kerjakan Ujian",
    desc: "Kerjakan soal sesuai jadwal. Hasil dan laporan akhir akan diproses otomatis oleh sistem.",
  },
];

const galleryImages = [
  "/galeri-bareskrim/PROPAGANDA_RESMOB.png",
  "/galeri-bareskrim/PROPAGANDA_JATANRAS.png",
  "/galeri-bareskrim/1.png",
  "/galeri-bareskrim/2.png",
  "/galeri-bareskrim/3.png",
  "/galeri-bareskrim/4.png",
  "/galeri-bareskrim/5.png",
  "/galeri-bareskrim/6.png",
  "/galeri-bareskrim/7.png",
  "/galeri-bareskrim/8.png",
  "/galeri-bareskrim/9.png",
  "/galeri-bareskrim/10.png",
  "/galeri-bareskrim/11.png",
  "/galeri-bareskrim/12.jpg",
];

const historyCaption = `Sejarah Singkat Pendirian Bareskrim Polri Roblox
Bareskrim Polri Roblox [RI] secara resmi didirikan pada tanggal 23 November 2023. Pendirian Bareskrim merupakan respon terhadap meningkatnya kompleksitas dan intensitas kejahatan di Republik Indonesia Roblox, terutama kejahatan-kejahatan yang bersifat terorganisir, tradisional, dan berat. Munculnya berbagai tantangan keamanan memerlukan lembaga khusus yang dapat fokus pada penanganan kasus-kasus kriminal berat seperti kejahatan dan kekerasan, korupsi, pembunuhan, dan lainnya.`;

function StarBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-hero-radial" />
      <div className="absolute inset-0 bg-crimson-950/75 dark:bg-crimson-950/75" />
      <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-gold/10" />
      <div className="absolute inset-0 chequered opacity-30" />
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(rgba(212, 175, 55, 0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(212, 175, 55, 0.15) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />
      {[...Array(80)].map((_, i) => (
        <div
          key={"s-" + i}
          className="absolute rounded-full dark:bg-gold/30 bg-crimson-400/20"
          style={{
            top: `${(i * 7 + 3) % 100}%`,
            left: `${(i * 13 + 7) % 100}%`,
            width: `${0.5 + (i % 3) * 0.5}px`,
            height: `${0.5 + (i % 3) * 0.5}px`,
            animation: `twinkle ${2 + (i % 4)}s infinite ease-in-out`,
            animationDelay: `${-(i % 5)}s`,
            opacity: 0.1 + (i % 3) * 0.1,
          }}
        />
      ))}
      <div className="absolute bottom-10 right-10 hidden sm:block">
        <div className="relative h-24 w-24">
          <div className="absolute inset-0 rounded-full bg-gold/20 blur-md filter animate-pulse" style={{ animationDuration: "3s" }} />
          <div className="absolute inset-1 rounded-full bg-gold/30 blur filter animate-bounce" style={{ animationDuration: "4s" }} />
          <div className="absolute inset-3 rounded-full bg-amber-300/20 blur-2xl filter animate-pulse" style={{ animationDuration: "5s" }} />
        </div>
      </div>
      <div className="absolute left-10 top-10 hidden sm:block">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-full bg-gold/15 blur-md filter animate-pulse" style={{ animationDuration: "4s" }} />
          <div className="absolute inset-1 rounded-full bg-gold/25 blur filter animate-bounce" style={{ animationDuration: "6s" }} />
        </div>
      </div>
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-gradient-to-br from-crimson-800/20 via-gold/10 to-transparent blur-3xl filter animate-pulse" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-gradient-to-tl from-crimson-800/15 via-gold/8 to-transparent blur-3xl filter animate-pulse" style={{ animationDuration: "8s" }} />
    </div>
  );
}

function HomePageSkeleton() {
  return (
    <div className="relative mx-auto max-w-6xl px-4 pt-20">
      <div className="mb-6 rounded-lg border border-gold/20 bg-gold/5 px-4 py-3 text-center text-sm text-zinc-500 dark:text-zinc-300">
        Memuat periode aktif dan status rekrutmen...
      </div>
      <section className="relative overflow-hidden py-20 text-center md:py-28">
        <div className="absolute inset-0 bg-no-repeat" style={{ backgroundImage: "url('/logos/background.png')", backgroundPosition: "center 70%", backgroundSize: "cover", opacity: 0.3 }} />
        <div className="absolute inset-0 bg-rose-50/30 dark:hidden" />
        <div className="absolute inset-0 dark:bg-crimson-950/70" />
        <div className="absolute inset-0 chequered opacity-20 dark:opacity-30" />
        <div className="absolute left-0 top-1/2 h-2/3 w-40 -translate-y-1/2 rounded-full bg-gradient-to-r from-gold/8 via-gold/4 to-transparent blur-3xl" />
        <div className="absolute right-0 top-1/2 h-2/3 w-40 -translate-y-1/2 rounded-full bg-gradient-to-l from-transparent via-gold/4 to-gold/8 blur-3xl" />
        <StarBackground />
        <div className="relative z-10 space-y-4">
          <Skeleton className="mx-auto h-4 w-64 rounded" />
          <Skeleton className="mx-auto h-12 w-96 rounded" />
          <Skeleton className="mx-auto h-4 w-80 rounded" />
          <div className="mt-10 flex justify-center gap-4">
            <Skeleton className="h-12 w-48 rounded-lg" />
            <Skeleton className="h-12 w-48 rounded-lg" />
          </div>
        </div>
      </section>
      <section className="pb-20">
        <Skeleton className="mx-auto mb-8 h-8 w-48 rounded" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="mt-3 h-5 w-32 rounded" />
              <Skeleton className="mt-2 h-4 w-full rounded" />
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function HomePage() {
  const user = await getSessionUser();
  const activePeriod = await prisma.examPeriod
    .findFirst({ where: { isActive: true } })
    .catch(() => null);

  let hasActiveAttempt = false;
  if (user && activePeriod) {
    const attempt = await prisma.examAttempt.findFirst({
      where: {
        periodId: activePeriod.id,
        userId: user.id,
        submittedAt: null,
      },
    });
    hasActiveAttempt = !!attempt;
  }
  const closedRecently = await prisma.examPeriod
    .findFirst({
      where: { isActive: false, closedAt: { not: null } },
      orderBy: { closedAt: "desc" },
    })
    .catch(() => null);

  if (!activePeriod && !closedRecently) {
    return (
      <div className="relative mx-auto max-w-6xl px-4 pt-20">
        <section className="relative overflow-hidden py-20 text-center md:py-28">
          <StarBackground />
          <div className="relative z-10">
            <div className="mx-auto mb-6 flex items-center justify-center gap-3">
              <Badge tone="gold">Status Sistem Rekrutmen</Badge>
            </div>
            <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight text-zinc-900 dark:text-zinc-100 md:text-6xl">
              <span className="dark:gold-shine gold-shine-light">BARESKRIM POLRIRBX</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-zinc-600 dark:text-zinc-300 md:text-lg">
              Sistem aktif, tetapi belum ada periode rekrutmen yang dibuka saat ini.
            </p>
          </div>
        </section>
        <section className="pb-20">
          <Card className="mx-auto max-w-3xl p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-3xl">📭</div>
            <h2 className="font-display text-2xl font-bold text-zinc-700 dark:text-zinc-100">Belum Ada Periode Aktif</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              Pantau pengumuman Discord pusdik untuk jadwal periode berikutnya. Saat periode dibuka, tombol absen dan ujian akan muncul otomatis di halaman ini.
            </p>
          </Card>
        </section>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-6xl px-4 pt-20">
      {/* HERO */}
      <section className="relative overflow-hidden py-20 text-center md:py-28">
        {/* Background PNG - ditengah, lebih gelap di light mode */}
        <div
          className="absolute inset-0 bg-no-repeat"
          style={{
            backgroundImage: "url('/logos/background.png')",
            backgroundPosition: "center 70%",
            backgroundSize: "cover",
            opacity: 0.3,
          }}
        />
        {/* Filter merah muda di light mode untuk menambah kontras PNG */}
        <div className="absolute inset-0 bg-rose-50/30 dark:hidden" />
        {/* Overlay merah gelap di dark mode */}
        <div className="absolute inset-0 dark:bg-crimson-950/70" />
        {/* Pola chequered merah emas */}
        <div className="absolute inset-0 chequered opacity-20 dark:opacity-30" />
        
        {/* Efek cahaya radial emas di kedua sisi */}
        <div className="absolute left-0 top-1/2 h-2/3 w-40 -translate-y-1/2 rounded-full bg-gradient-to-r from-gold/8 via-gold/4 to-transparent dark:from-gold/10 dark:via-gold/5 dark:to-transparent blur-3xl" />
        <div className="absolute right-0 top-1/2 h-2/3 w-40 -translate-y-1/2 rounded-full bg-gradient-to-l from-transparent via-gold/4 to-gold/8 dark:from-transparent dark:via-gold/5 dark:to-gold/10 blur-3xl" />
        
        {/* Bintang kecil di area kosong */}
        {[...Array(20)].map((_, i) => (
          <div
            key={"h-" + i}
            className="absolute rounded-full dark:bg-gold/20 bg-crimson-400/30"
            style={{
              top: `${10 + Math.random() * 80}%`,
              left: `${Math.random() * 15}%`,
              width: `${1 + Math.random() * 2}px`,
              height: `${1 + Math.random() * 2}px`,
              animation: `twinkle ${2 + Math.random() * 3}s infinite ease-in-out`,
              animationDelay: `${-Math.random() * 5}s`,
            }}
          />
        ))}
        {[...Array(20)].map((_, i) => (
          <div
            key={"r-" + i}
            className="absolute rounded-full dark:bg-gold/20 bg-crimson-400/30"
            style={{
              top: `${10 + Math.random() * 80}%`,
              right: `${Math.random() * 15}%`,
            width: `${1 + Math.random() * 2}px`,
            height: `${1 + Math.random() * 2}px`,
            animation: `twinkle ${2 + Math.random() * 3}s infinite ease-in-out`,
            animationDelay: `${-Math.random() * 5}s`,
          }}
        />
      ))}
        
        <StarBackground />
        <div className="relative z-10 mx-auto max-w-4xl px-1">
          <h1 className="mx-auto max-w-3xl font-display text-3xl font-bold leading-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl md:text-6xl animate-slide-up">
            <span className="dark:gold-shine gold-shine-light drop-shadow-[0_0_25px_rgba(212,175,55,0.4)]">
              BARESKRIM POLRIRBX
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300 sm:text-base md:text-lg animate-slide-up delay-100">
            Selamat datang di web rekrutmen calon Reserse Muda. Tunjukkan bahwa kamu siap menjadi anggota
            Bareskrim Polri yang profesional, tangguh, dan berintegritas.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center animate-slide-up delay-200">
            {activePeriod && activePeriod.isAttendanceOpen ? (
              <Link
                href="/absen"
                className="w-full rounded-lg border border-gold/40 bg-gradient-to-r from-gold-300 via-gold to-gold-600 px-6 py-3.5 text-center font-semibold text-crimson-950 shadow-glow transition hover:brightness-110 sm:w-auto sm:min-w-[220px]"
              >
                Mulai Absensi
              </Link>
            ) : (
              <span className="w-full cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-6 py-3.5 text-center text-sm font-semibold text-zinc-500 sm:w-auto sm:min-w-[220px]">
                Absensi Ditutup
              </span>
            )}

            {activePeriod && (activePeriod.isExamOpen || hasActiveAttempt) ? (
              <Link
                href="/ujian"
                className="w-full rounded-lg border border-emerald-500/40 bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 px-6 py-3.5 text-center font-semibold text-white shadow-lg transition hover:brightness-110 sm:w-auto sm:min-w-[220px]"
              >
                {hasActiveAttempt ? "Lanjutkan Ujian" : "Mulai Ujian"}
              </Link>
            ) : (
              <span className="w-full cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-6 py-3.5 text-center text-sm font-semibold text-zinc-500 sm:w-auto sm:min-w-[220px]">
                Ujian Belum Dibuka
              </span>
            )}
          </div>
          <div className="gold-line mx-auto mt-12 w-full max-w-xl" />
        </div>
      </section>

      {/* PENGUMUMAN PERIODE */}
      {activePeriod && (
        <section className="pb-20">
          <div className="rounded-xl border border-gold/30 bg-gradient-to-r from-gold/15 via-gold/5 to-transparent p-6 animate-fade-in">
            <div className="flex items-center justify-center gap-3">
              <span className="font-display text-base font-bold text-gold">
                {activePeriod.name}
              </span>
              <Badge tone="green">Periode Aktif</Badge>
            </div>
          </div>
        </section>
      )}

      {/* PENGUMUMAN PERIODE DITUTUP */}
      {!activePeriod && closedRecently && (
        <section className="pb-20">
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 animate-fade-in">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-2xl">
                  🔒
                </div>
                <div>
                  <span className="font-display text-base font-bold text-zinc-700 dark:text-zinc-100">
                    {closedRecently.name} telah ditutup
                  </span>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Periode rekrutmen saat ini belum dibuka. Pantau server Discord pusdik untuk
                    pengumuman periode berikutnya.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ALUR REKRUTMEN */}
      <section className="pb-16 sm:pb-20">
        <h2 className="mb-4 text-center font-display text-2xl font-bold text-zinc-700 dark:text-zinc-100 md:text-3xl animate-slide-up">
          Alur <span className="gold-text">Rekrutmen</span>
        </h2>
        <p className="mx-auto mb-8 max-w-2xl text-center text-sm leading-7 text-zinc-500 dark:text-zinc-400">
          Alur dibuat singkat supaya mudah diikuti. Ikuti tahapannya secara berurutan.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {recruitmentSteps.map((step, index) => (
            <Card key={step.step} className={`animate-slide-up p-5 sm:p-6 delay-${(index + 1) * 100}`}>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-gold/50 bg-crimson-900 text-gold font-display text-lg font-bold shadow-lg shadow-gold/10 dark:bg-crimson-950">
                  {step.step}
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-zinc-700 dark:text-gold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-zinc-500 dark:text-zinc-400">{step.desc}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* GALERI BARESKRIM */}
      <section className="pb-20">
        <div className="mb-8 text-center">
          <h2 className="mb-4 font-display text-2xl font-bold text-zinc-700 dark:text-zinc-100 md:text-3xl animate-slide-up">
            Galeri <span className="gold-text">Bareskrim</span>
          </h2>
          <p className="mx-auto max-w-3xl whitespace-pre-line text-sm leading-7 text-zinc-500 dark:text-zinc-400">
            {historyCaption}
          </p>
        </div>

        <div className="grid auto-rows-[170px] gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {galleryImages.map((src, i) => {
            const featured = i < 2;
            return (
              <div
                key={src}
                className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-lg animate-slide-up ${featured ? "sm:col-span-1 sm:row-span-2 lg:col-span-1" : ""}`}
              >
                <img
                  src={src}
                  alt={`Galeri Bareskrim ${i + 1}`}
                  className={`h-full w-full transition duration-500 group-hover:scale-[1.03] group-hover:brightness-110 ${featured ? "object-contain bg-black/70 p-2" : "object-cover"}`}
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-80" />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
