// ============================================================
// CSRF Protection - Origin/Referer check untuk API routes.
// JSON API sudah relatif aman dari CSRF (browser tidak auto-send
// JSON cross-origin), tapi kita tambah layer keamanan.
// ============================================================

export function verifyCsrfOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  if (!host) return false;

  // Cek Origin header
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch {
      // origin tidak valid
    }
  }

  // Fallback: cek Referer header
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost === host) return true;
    } catch {
      // referer tidak valid
    }
  }

  // Development: localhost tanpa origin/referer diizinkan
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    if (!origin && !referer) return true;
  }

  return false;
}
