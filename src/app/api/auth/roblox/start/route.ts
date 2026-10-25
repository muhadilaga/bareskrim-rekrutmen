import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildAuthorizeUrl,
  createOAuthState,
  getOAuthConfig,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_S,
} from "@/lib/oauth";

/**
 * GET /api/auth/roblox/start
 * Memulai Roblox OAuth 2.0 Authorization Code Flow + PKCE S256.
 * Browser HANYA menerima cookie HTTP-only berisi stateId (correlation).
 * codeVerifier/nonce/state disimpan server-side (terenkripsi AES-256-GCM).
 */
export async function GET(req: Request) {
  const config = getOAuthConfig();
  if (!config) {
    return NextResponse.json(
      {
        success: false,
        code: "OAUTH_NOT_CONFIGURED",
        message: "Login Roblox OAuth belum dikonfigurasi di server.",
      },
      { status: 503 }
    );
  }

  const start = await createOAuthState(prisma, config);
  if (!start) {
    console.error(
      "[OAuth Start] Gagal memulai sesi login karena penyimpanan OAuthState gagal (database unreachable/error)."
    );
    return NextResponse.json(
      {
        success: false,
        code: "OAUTH_STATE_FAILED",
        message:
          "Gagal memulai sesi login karena penyimpanan state database gagal. Pastikan database aktif dan dapat dijangkau.",
      },
      { status: 503 }
    );
  }

  const authorizeUrl = buildAuthorizeUrl(config, {
    state: start.state,
    codeChallenge: start.codeChallenge,
    nonce: start.nonce,
  });

  const res = NextResponse.redirect(authorizeUrl, 302);
  res.cookies.set(OAUTH_STATE_COOKIE, start.stateId, {
    httpOnly: true,
    secure: req.url.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_S,
  });
  return res;
}
