export function Logo({ size = 44 }: { size?: number }) {
  return (
    <img
      src="/logos/logo-header.png"
      alt="Bareskrim Polri"
      width={size}
      height={size}
      fetchPriority="high"
      style={{ height: size, width: "auto" }}
      className="object-contain drop-shadow-[0_0_12px_rgba(212,175,55,0.4)]"
    />
  );
}
