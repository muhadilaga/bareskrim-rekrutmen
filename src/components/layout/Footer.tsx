export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-black/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="font-display text-sm tracking-[0.3em] gold-text">
          BARESKRIM POLRIRBX - DIKLAT RESERSE
        </p>
        <p className="text-xs text-zinc-500">[RI] Badan Reserse Kriminal.</p>
        <div className="gold-line w-40" />
        <div className="flex items-center gap-6">
          <img
            src="/logos/logo-header.png"
            alt="Bareskrim Polri"
            width={64}
            height={64}
            loading="lazy"
            className="h-16 w-auto object-contain"
          />
          <img
            src="/logos/logo-footer.png"
            alt="Bareskrim Polri"
            width={64}
            height={64}
            loading="lazy"
            className="h-16 w-auto object-contain"
          />
        </div>
      </div>
    </footer>
  );
}
