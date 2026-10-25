// ============================================================
// Roblox OAuth 2.0 + OpenID Connect (OIDC) — Core Library
// Spesifikasi: docs/v2/13-ROBLOX-OAUTH-AUTHENTICATION.md
// - Authorization Code Flow + PKCE S256
// - ID Token ES256 (Live Discovery Roblox)
// - Server-side OAuthState dengan AES-256-GCM
// ============================================================
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from "jose";
import type { PrismaClient } from "@prisma/client";

// ------------------------------------------------------------
// Konstanta resmi Roblox (Live Discovery)
// ------------------------------------------------------------
export const ROBLOX_ISSUER = "https://apis.roblox.com/oauth/";
export const ROBLOX_AUTH_ENDPOINT = "https://apis.roblox.com/oauth/v1/authorize";
export const ROBLOX_TOKEN_ENDPOINT = "https://apis.roblox.com/oauth/v1/token";
export const ROBLOX_JWKS_URL = "https://apis.roblox.com/oauth/v1/certs";
export const OAUTH_SCOPES = "openid profile";
// Algoritma allowlist ID Token Roblox — HS256/RS256 DITOLAK.
export const ROBLOX_ID_TOKEN_ALGORITHMS = ["ES256"] as const;

export const OAUTH_STATE_TTL_MS = 10 * 60_000; // 10 menit
export const OAUTH_STATE_COOKIE = "brk_oauth_sid";
export const OAUTH_STATE_MAX_AGE_S = 600;

// ------------------------------------------------------------
// Config dari environment (tanpa mencetak nilai secret)
// ------------------------------------------------------------
function cleanEnv(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Uint8Array; // AES-256-GCM key (32 byte), TERPISAH dari JWT_SECRET
}

/** Kunci enkripsi OAuthState dari OAUTH_STATE_ENCRYPTION_KEY (base64, 32 byte). */
export function getOAuthEncryptionKey(): Uint8Array | null {
  const raw = cleanEnv(process.env.OAUTH_STATE_ENCRYPTION_KEY);
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) return null;
  return new Uint8Array(buf);
}

/** Config OAuth lengkap, atau null bila ada yang belum diatur. */
export function getOAuthConfig(): OAuthConfig | null {
  const clientId = cleanEnv(process.env.ROBLOX_OAUTH_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.ROBLOX_OAUTH_CLIENT_SECRET);
  const redirectUri = cleanEnv(process.env.ROBLOX_OAUTH_REDIRECT_URI);
  const encryptionKey = getOAuthEncryptionKey();
  if (!clientId || !clientSecret || !redirectUri || !encryptionKey) return null;
  return { clientId, clientSecret, redirectUri, encryptionKey };
}

// ------------------------------------------------------------
// PKCE S256 + random acak kriptografis
// ------------------------------------------------------------
export function generateRandomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** code_verifier: 64 byte hex -> 128 karakter (batas 43–128 terpenuhi). */
export function generateCodeVerifier(): string {
  return generateRandomHex(64);
}

/** code_challenge = BASE64URL(SHA256(verifier)) tanpa padding. */
export function computeCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ------------------------------------------------------------
// AES-256-GCM untuk codeVerifier (server-side only)
// Format: base64(iv).base64(ciphertext).base64(authTag)
// ------------------------------------------------------------
export function encryptSecret(plain: string, key: Uint8Array): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${ct.toString("base64")}.${cipher.getAuthTag().toString("base64")}`;
}

export function decryptSecret(encoded: string, key: Uint8Array): string {
  const [ivB64, ctB64, tagB64] = encoded.split(".");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("Format ciphertext OAuthState tidak valid");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

// ------------------------------------------------------------
// OAuthState — server-side temporary state (atomic consume)
// ------------------------------------------------------------
export type OAuthStateDb = Pick<PrismaClient, "oAuthState">;

export interface OAuthStartData {
  stateId: string; // dikirim ke browser via cookie (correlation saja)
  state: string; // parameter 'state' ke URL Roblox
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  expiresAt: Date;
}

/**
 * Buat record OAuthState + kembalikan data untuk authorization URL.
 * codeVerifier disimpan TERENKRIPSI; browser tidak pernah menerimanya.
 */
export async function createOAuthState(db: OAuthStateDb, config?: OAuthConfig): Promise<OAuthStartData | null> {
  const cfg = config ?? getOAuthConfig();
  if (!cfg) {
    console.error("[OAuth] createOAuthState gagal: konfigurasi OAuth tidak lengkap.");
    return null;
  }
  const stateId = generateRandomHex(32);
  const state = generateRandomHex(32);
  const nonce = generateRandomHex(32);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  try {
    await db.oAuthState.create({
      data: {
        stateId,
        state,
        codeVerifier: encryptSecret(codeVerifier, cfg.encryptionKey),
        nonce,
        expiresAt,
      },
    });
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    // Sanitasi pesan log agar tidak pernah membocorkan connection string/kredensial
    const sanitizedMsg = rawMsg.replace(/:\/\/[^@\s]+@/g, "://***@");
    console.error("[OAuth] createOAuthState persistence failed:", sanitizedMsg);
    return null;
  }
  return { stateId, state, nonce, codeVerifier, codeChallenge, expiresAt };
}

/**
 * Konsumsi atomis single-use. Hanya count===1 yang dianggap valid.
 * State terkonsumsi TIDAK dapat dipakai ulang meski token exchange gagal.
 */
export async function consumeOAuthState(
  db: OAuthStateDb,
  stateId: string,
  state: string,
  config?: OAuthConfig
): Promise<{ codeVerifier: string; nonce: string } | null> {
  const cfg = config ?? getOAuthConfig();
  if (!cfg) return null;
  try {
    const consumed = await db.oAuthState.updateMany({
      where: {
        stateId,
        state,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) return null; // mismatch / expired / replay
    const record = await db.oAuthState.findUnique({ where: { stateId } });
    if (!record) return null;
    return { codeVerifier: decryptSecret(record.codeVerifier, cfg.encryptionKey), nonce: record.nonce };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// Authorization URL (PKCE S256)
// ------------------------------------------------------------
export function buildAuthorizeUrl(
  config: OAuthConfig,
  params: { state: string; codeChallenge: string; nonce: string }
): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: OAUTH_SCOPES,
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    nonce: params.nonce,
  });
  return `${ROBLOX_AUTH_ENDPOINT}?${q.toString()}`;
}

// ------------------------------------------------------------
// Token exchange (server-to-server, tanpa DB transaction)
// ------------------------------------------------------------
export type OAuthExchangeErrorCategory =
  | "PROVIDER_REJECTION"
  | "NETWORK_FAILURE"
  | "TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "MISSING_FIELDS";

const SAFE_OAUTH_ERROR_VALUES = [
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
  "server_error",
  "temporarily_unavailable",
] as const;
const SAFE_OAUTH_ERRORS = new Set<string>(SAFE_OAUTH_ERROR_VALUES);

const SAFE_NETWORK_ERROR_VALUES = [
  "econnreset",
  "etimedout",
  "enetunreach",
  "eai_again",
  "econnrefused",
  "und_err_connect_timeout",
  "und_err_socket",
  "fetch_failed",
  "aborterror",
] as const;
const SAFE_NETWORK_ERROR_CODES = new Set<string>(SAFE_NETWORK_ERROR_VALUES);

const EXCHANGE_ERROR_CODES = {
  PROVIDER_REJECTION: "TOKEN_EXCHANGE_PROVIDER_REJECTION",
  NETWORK_FAILURE: "TOKEN_EXCHANGE_NETWORK_FAILURE",
  TIMEOUT: "TOKEN_EXCHANGE_TIMEOUT",
  MALFORMED_RESPONSE: "TOKEN_EXCHANGE_MALFORMED_RESPONSE",
  MISSING_FIELDS: "TOKEN_EXCHANGE_MISSING_FIELDS",
} as const;

const EXCHANGE_STAGES = ["fetch", "http_response", "response_body", "token_fields", "complete"] as const;
const BODY_OUTCOMES = ["not_read", "parsed", "failed"] as const;

export interface OAuthExchangeDiagnostic {
  readonly stage: (typeof EXCHANGE_STAGES)[number];
  readonly outcome: "success" | "failure";
  readonly durationMs: number;
  readonly status?: number;
  readonly category?: OAuthExchangeErrorCategory;
  readonly code?: (typeof EXCHANGE_ERROR_CODES)[OAuthExchangeErrorCategory] | "TOKEN_EXCHANGE_UNEXPECTED_ERROR";
  readonly oauthError?: (typeof SAFE_OAUTH_ERROR_VALUES)[number];
  readonly causeCode?: Uppercase<(typeof SAFE_NETWORK_ERROR_VALUES)[number]>;
  readonly bodyOutcome: (typeof BODY_OUTCOMES)[number];
}

function safeNetworkCode(value: unknown): OAuthExchangeDiagnostic["causeCode"] {
  return typeof value === "string" && SAFE_NETWORK_ERROR_CODES.has(value.toLowerCase())
    ? value.toUpperCase() as OAuthExchangeDiagnostic["causeCode"]
    : undefined;
}

function safeOAuthError(value: unknown): OAuthExchangeDiagnostic["oauthError"] {
  return typeof value === "string" && SAFE_OAUTH_ERRORS.has(value.toLowerCase())
    ? value.toLowerCase() as OAuthExchangeDiagnostic["oauthError"]
    : undefined;
}

/** Explicit field/enum allowlist; never serialize an Error, response, or config. */
function safeExchangeDiagnostic(value: OAuthExchangeDiagnostic): OAuthExchangeDiagnostic {
  const category = typeof value.category === "string" && Object.prototype.hasOwnProperty.call(EXCHANGE_ERROR_CODES, value.category)
    ? value.category
    : undefined;
  return {
    stage: EXCHANGE_STAGES.includes(value.stage) ? value.stage : "fetch",
    outcome: value.outcome === "success" ? "success" : "failure",
    durationMs: Number.isFinite(value.durationMs) ? Math.max(0, Math.round(value.durationMs)) : 0,
    status: Number.isInteger(value.status) && value.status! >= 100 && value.status! <= 599 ? value.status : undefined,
    category,
    code: category ? EXCHANGE_ERROR_CODES[category]
      : value.outcome === "success" ? undefined : "TOKEN_EXCHANGE_UNEXPECTED_ERROR",
    oauthError: safeOAuthError(value.oauthError),
    causeCode: safeNetworkCode(value.causeCode),
    bodyOutcome: BODY_OUTCOMES.includes(value.bodyOutcome) ? value.bodyOutcome : "not_read",
  };
}

/** Formatting only: the callback route remains the sole exchange log writer. */
export function formatOAuthExchangeDiagnostic(value: OAuthExchangeDiagnostic): string {
  const d = safeExchangeDiagnostic(value);
  return `category=${d.category ?? "N/A"} code=${d.code ?? "N/A"} status=${d.status ?? "N/A"} oauthError=${d.oauthError ?? "N/A"} causeCode=${d.causeCode ?? "N/A"} stage=${d.stage} outcome=${d.outcome} durationMs=${d.durationMs} bodyOutcome=${d.bodyOutcome}`;
}

export class OAuthExchangeError extends Error {
  constructor(
    public category: OAuthExchangeErrorCategory,
    public code: string,
    message: string,
    public status?: number,
    public oauthError?: string,
    public causeCode?: string
  ) {
    super(message);
    this.name = "OAuthExchangeError";
  }
}

export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  config?: OAuthConfig,
  options?: {
    timeoutMs?: number;
    onDiagnostic?: (diagnostic: OAuthExchangeDiagnostic) => void | Promise<void>;
  }
): Promise<{ accessToken: string; idToken: string }> {
  const cfg = config ?? getOAuthConfig();
  if (!cfg) throw new Error("OAuth tidak dikonfigurasi");

  const startedAt = performance.now();
  let stage: OAuthExchangeDiagnostic["stage"] = "fetch";
  let outcome: OAuthExchangeDiagnostic["outcome"] = "failure";
  let bodyOutcome: OAuthExchangeDiagnostic["bodyOutcome"] = "not_read";
  let status: number | undefined;
  let category: OAuthExchangeErrorCategory | undefined;
  let oauthError: OAuthExchangeDiagnostic["oauthError"];
  let causeCode: OAuthExchangeDiagnostic["causeCode"];

  try {
    const timeoutMs = options?.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    // "fetch" means no response yet; it does not identify DNS, TCP, or TLS.
    try {
      res = await fetch(ROBLOX_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          code,
          code_verifier: codeVerifier,
          redirect_uri: cfg.redirectUri,
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new OAuthExchangeError(
          "TIMEOUT",
          "TOKEN_EXCHANGE_TIMEOUT",
          "Permintaan token exchange melebihi batas waktu (timeout)"
        );
      }

      let safeCauseCode: string | undefined;
      if (err && typeof err === "object") {
        const rawCode = (err as { code?: unknown; cause?: { code?: unknown; name?: unknown } }).code ??
          (err as { cause?: { code?: unknown } }).cause?.code ??
          (err as { cause?: { name?: unknown } }).cause?.name;
        safeCauseCode = safeNetworkCode(rawCode);
      }

      throw new OAuthExchangeError(
        "NETWORK_FAILURE",
        "TOKEN_EXCHANGE_NETWORK_FAILURE",
        "Gagal terhubung ke Roblox token endpoint",
        undefined,
        undefined,
        safeCauseCode
      );
    } finally {
      // Preserve the existing timeout scope; body deadlines are a separate change.
      clearTimeout(timer);
    }

    status = res.status;
    if (!res.ok) {
      stage = "http_response";
      let safeOauthError: string | undefined;
      try {
        const errJson = (await res.json()) as { error?: unknown };
        bodyOutcome = "parsed";
        safeOauthError = safeOAuthError(errJson?.error);
      } catch {
        bodyOutcome = "failed";
        // Keep PROVIDER_REJECTION even if the provider error body is unreadable.
      }

      const detailMsg = safeOauthError
        ? `Provider rejection (${res.status}: ${safeOauthError})`
        : `Provider rejection (${res.status})`;

      throw new OAuthExchangeError(
        "PROVIDER_REJECTION",
        "TOKEN_EXCHANGE_PROVIDER_REJECTION",
        `Token endpoint error: ${detailMsg}`,
        res.status,
        safeOauthError
      );
    }

    stage = "response_body";
    let json: { access_token?: unknown; id_token?: unknown };
    try {
      json = (await res.json()) as { access_token?: unknown; id_token?: unknown };
      bodyOutcome = "parsed";
    } catch {
      bodyOutcome = "failed";
      throw new OAuthExchangeError(
        "MALFORMED_RESPONSE",
        "TOKEN_EXCHANGE_MALFORMED_RESPONSE",
        "Respons token endpoint bukan JSON valid"
      );
    }

    stage = "token_fields";
    if (typeof json?.access_token !== "string" || typeof json?.id_token !== "string") {
      throw new OAuthExchangeError(
        "MISSING_FIELDS",
        "TOKEN_EXCHANGE_MISSING_FIELDS",
        "Respons token endpoint tidak memuat access_token atau id_token valid"
      );
    }

    stage = "complete";
    outcome = "success";
    return { accessToken: json.access_token, idToken: json.id_token };
  } catch (err: unknown) {
    if (err instanceof OAuthExchangeError) {
      category = err.category;
      oauthError = safeOAuthError(err.oauthError);
      causeCode = safeNetworkCode(err.causeCode);
    }
    throw err;
  } finally {
    // Exactly one terminal notification; diagnostic failures cannot change exchange.
    try {
      const diagnostic = safeExchangeDiagnostic({
        stage, outcome, durationMs: performance.now() - startedAt,
        status, category, oauthError, causeCode, bodyOutcome,
      });
      const pending = options?.onDiagnostic?.(diagnostic);
      if (pending) void pending.catch(() => {});
    } catch {
      // No secondary logging: it could fail too or leak diagnostic internals.
    }
  }
}

// ------------------------------------------------------------
// ID Token verification (ES256, issuer/audience/nonce/expiry)
// ------------------------------------------------------------
export interface VerifyIdTokenOptions {
  clientId: string;
  expectedNonce: string;
  /** JWKS URL override (testing). Default: JWKS resmi Roblox. */
  jwksUrl?: string;
  /** Local JWKS (testing) — melewati fetch remote. */
  jwks?: { keys: Record<string, unknown>[] };
}

export interface VerifiedRobloxIdentity {
  robloxId: bigint;
  username: string;
  displayName: string;
}

/**
 * Verifikasi ID Token Roblox secara kriptografis:
 * signature ES256 via JWKS, issuer, audience, expiry, nonce, sub numerik.
 */
export async function verifyRobloxIdToken(
  idToken: string,
  opts: VerifyIdTokenOptions
): Promise<VerifiedRobloxIdentity> {
  const jwks = opts.jwks
    ? (createLocalJWKSet(opts.jwks as never) as never)
    : (createRemoteJWKSet(new URL(opts.jwksUrl ?? ROBLOX_JWKS_URL)) as never);
  const { payload } = await jwtVerify(idToken, jwks, {
    algorithms: [...ROBLOX_ID_TOKEN_ALGORITHMS],
    issuer: ROBLOX_ISSUER,
    audience: opts.clientId,
    clockTolerance: 5,
  });
  if (payload.nonce !== opts.expectedNonce) throw new Error("Nonce tidak cocok");
  const sub = payload.sub;
  if (!sub || !/^\d+$/.test(sub)) throw new Error("Subject tidak valid");
  return {
    robloxId: BigInt(sub),
    username: String(payload.preferred_username ?? payload.name ?? ""),
    displayName: String(payload.name ?? payload.preferred_username ?? ""),
  };
}
