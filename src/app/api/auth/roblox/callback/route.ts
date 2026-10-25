import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createTrustedSessionCookie } from "@/lib/auth";
import {
  consumeOAuthState,
  exchangeAuthorizationCode,
  getOAuthConfig,
  OAUTH_STATE_COOKIE,
  formatOAuthExchangeDiagnostic,
  type OAuthExchangeDiagnostic,
  verifyRobloxIdToken,
} from "@/lib/oauth";

/** Build and write only allowlisted text; logging must never affect authentication. */
function writeDiagnostic(level: "info" | "warn", message: () => string): void {
  try {
    console[level](message());
  } catch {
    // Diagnostics are best-effort; never log the logger's own error.
  }
}

function readStateCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === OAUTH_STATE_COOKIE) {
      return part.slice(idx + 1).trim() || null;
    }
  }
  return null;
}

/** Redirect ke /login dengan kode error generik (tanpa token/secret). */
function failRedirect(url: URL, errorCode: string, cookieName?: string): NextResponse {
  const target = new URL("/login", url);
  target.searchParams.set("error", errorCode);
  const res = NextResponse.redirect(target, 302);
  if (cookieName) {
    res.cookies.set(cookieName, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
  return res;
}

/**
 * GET /api/auth/roblox/callback
 * Menukar authorization code, memverifikasi ID Token (ES256/JWKS),
 * lalu menerbitkan sesi TRUSTED v2. Hanya dipanggil oleh Roblox.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const stateId = readStateCookie(req);

  if (oauthError) {
    // User menolak consent / error dari Roblox.
    return failRedirect(url, "oauth_denied", OAUTH_STATE_COOKIE);
  }
  if (!code || !state || !stateId) {
    return failRedirect(url, "missing_params", OAUTH_STATE_COOKIE);
  }

  const config = getOAuthConfig();
  if (!config) {
    return failRedirect(url, "oauth_not_configured", OAUTH_STATE_COOKIE);
  }

  // Atomic consume: count harus tepat 1. Mismatch/expired/replay -> null.
  // State yang gagal exchange TIDAK diaktifkan ulang (single-use permanen).
  const consumed = await consumeOAuthState(prisma, stateId, state, config);
  if (!consumed) {
    return failRedirect(url, "invalid_or_expired_state", OAUTH_STATE_COOKIE);
  }

  // Correlation is server-only and independent of OAuth state and request input.
  const correlationId = randomUUID();
  const exchangeStartedAt = performance.now();
  let diagnostic: OAuthExchangeDiagnostic | undefined;
  let exchangeSucceeded = false;

  // Token exchange (HTTP server-to-server; TANPA transaksi DB aktif).
  let idToken: string;
  try {
    const tokens = await exchangeAuthorizationCode(code, consumed.codeVerifier, config, {
      onDiagnostic: (value) => { diagnostic = value; },
    });
    idToken = tokens.idToken;
    exchangeSucceeded = true;
  } catch {
    return failRedirect(url, "token_exchange_failed", OAUTH_STATE_COOKIE);
  } finally {
    writeDiagnostic(exchangeSucceeded ? "info" : "warn", () => {
      const terminal: OAuthExchangeDiagnostic = diagnostic ?? {
        stage: exchangeSucceeded ? "complete" : "fetch",
        outcome: exchangeSucceeded ? "success" : "failure",
        durationMs: performance.now() - exchangeStartedAt,
        bodyOutcome: "not_read",
      };
      const prefix = exchangeSucceeded
        ? "[ROBLOX_OAUTH_EXCHANGE_SUCCEEDED]"
        : "[ROBLOX_OAUTH_EXCHANGE_FAILED]";
      return `${prefix} ${formatOAuthExchangeDiagnostic(terminal)} correlationId=${correlationId}`;
    });
  }

  // Verifikasi ID Token: ES256 via JWKS + issuer + audience + expiry + nonce.
  const verificationStartedAt = performance.now();
  let identity: { robloxId: bigint; username: string; displayName: string };
  try {
    identity = await verifyRobloxIdToken(idToken, {
      clientId: config.clientId,
      expectedNonce: consumed.nonce,
    });
  } catch {
    writeDiagnostic("warn", () =>
      `[ROBLOX_OAUTH_ID_TOKEN_FAILED] correlationId=${correlationId} stage=id_token_verification durationMs=${Math.max(0, Math.round(performance.now() - verificationStartedAt))} code=invalid_id_token`
    );
    return failRedirect(url, "invalid_id_token", OAUTH_STATE_COOKIE);
  }

  // Identitas harus berupa Roblox User ID numerik (sub sudah divalidasi di lib).
  if (identity.robloxId <= 0n || !identity.username) {
    return failRedirect(url, "identity_invalid", OAUTH_STATE_COOKIE);
  }

  // Rekonsiliasi User: sumber kebenaran = robloxId dari OIDC (bukan input browser).
  // Username bisa berubah di Roblox — sinkronkan dari klaim OIDC terbaru.
  let user: { id: string };
  try {
    user = await prisma.user.upsert({
      where: { robloxId: identity.robloxId },
      update: {
        username: identity.username,
        displayName: identity.displayName,
      },
      create: {
        robloxId: identity.robloxId,
        username: identity.username,
        displayName: identity.displayName,
      },
    });
  } catch {
    // P2002 (konflik username unik) / DB error -> tolak tanpa sesi.
    return failRedirect(url, "user_reconciliation_failed", OAUTH_STATE_COOKIE);
  }

  // Terbitkan sesi TRUSTED v2 HANYA setelah seluruh verifikasi PASS.
  await createTrustedSessionCookie(user.id, Number(identity.robloxId));

  const ok = new URL("/dashboard", url);
  const res = NextResponse.redirect(ok, 302);
  // Hapus cookie correlation state (sudah terkonsumsi).
  res.cookies.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
