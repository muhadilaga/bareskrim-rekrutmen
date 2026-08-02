import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/constants";

const COOKIE_NAME = "brk_token";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  // Defensif: jangan sampai middleware melempar 500 di Edge runtime.
  // Bila JWT_SECRET belum tersedia (env), token dianggap tidak valid ->
  // diarahkan ke /login seperti biasa.
  if (token) {
    try {
      const secret = getJwtSecret();
      if (secret && secret.length >= 32) {
        const { payload } = await jwtVerify(token, getSecret());
        if (typeof payload.userId === "string") {
          return NextResponse.next();
        }
      }
    } catch {
      // token invalid -> redirect login
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/ujian"],
};
