import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const links = [
  { href: "/", label: "Beranda" },
  { href: "/login", label: "Daftar Ujian" },
  { href: "/hasil", label: "Hasil" },
  { href: "/admin", label: "Admin" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 glass-strong border-b border-gold/20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-crimson-800/60 hover:text-gold"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/login"
          className="rounded-md border border-gold/40 bg-gradient-to-r from-crimson-800 to-crimson px-4 py-2 text-sm font-semibold text-gold shadow-glow transition hover:from-crimson hover:to-crimson-700"
        >
          Mulai Ujian
        </Link>
      </div>
    </header>
  );
}
