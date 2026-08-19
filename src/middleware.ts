import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getAdminKey, getJwtSecret } from "@/lib/constants";

const ADMIN_COOKIE = "brk_admin_verified";
const STAFF_ROLE_ID = "1471794305499664426";
const PROTECTED_PREFIXES = [
  "/api/admin/",
  "/api/attendance/list",
  "/api/cron/discord-retry",
];
const EXEMPT_PATHS = new Set([
  "/api/admin/auth/verify-staff",
  "/api/admin/auth/session",
]);

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isExempt(pathname: string) {
  return EXEMPT_PATHS.has(pathname);
}

function getSecret() {
  return new TextEncoder().encode(getJwtSecret());
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtected(pathname) || isExempt(pathname)) {
    return NextResponse.next();
  }

  const adminKey = req.headers.get("x-admin-key");
  if (!adminKey || adminKey !== getAdminKey()) {
    return NextResponse.json({ ok: false, message: "Kunci admin salah." }, { status: 401 });
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Verifikasi admin tahap kedua wajib dilakukan." }, { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.discordUserId !== "string" ||
      typeof payload.discordUsername !== "string" ||
      payload.staffRoleId !== STAFF_ROLE_ID
    ) {
      return NextResponse.json({ ok: false, message: "Sesi admin terverifikasi tidak valid." }, { status: 401 });
    }
    return NextResponse.next();
  } catch {
    return NextResponse.json({ ok: false, message: "Sesi admin terverifikasi sudah habis atau tidak valid." }, { status: 401 });
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
