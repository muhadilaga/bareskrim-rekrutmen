export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatDateTime(d: Date | string): string {
  const date = new Date(d);
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

/** Detect Next.js redirect errors so try-catch blocks can re-throw them. */
export function isNextRedirectError(e: unknown): e is Error & { digest: string } {
  if (!(e instanceof Error)) return false;
  const d = (e as unknown as { digest?: unknown }).digest;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT");
}
