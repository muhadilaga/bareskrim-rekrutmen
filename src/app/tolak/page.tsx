import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { REDIRECT_BLOCKED_MESSAGE } from "@/lib/constants";
import Link from "next/link";

export const metadata = { title: "Akses Ditolak - Rekrutmen Bareskrim PolriRbx [RI]" };

export default function TolakPage() {
  return (
    <div className="flex min-h-[75vh] items-center justify-center px-4 py-16">
      <Card strong className="w-full max-w-lg overflow-hidden">
        <div className="chequered border-b-2 border-crimson bg-gradient-to-br from-red-900/50 to-crimson-950/60 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500/60 bg-red-500/15 text-3xl">
            ⛔
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-red-300">
            AKSES UJIAN DITOLAK
          </h1>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm leading-relaxed text-zinc-300">{REDIRECT_BLOCKED_MESSAGE}</p>
          <div className="gold-line mx-auto my-6 w-32" />
          <p className="text-xs text-zinc-500">
            Sistem cross-group check mendeteksi keanggotaan Anda pada matra lain (TNI AD / TNI AL).
            Jika menurut Anda ini sebuah kesalahan, hubungi instruktur di server Discord.
          </p>
          <Link href="/" className="mt-6 inline-block">
            <Button variant="ghost">Kembali ke Beranda</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
