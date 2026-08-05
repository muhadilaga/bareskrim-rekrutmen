// ============================================================
// Rate Limiter ringan berbasis in-memory (sliding window).
// CATATAN: state per instance runtime. Pada deployment serverless
// multi-instance, ini bersifat "best effort" (lebih baik daripada
// tidak ada). Untuk jaminan ketat di skala besar, ganti dengan
// penyimpanan bersama (mis. Upstash Redis) - lihat README.
// ============================================================

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export function createRateLimiter(options: { windowMs: number; max: number }) {
  const { windowMs, max } = options;
  const hits = new Map<string, number[]>();
  const MAX_TRACKED_KEYS = 10_000;

  function check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;

    // Pembersihan malas agar map tidak membesar tak terkendali
    if (hits.size > MAX_TRACKED_KEYS) {
      for (const [k, arr] of hits) {
        const active = arr.filter((t) => t > cutoff);
        if (active.length === 0) hits.delete(k);
        else hits.set(k, active);
      }
    }

    const arr = (hits.get(key) ?? []).filter((t) => t > cutoff);

    if (arr.length >= max) {
      hits.set(key, arr);
      const retryAfterMs = Math.max(1, windowMs - (now - arr[0]));
      return { ok: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }

    arr.push(now);
    hits.set(key, arr);
    return { ok: true, retryAfterSeconds: 0 };
  }

  return { check };
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",");
    const clientIp = ips[ips.length - 1]?.trim();
    if (clientIp && /^[\d.:a-fA-F]+$/.test(clientIp)) {
      return clientIp;
    }
  }
  return req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

// 10 permintaan verifikasi per menit per IP
export const verifyLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

// 5 login per menit per IP
export const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

// 3 submit per menit per IP (batch jawaban besar, jarang)
export const submitLimiter = createRateLimiter({ windowMs: 60_000, max: 3 });

// 6 auto-save per menit per IP (throttle client 15s, tapi server batasi lebih ketat)
export const saveLimiter = createRateLimiter({ windowMs: 60_000, max: 6 });

// Rate limiter per-user (berdasarkan userId, bukan IP).
// Berguna untuk endpoint yang sudah punya user terautentikasi.
export function createUserRateLimiter(options: { windowMs: number; max: number }) {
  return createRateLimiter(options);
}

// 5 submit per menit per user (berbeda dari IP-based submitLimiter)
export const userSubmitLimiter = createUserRateLimiter({ windowMs: 60_000, max: 5 });
