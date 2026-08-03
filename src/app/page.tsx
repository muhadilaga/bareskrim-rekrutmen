import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

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

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* HERO */}
      <section className="relative overflow-hidden bg-hero-radial py-20 text-center md:py-28">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/logos/background.png')" }}
        />
        <div aria-hidden className="absolute inset-0 bg-black/75" />
        <div className="relative z-10">
          <div className="mx-auto mb-6 flex items-center justify-center gap-3 animate-fade-in">
            <Badge tone="gold">Sistem Rekrutmen Resmi Badan Reserse Kriminal</Badge>
          </div>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight md:text-6xl animate-slide-up">
            <span className="gold-shine drop-shadow-[0_0_25px_rgba(212,175,55,0.4)]">
              BARESKRIM POLRIRBX
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-zinc-300 md:text-lg animate-slide-up delay-100">
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
              className="w-full rounded-lg border border-white/15 bg-white/5 px-8 py-3.5 text-center font-semibold text-zinc-200 transition hover:border-gold/40 hover:bg-white/10 sm:w-auto"
            >
              Lihat Hasil Anda
            </Link>
          </div>
          <div className="gold-line mx-auto mt-16 w-2/3" />
        </div>
      </section>

      {/* FEATURES */}
      <section className="pb-20">
        <h2 className="mb-8 text-center font-display text-2xl font-bold text-zinc-100 md:text-3xl animate-slide-up">
          Keunggulan <span className="gold-text">Sistem Ini</span>
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Card
              key={f.title}
              className={`stagger-child animate-slide-up p-6 transition hover:border-gold/30 delay-${(i + 1) * 100}`}
            >
              <div className="mb-3 text-3xl">{f.icon}</div>
              <h3 className="font-display text-base font-bold text-gold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
