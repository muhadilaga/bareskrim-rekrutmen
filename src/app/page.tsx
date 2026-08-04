// TEST CHANGE: Navbar updated successfully

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: "🛡️",
    title: "Verifikasi Roblox Otomatis",
    desc: "Foto avatar, keanggotaan grup wajib [RI], dan pangkat grup Kepolisian diambil langsung dari Roblox API.",
  },
  {
    icon: "⛔",
    title: "Anti Matra Lain",
    desc: "Peserta yang terdaftar di grup matra lain (TNI AD/AL) otomatis ditolak mengakses soal ujian.",
  },
  {
    icon: "📣",
    title: "Laporan Discord Real-Time",
    desc: "Begitu submit, laporan lengkap + rekap jawaban dikirim otomatis ke channel pusdik instruktur.",
  },
  {
    icon: "🔒",
    title: "1x Percobaan",
    desc: "Setiap casis hanya dapat mengisi 1x per periode. Percobaan ganda akan menampilkan hasil lama.",
  },
];

function StarBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-hero-radial" />
      {/* Dark mode: overlay merah gelap | Light mode: overlay emas muda */}
      <div className="absolute inset-0 bg-crimson-950/75 dark:bg-crimson-950/75" />
      <div className="absolute inset-0 bg-gradient-to-br from-gold/5 via-transparent to-gold/10" />
      
      {/* Pola chequered merah emas halus */}
      <div className="absolute inset-0 chequered opacity-30" />
      
      {/* Grid pattern tipis merah emas */}
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
      
      {/* Bintang animasi - emas di dark, merah di light */}
      {[...Array(80)].map((_, i) => (
        <div
          key={"s-" + i}
          className="absolute rounded-full dark:bg-gold/30 bg-crimson-400/20"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            width: `${0.5 + Math.random() * 1.5}px`,
            height: `${0.5 + Math.random() * 1.5}px`,
            animation: `twinkle ${2 + Math.random() * 3}s infinite ease-in-out`,
            animationDelay: `${-Math.random() * 5}s`,
            opacity: 0.1 + Math.random() * 0.3,
          }}
        />
      ))}
      
      {/* Api emas di pojok kanan bawah */}
      <div className="absolute bottom-10 right-10 hidden sm:block">
        <div className="relative h-24 w-24">
          <div className="absolute inset-0 rounded-full bg-gold/20 blur-md filter animate-pulse" style={{ animationDuration: "3s" }} />
          <div className="absolute inset-1 rounded-full bg-gold/30 blur filter animate-bounce" style={{ animationDuration: "4s" }} />
          <div className="absolute inset-3 rounded-full bg-amber-300/20 blur-2xl filter animate-pulse" style={{ animationDuration: "5s" }} />
        </div>
      </div>
      
      {/* Api emas di pojok kiri atas */}
      <div className="absolute left-10 top-10 hidden sm:block">
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-full bg-gold/15 blur-md filter animate-pulse" style={{ animationDuration: "4s" }} />
          <div className="absolute inset-1 rounded-full bg-gold/25 blur filter animate-bounce" style={{ animationDuration: "6s" }} />
        </div>
      </div>
      
      {/* Efek cahaya tembiralang (merah ke emas) */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-gradient-to-br from-crimson-800/20 via-gold/10 to-transparent blur-3xl filter animate-pulse" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-gradient-to-tl from-crimson-800/15 via-gold/8 to-transparent blur-3xl filter animate-pulse" style={{ animationDuration: "8s" }} />
    </div>
  );
}

export default async function HomePage() {
  const activePeriod = await prisma.examPeriod
    .findFirst({ where: { isActive: true } })
    .catch(() => null);
  const closedRecently = await prisma.examPeriod
    .findFirst({
      where: { isActive: false, closedAt: { not: null } },
      orderBy: { closedAt: "desc" },
    })
    .catch(() => null);

  return (
    <div className="relative mx-auto max-w-6xl px-4 pt-16">
      {/* HERO */}
      <section className="relative overflow-hidden py-20 text-center md:py-28">
        {/* Background PNG - ditengah, lebih gelap di light mode */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/logos/background.png')",
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
        <div className="relative z-10">
          <div className="mx-auto mb-6 flex items-center justify-center gap-3 animate-fade-in">
            <Badge tone="gold">Sistem Rekrutmen Resmi Badan Reserse Kriminal</Badge>
          </div>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight text-zinc-900 dark:text-zinc-100 md:text-6xl animate-slide-up">
            <span className="dark:gold-shine gold-shine-light drop-shadow-[0_0_25px_rgba(212,175,55,0.4)]">
              BARESKRIM POLRIRBX
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-zinc-600 dark:text-zinc-300 md:text-lg animate-slide-up delay-100">
            Selamat Datang di WEB REKRUTMEN Para Calon Reserse Muda, Tunjukan bahwa kamu calon anggota
            Bareskrim Polri yang Profesional, Tangguh, dan Berintegritas!
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row animate-slide-up delay-200">
            <Link
              href="/login"
              className="w-full rounded-lg border border-gold/40 bg-gradient-to-r from-gold-300 via-gold to-gold-600 px-8 py-3.5 text-center font-semibold text-crimson-950 shadow-glow transition hover:brightness-110 sm:w-auto"
            >
              Daftar & Ikuti Ujian
            </Link>
            <Link
              href="/hasil"
              className="w-full rounded-lg border border-gold/40 bg-transparent px-8 py-3.5 text-center font-semibold text-zinc-700 dark:text-zinc-200 transition hover:border-gold/60 hover:bg-white/10 sm:w-auto"
            >
              Lihat Hasil Anda
            </Link>
          </div>
          <div className="gold-line mx-auto mt-16 w-2/3" />
        </div>
      </section>

      {/* PENGUMUMAN PERIODE */}
      {activePeriod && (
        <section className="pb-20">
          <div className="rounded-xl border border-gold/30 bg-gradient-to-r from-gold/15 via-gold/5 to-transparent p-6 animate-fade-in">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/20 text-2xl">
                  🕐
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold text-gold">
                      {activePeriod.name}
                    </span>
                    <Badge tone="green">Periode Aktif</Badge>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {activePeriod.description ?? "Pendaftaran ujian Tahap Akademik sedang dibuka."}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Dibuka{" "}
                    {new Date(activePeriod.openedAt).toLocaleString("id-ID", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}{" "}
                    · Absensi wajib sebelum mengikuti ujian.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Link
                  href="/absen"
                  className="rounded-lg border border-gold/40 bg-gradient-to-r from-gold-300 via-gold to-gold-600 px-5 py-2.5 text-center text-sm font-semibold text-crimson-950 transition hover:brightness-110"
                >
                  Absen Sekarang
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg border border-gold/40 bg-transparent px-5 py-2.5 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-200 transition hover:border-gold/60 hover:bg-white/10"
                >
                  Ikuti Ujian
                </Link>
              </div>
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
              <Link
                href="/hasil"
                className="shrink-0 rounded-lg border border-gold/40 bg-transparent px-5 py-2.5 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-200 transition hover:border-gold/60 hover:bg-white/10"
              >
                Lihat Hasil Anda
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* FEATURES */}
      <section className="pb-20">
        <h2 className="mb-8 text-center font-display text-2xl font-bold text-zinc-700 dark:text-zinc-100 md:text-3xl animate-slide-up">
          Keunggulan <span className="gold-text">Sistem Ini</span>
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Card
              key={f.title}
              className={`group stagger-child animate-slide-up p-6 transition-all duration-300 delay-${(i + 1) * 100}`}
            >
              <div className="mb-3 text-3xl">{f.icon}</div>
              <h3 className="font-display text-base font-bold text-zinc-700 dark:text-gold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">{f.desc}</p>
              <div className="mt-3 h-1 w-0 bg-gradient-to-r from-gold via-amber-300 to-gold opacity-0 blur-sm transition-all duration-300 group-hover:mt-2 group-hover:w-2/3 group-hover:opacity-100" />
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
