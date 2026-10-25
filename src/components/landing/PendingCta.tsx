// Penanda CTA yang backend/ruutenya belum tersedia (pendaftaran, galeri).
// Tampilan mengikuti class desain asli; tidak menavigasi ke mana pun.
export function PendingCta({
  label,
  variant = "btn-primary",
  note = "Fitur ini akan tersedia pada tahap integrasi berikutnya.",
}: {
  label: string;
  variant?: "btn-primary" | "btn-text" | "register-button";
  note?: string;
}) {
  const className = variant === "register-button" ? "register-button" : `btn ${variant}`;
  return (
    <span className={className} role="link" aria-disabled="true" title={note}>
      {label}
      <span>→</span>
    </span>
  );
}
