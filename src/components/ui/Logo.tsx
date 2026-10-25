export function Logo({ size = 44 }: { size?: number }) {
  return (
    <img
      src="/design-assets/logo-pusdik.png"
      alt="Bareskrim Polri"
      width={size}
      height={size}
      fetchPriority="high"
      style={{ height: size, width: "auto" }}
      className="object-contain"
    />
  );
}
