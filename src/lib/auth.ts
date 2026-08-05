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
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, robloxId: payload.robloxId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== "string") return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSessionCookie(userId: string, robloxId: number): Promise<void> {
  const token = await signSession({ userId, robloxId });
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
export async function getSessionUser(req?: Request) {
  // 1) Coba via next/headers cookies() (server component / navigation)
  let token: string | null = cookies().get(COOKIE_NAME)?.value ?? null;

  // 2) Fallback: baca dari raw request header (client-side fetch)
  if (!token && req) {
    token = parseTokenFromHeader(req.headers.get("cookie"));
  }

  if (!token) {
    console.log(`[Auth] No session token found. cookies()=${!!cookies().get(COOKIE_NAME)?.value}, hasReq=${!!req}, reqCookieHeader=${req?.headers.get("cookie")?.substring(0, 80) ?? "null"}`);
    return null;
  }
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  return prisma.user.findUnique({ where: { id: payload.userId } });
}

export const SESSION_COOKIE = COOKIE_NAME;
