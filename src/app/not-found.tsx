import Link from "next/link";

export const metadata = { title: "404 - Halaman Tidak Ditemukan" };

export default function NotFound() {
  return (
    <div className="bg-hero-radial flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="animate-scale-in">
        <div className="text-6xl font-bold gold-text">404</div>
        <h1 className="mt-4 font-display text-xl font-bold text-zinc-100">Halaman Tidak Ditemukan</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Halaman yang kamu cari tidak ada atau sudah dipindahkan.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg border border-gold/40 bg-gradient-to-r from-gold-300 via-gold to-gold-600 px-6 py-2.5 text-sm font-semibold text-crimson-950 transition hover:brightness-110"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  );
}
