import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-[rgba(255,255,255,0.08)] bg-[#060708] text-[var(--muted,#a1a1aa)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          {/* Logo & Brand */}
          <div className="flex flex-col items-center gap-3 text-center md:items-start md:text-left">
            <div className="flex items-center gap-3">
              <img
                src="/design-assets/logo-pusdik.png"
                alt="Bareskrim Polri"
                width={44}
                height={44}
                loading="lazy"
                className="h-11 w-auto object-contain"
              />
              <div>
                <p className="font-display text-sm font-bold tracking-wider text-[var(--text,#e4e4e7)]">
                  BARESKRIM POLRI RBX
                </p>
                <p className="text-[11px] font-semibold tracking-wider text-[#d4af37]">
                  PUSDIK RESERSE
                </p>
              </div>
            </div>
            <p className="text-xs text-[var(--muted,#71717a)]">
              Pusat Pendidikan Reserse Kriminal · Disiplin, Integritas, Profesional
            </p>

            {/* Social Media */}
            <div className="mt-3 flex items-center justify-center gap-3 md:justify-start">
              <a
                href="https://www.tiktok.com/@bareskrim.polri.roblox?_r=1&_t=ZS-98b4Dm1WNl2"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok Bareskrim Polri"
                className="group flex items-center gap-2 rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1.5 text-xs text-[var(--muted,#a1a1aa)] transition hover:border-[#d4af37]/40 hover:bg-[#d4af37]/10 hover:text-[#d4af37]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                </svg>
                <span className="font-mono text-[10px] uppercase tracking-wide">@bareskrim</span>
              </a>

              <a
                href="https://www.tiktok.com/@diklatreserserbx?_r=1&_t=ZS-98b4h67A3G4"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok Diklat Reserse"
                className="group flex items-center gap-2 rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1.5 text-xs text-[var(--muted,#a1a1aa)] transition hover:border-[#d4af37]/40 hover:bg-[#d4af37]/10 hover:text-[#d4af37]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                </svg>
                <span className="font-mono text-[10px] uppercase tracking-wide">@diklatreserse</span>
              </a>
            </div>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-8 text-xs sm:grid-cols-3 sm:gap-10">
            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
                Navigasi
              </p>
              <Link href="/" className="transition hover:text-[var(--text,#fff)]">
                Beranda
              </Link>
              <Link href="/rekrutmen" className="transition hover:text-[var(--text,#fff)]">
                Rekrutmen
              </Link>
              <Link href="/galeri" className="transition hover:text-[var(--text,#fff)]">
                Galeri
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
                Siswa
              </p>
              <Link href="/absen" className="transition hover:text-[var(--text,#fff)]">
                Absensi
              </Link>
              <Link href="/ujian" className="transition hover:text-[var(--text,#fff)]">
                Ruang Ujian
              </Link>
              <Link href="/hasil" className="transition hover:text-[var(--text,#fff)]">
                Pengumuman
              </Link>
            </div>

            <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
                Komunitas
              </p>
              <a
                href="https://discord.gg/29vj9akD2"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-[var(--text,#fff)]"
              >
                Discord Pusdik
              </a>
              <span className="text-[11px] text-[var(--muted,#71717a)]">
                Server resmi diklat & instruktur
              </span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-8 border-t border-[rgba(255,255,255,0.06)] pt-6">
          <div className="flex flex-col items-center justify-between gap-3 text-center text-xs text-[var(--muted,#71717a)] sm:flex-row sm:text-left">
            <p>&copy; {new Date().getFullYear()} Bareskrim Polri RBX · Pusdik Reserse. Hak Cipta Dilindungi.</p>
            <p className="font-mono text-[10px] tracking-wider uppercase text-[var(--muted,#71717a)]">
              Portal Seleksi & Ujian Resmi
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
