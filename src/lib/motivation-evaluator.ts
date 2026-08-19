const LOW_SIGNAL_EXACT = new Set([
  "-",
  ".",
  "ok",
  "siap",
  "gas",
  "test",
  "tes",
  "gatau",
  "ga tau",
  "nggak tahu",
  "tidak tahu",
]);

export type MotivationResult = {
  status: "APPROVED" | "REVIEW" | "REJECTED";
  reason: string;
  eligible: boolean;
};

function normalize(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

export function evaluateMotivation(input: string): MotivationResult {
  const text = normalize(input);
  const lower = text.toLowerCase();
  const words = lower.split(" ").filter(Boolean);
  const hasPositiveSignal = ["bareskrim", "polri", "melayani", "belajar", "disiplin", "mengabdi", "integritas", "reserse", "pengalaman", "siap"].some((token) => lower.includes(token));

  if (text.length < 20 || words.length < 4 || LOW_SIGNAL_EXACT.has(lower)) {
    return {
      status: "REJECTED",
      reason: "Alasan terlalu singkat atau belum menunjukkan motivasi yang jelas.",
      eligible: false,
    };
  }

  if (text.length < 45 || words.length < 8 || !hasPositiveSignal) {
    return {
      status: "REVIEW",
      reason: "Alasan tersimpan, tetapi masih perlu ditinjau admin sebelum role diberikan.",
      eligible: false,
    };
  }

  return {
    status: "APPROVED",
    reason: "Motivasi cukup jelas dan lolos pemeriksaan awal sistem.",
    eligible: true,
  };
}
