import Link from "next/link";
import { AdminPanel } from "@/components/admin/AdminPanel";

export const metadata = { title: "Admin - Rekrutmen Bareskrim Polri RP" };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-gold">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Kembali ke Beranda
      </Link>
      <div className="mb-8 text-center animate-slide-up">
        <h1 className="font-display text-2xl font-bold gold-text md:text-3xl">
          PANEL ADMINISTRATOR
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Kelola periode rekrutmen & bank soal. Lindungi halaman ini.
        </p>
      </div>
      <AdminPanel />
    </div>
  );
}
