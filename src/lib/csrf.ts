import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getJwtSecret } from "@/lib/constants";

const CSRF_COOKIE_NAME = "brk_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_SECRET = getJwtSecret();

function getSecret(): Uint8Array {
  const secret = CSRF_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET wajib diisi minimal 32 karakter");
  }
  return new TextEncoder().encode(secret);
}

export async function generateCsrfToken(): Promise<string> {
  return new SignJWT({ csrf: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(getSecret());
}

export async function verifyCsrfToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function setCsrfCookie(): Promise<void> {
  const token = await generateCsrfToken();
  cookies().set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2,
  });
}

export function getCsrfTokenFromRequest(req: Request): string | null {
  const headerToken = req.headers.get(CSRF_HEADER_NAME);
  if (headerToken) return headerToken;

  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.split("; ").find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (!match) return null;
  return match.slice(CSRF_COOKIE_NAME.length + 1);
}

export async function validateCsrf(req: Request): Promise<boolean> {
  const token = getCsrfTokenFromRequest(req);
  if (!token) return false;
  return verifyCsrfToken(token);
}

export function csrfErrorResponse() {
  return new Response(JSON.stringify({ ok: false, message: "CSRF token tidak valid atau kedaluwarsa" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}