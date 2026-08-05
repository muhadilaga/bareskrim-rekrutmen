import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-black/30">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col items-center gap-8 md:flex-row md:justify-between">
          {/* Logo & Brand */}
          <div className="flex flex-col items-center gap-3 md:items-start">
            <div className="flex items-center gap-3">
              <img
                src="/logos/logo-header.png"
                alt="Bareskrim Polri"
                width={48}
                height={48}
                loading="lazy"
                className="h-12 w-auto object-contain"
              />
              <div>
                <p className="font-display text-sm font-bold tracking-wider gold-text">
                  BARESKRIM POLRIRBX
                </p>
                <p className="text-[10px] text-zinc-500">DIKLAT RESERSE</p>
              </div>
            </div>
            <p className="text-xs text-zinc-500">[RI] Badan Reserse Kriminal</p>
            {/* Social Media */}
            <div className="flex items-start gap-4 mt-1">
              <div className="flex flex-col items-center gap-1">
                <a
                  href="https://www.tiktok.com/@bareskrim.polri.roblox?_r=1&_t=ZS-98b4Dm1WNl2"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok Bareskrim"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:border-gold/40 hover:bg-gold/10 hover:text-gold"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.51a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 10.86 4.48v-7.13a8.16 8.16 0 0 0 5.58 2.18V11.2a4.85 4.85 0 0 1-5.58-2.78V6.69h5.58z" />
                  </svg>
                </a>
                <span className="text-[10px] text-zinc-500 text-center leading-tight">Bareskrim<br/>PolriRbx</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <a
                  href="https://www.tiktok.com/@diklatreserserbx?_r=1&_t=ZS-98b4h67A3G4"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok Diklat Reserse"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400 transition hover:border-gold/40 hover:bg-gold/10 hover:text-gold"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.51a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 10.86 4.48v-7.13a8.16 8.16 0 0 0 5.58 2.18V11.2a4.85 4.85 0 0 1-5.58-2.78V6.69h5.58z" />
                  </svg>
                </a>
                <span className="text-[10px] text-zinc-500 text-center leading-tight">Diklat<br/>Reserse</span>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="flex gap-8 text-sm">
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-zinc-300">Menu</p>
              <Link href="/" className="text-zinc-500 transition hover:text-gold">Beranda</Link>
              <Link href="/absen" className="text-zinc-500 transition hover:text-gold">Absensi</Link>
              <Link href="/hasil" className="text-zinc-500 transition hover:text-gold">Lihat Hasil</Link>
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-zinc-300">Informasi</p>
              <Link href="/admin" className="text-zinc-500 transition hover:text-gold">Panel Admin</Link>
              <a href="https://discord.gg/29vj9akD2" target="_blank" rel="noopener noreferrer" className="text-zinc-500 transition hover:text-gold">Discord Pusdik</a>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="gold-line mt-8" />
        <div className="mt-6 flex flex-col items-center justify-between gap-2 text-xs text-zinc-600 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Bareskrim Polri RBX. All rights reserved.</p>
          <p>Designed & Developed by <span className="font-semibold gold-text">4DIBERL4G4</span></p>
        </div>
      </div>
    </footer>
  );
}
