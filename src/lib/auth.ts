import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getJwtSecret } from "@/lib/constants";

const COOKIE_NAME = "brk_token";

function getSecret(): Uint8Array {
  const secret = getJwtSecret();
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET wajib diisi minimal 32 karakter (lihat .env)");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload extends JWTPayload {
  userId: string;
  robloxId: number;
  // Klaim trust v2 — HANYA diterbitkan setelah verifikasi Roblox OIDC.
  // JWT tanpa klaim ini (legacy) DITOLAK oleh seluruh pembaca sesi.
  authVersion?: number;
  authMethod?: string;
  isOwnershipVerified?: boolean;
}

/** Predikat trusted: authVersion=2 + (ROBLOX_OIDC atau CASIS_PORTAL) + ownership verified. */
export function isTrustedSession(payload: SessionPayload | null | undefined): boolean {
  return (
    !!payload &&
    payload.authVersion === 2 &&
    (payload.authMethod === "ROBLOX_OIDC" || payload.authMethod === "CASIS_PORTAL") &&
    payload.isOwnershipVerified === true
  );
}

// CATATAN (TASK 03L.2B.1): penandatangan legacy (signSession) dan penerbit
// cookie legacy (createSessionCookie) DIHAPUS dari modul ini. Jalur penerbitan
// sesi resmi adalah signTrustedSession (OAuth) dan signCasisPortalSession (Portal Casis).

/** Sesi TRUSTED v2 — HANYA dipanggil setelah verifikasi Roblox OIDC sukses. */
export async function signTrustedSession(payload: { userId: string; robloxId: number }): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    robloxId: payload.robloxId,
    authVersion: 2,
    authMethod: "ROBLOX_OIDC",
    isOwnershipVerified: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(getSecret());
}

/** Sesi Portal Casis v2 — Diterbitkan saat casis absen / verifikasi di portal casis. */
export async function signCasisPortalSession(payload: { userId: string; robloxId?: number }): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    robloxId: payload.robloxId ?? 0,
    authVersion: 2,
    authMethod: "CASIS_PORTAL",
    isOwnershipVerified: true,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());
}

// Verifikasi payload JWT — INTERNAL ONLY (bukan jalur otorisasi).
async function verifyTokenPayload(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== "string") return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Verifikasi + syaratkan klaim trusted v2. Legacy JWT -> null. */
export async function verifyTrustedSessionToken(token: string): Promise<SessionPayload | null> {
  const payload = await verifyTokenPayload(token);
  return isTrustedSession(payload) ? payload : null;
}

/** Cookie sesi TRUSTED — hanya untuk hasil verifikasi Roblox OIDC. */
export async function createTrustedSessionCookie(userId: string, robloxId: number): Promise<void> {
  const token = await signTrustedSession({ userId, robloxId });
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
}

export async function destroySessionCookie(): Promise<void> {
  cookies().set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// Parse token dari raw Cookie header (fallback untuk fetch yang tidak kirim cookie via cookies())
function parseTokenFromHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split("; ").find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  return match.slice(COOKIE_NAME.length + 1);
}

// Ambil user dari cookie. Menerima optional raw Request untuk fallback.
// FAIL-CLOSED (TASK 03L.2B.1): HANYA sesi trusted v2 (hasil Roblox OIDC)
// yang diterima. Tidak ada opsi untuk melonggarkan kontrak ini — JWT legacy
// tanpa klaim trusted otomatis menghasilkan null.
export async function getSessionUser(req?: Request) {
  // 1) Coba via next/headers cookies() (server component / navigation)
  let token: string | null = cookies().get(COOKIE_NAME)?.value ?? null;

  // 2) Fallback: baca dari raw request header (client-side fetch)
  if (!token && req) {
    token = parseTokenFromHeader(req.headers.get("cookie"));
  }

  if (!token) {
    // Catatan keamanan: JANGAN mencetak isi cookie/token ke log.
    console.log(`[Auth] No session token found. hasReq=${!!req}`);
    return null;
  }
  const payload = await verifyTrustedSessionToken(token);
  if (!payload) return null;
  return prisma.user.findUnique({ where: { id: payload.userId } });
}

export const SESSION_COOKIE = COOKIE_NAME;
