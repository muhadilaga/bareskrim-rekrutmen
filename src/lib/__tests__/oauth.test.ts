import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHash, generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import {
  buildAuthorizeUrl,
  computeCodeChallenge,
  consumeOAuthState,
  createOAuthState,
  decryptSecret,
  encryptSecret,
  exchangeAuthorizationCode,
  formatOAuthExchangeDiagnostic,
  type OAuthExchangeDiagnostic,
  generateCodeVerifier,
  generateRandomHex,
  getOAuthConfig,
  getOAuthEncryptionKey,
  ROBLOX_AUTH_ENDPOINT,
  ROBLOX_ISSUER,
  ROBLOX_JWKS_URL,
  ROBLOX_TOKEN_ENDPOINT,
  verifyRobloxIdToken,
} from "@/lib/oauth";

const TEST_KEY = new Uint8Array(32).fill(7);
const TEST_CONFIG = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "http://localhost:3000/api/auth/roblox/callback",
  encryptionKey: TEST_KEY,
};

// ------------------------------------------------------------
// PKCE S256
// ------------------------------------------------------------
describe("PKCE S256", () => {
  it("generates 128-char hex verifier", () => {
    const v = generateCodeVerifier();
    expect(v).toHaveLength(128);
    expect(v).toMatch(/^[0-9a-f]+$/);
  });

  it("computes deterministic base64url SHA-256 challenge", () => {
    const v = generateCodeVerifier();
    const expected = createHash("sha256").update(v).digest("base64url");
    expect(computeCodeChallenge(v)).toBe(expected);
    expect(computeCodeChallenge(v)).toBe(computeCodeChallenge(v));
  });

  it("generates unique random hex values", () => {
    expect(generateRandomHex(32)).not.toBe(generateRandomHex(32));
  });
});

// ------------------------------------------------------------
// AES-256-GCM
// ------------------------------------------------------------
describe("AES-256-GCM encryption", () => {
  it("roundtrips secret", () => {
    const enc = encryptSecret("verifier-mentah-128char", TEST_KEY);
    expect(enc).not.toContain("verifier-mentah");
    expect(decryptSecret(enc, TEST_KEY)).toBe("verifier-mentah-128char");
  });

  it("produces unique ciphertext per encryption (random IV)", () => {
    const a = encryptSecret("same", TEST_KEY);
    const b = encryptSecret("same", TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("rejects tampered ciphertext", () => {
    const enc = encryptSecret("secret", TEST_KEY);
    const [iv, , tag] = enc.split(".");
    const bad = `${iv}.${Buffer.from("AAAA").toString("base64")}.${tag}`;
    expect(() => decryptSecret(bad, TEST_KEY)).toThrow();
  });

  it("rejects wrong key", () => {
    const enc = encryptSecret("secret", TEST_KEY);
    const wrong = new Uint8Array(32).fill(9);
    expect(() => decryptSecret(enc, wrong)).toThrow();
  });

  it("rejects malformed format", () => {
    expect(() => decryptSecret("not-valid", TEST_KEY)).toThrow();
  });
});

// ------------------------------------------------------------
// Config
// ------------------------------------------------------------
describe("OAuth config", () => {
  const ENV_KEYS = [
    "ROBLOX_OAUTH_CLIENT_ID",
    "ROBLOX_OAUTH_CLIENT_SECRET",
    "ROBLOX_OAUTH_REDIRECT_URI",
    "OAUTH_STATE_ENCRYPTION_KEY",
  ];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns null when config incomplete", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(getOAuthConfig()).toBeNull();
  });

  it("returns null when encryption key missing/short", () => {
    process.env.ROBLOX_OAUTH_CLIENT_ID = "id";
    process.env.ROBLOX_OAUTH_CLIENT_SECRET = "secret";
    process.env.ROBLOX_OAUTH_REDIRECT_URI = "http://localhost/x";
    delete process.env.OAUTH_STATE_ENCRYPTION_KEY;
    expect(getOAuthConfig()).toBeNull();
    process.env.OAUTH_STATE_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    expect(getOAuthConfig()).toBeNull();
  });

  it("returns config when all present and strips quotes", () => {
    process.env.ROBLOX_OAUTH_CLIENT_ID = '"my-client-id"';
    process.env.ROBLOX_OAUTH_CLIENT_SECRET = "my-secret";
    process.env.ROBLOX_OAUTH_REDIRECT_URI = "http://localhost:3000/api/auth/roblox/callback";
    process.env.OAUTH_STATE_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const cfg = getOAuthConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.clientId).toBe("my-client-id");
    expect(cfg!.encryptionKey).toHaveLength(32);
  });

  it("getOAuthEncryptionKey rejects non-32-byte keys", () => {
    process.env.OAUTH_STATE_ENCRYPTION_KEY = Buffer.alloc(31).toString("base64");
    expect(getOAuthEncryptionKey()).toBeNull();
  });
});

// ------------------------------------------------------------
// OAuthState server-side storage
// ------------------------------------------------------------
function mockDb(overrides: Record<string, unknown> = {}) {
  return {
    oAuthState: {
      create: vi.fn().mockResolvedValue(undefined),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(null),
      ...overrides,
    },
  } as never;
}

describe("createOAuthState", () => {
  it("stores ENCRYPTED verifier and returns raw verifier only to server", async () => {
    let created: { codeVerifier: string; nonce: string; expiresAt: Date } | null = null;
    const db = mockDb({
      create: vi.fn(async ({ data }: { data: { codeVerifier: string; nonce: string; expiresAt: Date } }) => {
        created = data;
        return data;
      }),
    });
    const start = await createOAuthState(db, TEST_CONFIG);
    expect(start).not.toBeNull();
    expect(created).not.toBeNull();
    // DB menyimpan ciphertext, bukan plaintext
    expect(created!.codeVerifier).not.toBe(start!.codeVerifier);
    expect(decryptSecret(created!.codeVerifier, TEST_KEY)).toBe(start!.codeVerifier);
    // TTL 10 menit
    const ttl = created!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9.5 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000);
    // stateId acak & unik
    expect(start!.stateId).toHaveLength(64);
  });

  it("returns null when config missing or DB fails", async () => {
    expect(await createOAuthState(mockDb(), undefined)).toBeNull(); // config null (env kosong utk lib default)
    const failing = mockDb({ create: vi.fn().mockRejectedValue(new Error("db down")) });
    expect(await createOAuthState(failing, TEST_CONFIG)).toBeNull();
  });
});

describe("consumeOAuthState (atomic + replay)", () => {
  const ENCRYPTED = encryptSecret("raw-verifier", TEST_KEY);

  it("decrypts verifier on success (count===1)", async () => {
    const db = mockDb({
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ codeVerifier: ENCRYPTED, nonce: "n-1" }),
    });
    const out = await consumeOAuthState(db, "sid", "st", TEST_CONFIG);
    expect(out).toEqual({ codeVerifier: "raw-verifier", nonce: "n-1" });
  });

  it("rejects state mismatch (count===0)", async () => {
    const db = mockDb({ updateMany: vi.fn().mockResolvedValue({ count: 0 }) });
    expect(await consumeOAuthState(db, "sid", "WRONG", TEST_CONFIG)).toBeNull();
  });

  it("rejects expired state (count===0)", async () => {
    const db = mockDb({ updateMany: vi.fn().mockResolvedValue({ count: 0 }) });
    expect(await consumeOAuthState(db, "sid", "st", TEST_CONFIG)).toBeNull();
  });

  it("rejects REPLAYED callback (count===0 on second consume)", async () => {
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const db = mockDb({
      updateMany,
      findUnique: vi.fn().mockResolvedValue({ codeVerifier: ENCRYPTED, nonce: "n-1" }),
    });
    expect(await consumeOAuthState(db, "sid", "st", TEST_CONFIG)).not.toBeNull();
    // Callback kedua dengan state sama -> ditolak (state tetap terkonsumsi)
    expect(await consumeOAuthState(db, "sid", "st", TEST_CONFIG)).toBeNull();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });

  it("rejects when ciphertext undecryptable", async () => {
    const db = mockDb({
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ codeVerifier: "corrupt.format", nonce: "n" }),
    });
    expect(await consumeOAuthState(db, "sid", "st", TEST_CONFIG)).toBeNull();
  });
});

// ------------------------------------------------------------
// Authorization URL
// ------------------------------------------------------------
describe("buildAuthorizeUrl", () => {
  it("contains all PKCE S256 params with registered redirect_uri", () => {
    const url = buildAuthorizeUrl(TEST_CONFIG, {
      state: "st-1",
      codeChallenge: "ch-1",
      nonce: "n-1",
    });
    expect(url.startsWith(ROBLOX_AUTH_ENDPOINT)).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("response_type")).toBe("code");
    expect(q.get("client_id")).toBe("test-client-id");
    expect(q.get("redirect_uri")).toBe(TEST_CONFIG.redirectUri);
    expect(q.get("scope")).toBe("openid profile");
    expect(q.get("state")).toBe("st-1");
    expect(q.get("code_challenge")).toBe("ch-1");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("nonce")).toBe("n-1");
    // Tidak ada credential di URL
    expect(url).not.toContain("test-client-secret");
  });
});

// ------------------------------------------------------------
// Token exchange (mocked fetch & structured errors)
// ------------------------------------------------------------
describe("exchangeAuthorizationCode", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("exchanges code+verifier via POST form successfully", async () => {
    let captured: { url: string; body: string } | null = null;
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      captured = { url: String(url), body: String(init?.body) };
      return new Response(JSON.stringify({ access_token: "AT", id_token: "IDT" }), { status: 200 });
    }) as never;
    const out = await exchangeAuthorizationCode("code-1", "ver-1", TEST_CONFIG);
    expect(out).toEqual({ accessToken: "AT", idToken: "IDT" });
    expect(captured!.url).toBe(ROBLOX_TOKEN_ENDPOINT);
    expect(captured!.body).toContain("grant_type=authorization_code");
    expect(captured!.body).toContain("code_verifier=ver-1");
  });

  it("handles HTTP 400 invalid_grant without leaking internal descriptions or secrets", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Internal sensitive error description with secret test-client-secret",
          }),
          { status: 400 }
        )
    ) as never;

    try {
      await exchangeAuthorizationCode("code-secret-123", "ver-secret-456", TEST_CONFIG);
      expect.unreachable("Should have thrown");
    } catch (e: any) {
      expect(e.name).toBe("OAuthExchangeError");
      expect(e.category).toBe("PROVIDER_REJECTION");
      expect(e.status).toBe(400);
      expect(e.oauthError).toBe("invalid_grant");
      expect(e.message).toContain("invalid_grant");
      // No leakage of secrets, verifiers, or internal error descriptions
      expect(e.message).not.toContain("test-client-secret");
      expect(e.message).not.toContain("code-secret-123");
      expect(e.message).not.toContain("ver-secret-456");
      expect(e.message).not.toContain("Internal sensitive error description");
    }
  });

  it("handles HTTP 401 invalid_client", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 })
    ) as never;

    try {
      await exchangeAuthorizationCode("code-1", "ver-1", TEST_CONFIG);
      expect.unreachable("Should have thrown");
    } catch (e: any) {
      expect(e.category).toBe("PROVIDER_REJECTION");
      expect(e.status).toBe(401);
      expect(e.oauthError).toBe("invalid_client");
    }
  });

  it("handles HTTP 5xx provider failure", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "server_error" }), { status: 502 })
    ) as never;

    try {
      await exchangeAuthorizationCode("code-1", "ver-1", TEST_CONFIG);
      expect.unreachable("Should have thrown");
    } catch (e: any) {
      expect(e.category).toBe("PROVIDER_REJECTION");
      expect(e.status).toBe(502);
      expect(e.oauthError).toBe("server_error");
    }
  });

  it("handles network failure and extracts safe causeCode", async () => {
    globalThis.fetch = vi.fn(async () => {
      const err = new TypeError("Failed to fetch");
      (err as any).cause = { code: "ECONNRESET" };
      throw err;
    }) as never;

    try {
      await exchangeAuthorizationCode("code-1", "ver-1", TEST_CONFIG);
      expect.unreachable("Should have thrown");
    } catch (e: any) {
      expect(e.category).toBe("NETWORK_FAILURE");
      expect(e.code).toBe("TOKEN_EXCHANGE_NETWORK_FAILURE");
      expect(e.causeCode).toBe("ECONNRESET");
    }
  });

  it("handles timeout", async () => {
    globalThis.fetch = vi.fn(async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }) as never;

    try {
      await exchangeAuthorizationCode("code-1", "ver-1", TEST_CONFIG, { timeoutMs: 10 });
      expect.unreachable("Should have thrown");
    } catch (e: any) {
      expect(e.category).toBe("TIMEOUT");
      expect(e.code).toBe("TOKEN_EXCHANGE_TIMEOUT");
    }
  });

  it("handles malformed response body (non-JSON)", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>Gateway Timeout</html>", { status: 200 })) as never;

    try {
      await exchangeAuthorizationCode("code-1", "ver-1", TEST_CONFIG);
      expect.unreachable("Should have thrown");
    } catch (e: any) {
      expect(e.category).toBe("MALFORMED_RESPONSE");
      expect(e.code).toBe("TOKEN_EXCHANGE_MALFORMED_RESPONSE");
    }
  });

  it("handles missing required token fields", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ access_token: "AT" }), { status: 200 })
    ) as never;

    try {
      await exchangeAuthorizationCode("code-1", "ver-1", TEST_CONFIG);
      expect.unreachable("Should have thrown");
    } catch (e: any) {
      expect(e.category).toBe("MISSING_FIELDS");
      expect(e.code).toBe("TOKEN_EXCHANGE_MISSING_FIELDS");
    }
  });

  it("verifies no secret, code, or state leakage in any error output", async () => {
    const sensitiveSecret = "SECRET_12345_XYZ";
    const sensitiveCode = "CODE_99999_ABC";
    const sensitiveVerifier = "VERIFIER_88888_DEF";
    const cfg = { ...TEST_CONFIG, clientSecret: sensitiveSecret };

    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: sensitiveSecret + " " + sensitiveCode,
          }),
          { status: 400 }
        )
    ) as never;

    try {
      await exchangeAuthorizationCode(sensitiveCode, sensitiveVerifier, cfg);
    } catch (e: any) {
      const fullString = JSON.stringify(e) + e.message + String(e.stack ?? "");
      expect(fullString).not.toContain(sensitiveSecret);
      expect(fullString).not.toContain(sensitiveCode);
      expect(fullString).not.toContain(sensitiveVerifier);
    }
  });
});


describe("exchange observability (offline)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const networkError = (code: string) => Object.assign(new TypeError("sensitive network detail"), {
    cause: { code, message: "sensitive nested detail" },
  });
  const unreadable = (status: number) => ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockRejectedValue(new Error("sensitive body read failure")),
  }) as unknown as Response;

  it.each([
    { name: "success", response: () => new Response(JSON.stringify({ access_token: "AT", id_token: "IDT" })), stage: "complete", category: undefined, body: "parsed" },
    { name: "connect timeout", error: () => networkError("UND_ERR_CONNECT_TIMEOUT"), stage: "fetch", category: "NETWORK_FAILURE", body: "not_read" },
    { name: "abort", error: () => Object.assign(new Error("private abort"), { name: "AbortError" }), stage: "fetch", category: "TIMEOUT", body: "not_read" },
    { name: "400", response: () => new Response('{"error":"invalid_grant"}', { status: 400 }), stage: "http_response", category: "PROVIDER_REJECTION", body: "parsed" },
    { name: "401", response: () => new Response('{"error":"invalid_client"}', { status: 401 }), stage: "http_response", category: "PROVIDER_REJECTION", body: "parsed" },
    { name: "502 invalid JSON", response: () => new Response("private html", { status: 502 }), stage: "http_response", category: "PROVIDER_REJECTION", body: "failed" },
    { name: "400 body read failure", response: () => unreadable(400), stage: "http_response", category: "PROVIDER_REJECTION", body: "failed" },
    { name: "200 invalid JSON", response: () => new Response("private html"), stage: "response_body", category: "MALFORMED_RESPONSE", body: "failed" },
    { name: "200 body read failure", response: () => unreadable(200), stage: "response_body", category: "MALFORMED_RESPONSE", body: "failed" },
    { name: "missing fields", response: () => new Response('{"access_token":"AT"}'), stage: "token_fields", category: "MISSING_FIELDS", body: "parsed" },
    { name: "null JSON", response: () => new Response("null"), stage: "token_fields", category: "MISSING_FIELDS", body: "parsed" },
  ])("one terminal diagnostic and unchanged classification: $name", async (scenario) => {
    const onDiagnostic = vi.fn();
    globalThis.fetch = vi.fn(async () => {
      if (scenario.error) throw scenario.error();
      return scenario.response!();
    }) as typeof fetch;
    const call = exchangeAuthorizationCode("synthetic-code", "synthetic-verifier", TEST_CONFIG, { onDiagnostic });
    if (scenario.category) await expect(call).rejects.toMatchObject({ category: scenario.category });
    else await expect(call).resolves.toEqual({ accessToken: "AT", idToken: "IDT" });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
    const diagnostic = onDiagnostic.mock.calls[0][0];
    expect(diagnostic).toMatchObject({
      stage: scenario.stage, category: scenario.category,
      outcome: scenario.category ? "failure" : "success", bodyOutcome: scenario.body,
    });
    expect(Object.keys(diagnostic).sort()).toEqual([
      "bodyOutcome", "category", "causeCode", "code", "durationMs", "oauthError", "outcome", "stage", "status",
    ].sort());
    expect(Number.isFinite(diagnostic.durationMs)).toBe(true);
    expect(diagnostic.durationMs).toBeGreaterThanOrEqual(0);
    if (scenario.name === "connect timeout") expect(diagnostic.causeCode).toBe("UND_ERR_CONNECT_TIMEOUT");
  });

  it.each(["success", "failure"] as const)("throwing observer preserves %s", async (outcome) => {
    const onDiagnostic = vi.fn(() => { throw new Error("observer private failure"); });
    globalThis.fetch = vi.fn(async () => {
      if (outcome === "failure") throw networkError("ECONNRESET");
      return new Response('{"access_token":"AT","id_token":"IDT"}');
    }) as typeof fetch;
    const call = exchangeAuthorizationCode("code", "verifier", TEST_CONFIG, { onDiagnostic });
    if (outcome === "success") await expect(call).resolves.toEqual({ accessToken: "AT", idToken: "IDT" });
    else await expect(call).rejects.toMatchObject({ category: "NETWORK_FAILURE", causeCode: "ECONNRESET" });
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
  });

  it("handles an asynchronously rejected observer without changing exchange", async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"access_token":"AT","id_token":"IDT"}')) as typeof fetch;
    const onDiagnostic = vi.fn(async () => { throw new Error("observer private rejection"); });
    await expect(exchangeAuthorizationCode("code", "verifier", TEST_CONFIG, { onDiagnostic }))
      .resolves.toEqual({ accessToken: "AT", idToken: "IDT" });
    await Promise.resolve();
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
  });

  it("measures monotonic duration through body parsing", async () => {
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    globalThis.fetch = vi.fn(async () => {
      now = 120;
      return { ok: true, status: 200, json: async () => {
        now = 177;
        return { access_token: "AT", id_token: "IDT" };
      } } as Response;
    }) as typeof fetch;
    const onDiagnostic = vi.fn();
    await exchangeAuthorizationCode("code", "verifier", TEST_CONFIG, { onDiagnostic });
    expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 77 }));
  });

  it("retains the 15-second fetch timeout with no retry", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })));
    })) as typeof fetch;
    const onDiagnostic = vi.fn();
    const call = exchangeAuthorizationCode("code", "verifier", TEST_CONFIG, { onDiagnostic });
    const rejected = expect(call).rejects.toMatchObject({ category: "TIMEOUT", code: "TOKEN_EXCHANGE_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(14999);
    expect(onDiagnostic).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not extend the existing timeout to the response body", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      signal = init!.signal!;
      return { ok: true, status: 200, json: async () => {
        await vi.advanceTimersByTimeAsync(16000);
        expect(signal!.aborted).toBe(false);
        return { access_token: "AT", id_token: "IDT" };
      } } as Response;
    }) as typeof fetch;
    await expect(exchangeAuthorizationCode("code", "verifier", TEST_CONFIG))
      .resolves.toEqual({ accessToken: "AT", idToken: "IDT" });
  });

  it.each(["success", "provider", "network"] as const)("observer and formatter omit synthetic sensitive material: %s", async (kind) => {
    const secrets = Array.from({ length: 12 }, (_, i) => `SENSITIVE_SENTINEL_${i}_NEVER_LOG`);
    const cfg = { ...TEST_CONFIG, clientId: secrets[0], clientSecret: secrets[1], redirectUri: `https://example.invalid/callback?code=${secrets[2]}` };
    globalThis.fetch = vi.fn(async () => {
      if (kind === "network") throw Object.assign(new Error(secrets.join(" ")), { code: secrets[3], cause: { code: secrets[4] } });
      return new Response(JSON.stringify({
        access_token: secrets[5], id_token: secrets[6], refresh_token: secrets[7],
        state: secrets[8], nonce: secrets[9], cookie: secrets[10], headers: secrets[11],
        error: secrets[3], error_description: secrets.join(" "),
      }), { status: kind === "provider" ? 401 : 200 });
    }) as typeof fetch;
    const onDiagnostic = vi.fn();
    await exchangeAuthorizationCode(secrets[2], secrets[4], cfg, { onDiagnostic }).catch(() => undefined);
    expect(onDiagnostic).toHaveBeenCalledTimes(1);
    const d = onDiagnostic.mock.calls[0][0];
    const output = JSON.stringify(d) + formatOAuthExchangeDiagnostic(d);
    for (const secret of [...secrets, cfg.redirectUri]) expect(output).not.toContain(secret);
    expect(d.causeCode).toBeUndefined();
    expect(d.oauthError).toBeUndefined();
  });

  it("formatter rejects arbitrary fields, enum values, and injected log lines", () => {
    const marker = "SECRET_SENTINEL\nFORGED_LOG";
    const diagnostic = {
      stage: marker, outcome: marker, category: marker, code: marker,
      causeCode: marker, oauthError: marker, bodyOutcome: marker,
      durationMs: NaN, status: marker, token: marker, error: new Error(marker),
    } as unknown as OAuthExchangeDiagnostic;
    const output = formatOAuthExchangeDiagnostic(diagnostic);
    expect(output).not.toContain(marker);
    expect(output).not.toContain("\n");
    expect(output).toContain("code=TOKEN_EXCHANGE_UNEXPECTED_ERROR");
    expect(output).toContain("durationMs=0");
  });

  it("library never writes diagnostic logs directly", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => new Response('{"access_token":"AT","id_token":"IDT"}')) as typeof fetch;
    await exchangeAuthorizationCode("code", "verifier", TEST_CONFIG, { onDiagnostic: vi.fn() });
    globalThis.fetch = vi.fn(async () => { throw networkError("ECONNRESET"); }) as typeof fetch;
    await expect(exchangeAuthorizationCode("code", "verifier", TEST_CONFIG, { onDiagnostic: vi.fn() })).rejects.toThrow();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------
// ID Token verification — ES256 real keys, issuer/audience/nonce/expiry
// ------------------------------------------------------------
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
const JWKS = { keys: [{ ...publicJwk, kid: "test-key-1", alg: "ES256" }] };

async function signIdToken(claims: Record<string, unknown>, opts: { kid?: string; key?: unknown } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: opts.kid ?? "test-key-1" })
    .sign((opts.key ?? privateKey) as never);
}

function baseClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: ROBLOX_ISSUER,
    aud: "test-client-id",
    nonce: "n-abc",
    sub: "123456789",
    preferred_username: "RobloxUser",
    name: "Roblox User",
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  };
}

describe("verifyRobloxIdToken (OIDC)", () => {
  it("accepts valid ES256 token and maps sub->robloxId", async () => {
    const idToken = await signIdToken(baseClaims());
    const identity = await verifyRobloxIdToken(idToken, {
      clientId: "test-client-id",
      expectedNonce: "n-abc",
      jwks: JWKS,
    });
    expect(identity.robloxId).toBe(123456789n);
    expect(identity.username).toBe("RobloxUser");
    expect(identity.displayName).toBe("Roblox User");
  });

  it("rejects invalid signature (wrong EC key)", async () => {
    const { privateKey: otherKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const idToken = await signIdToken(baseClaims(), { key: otherKey });
    await expect(
      verifyRobloxIdToken(idToken, { clientId: "test-client-id", expectedNonce: "n-abc", jwks: JWKS })
    ).rejects.toThrow();
  });

  it("rejects invalid issuer", async () => {
    const idToken = await signIdToken(baseClaims({ iss: "https://evil.example/oauth/" }));
    await expect(
      verifyRobloxIdToken(idToken, { clientId: "test-client-id", expectedNonce: "n-abc", jwks: JWKS })
    ).rejects.toThrow();
  });

  it("rejects invalid audience", async () => {
    const idToken = await signIdToken(baseClaims({ aud: "other-client" }));
    await expect(
      verifyRobloxIdToken(idToken, { clientId: "test-client-id", expectedNonce: "n-abc", jwks: JWKS })
    ).rejects.toThrow();
  });

  it("rejects invalid nonce", async () => {
    const idToken = await signIdToken(baseClaims({ nonce: "WRONG" }));
    await expect(
      verifyRobloxIdToken(idToken, { clientId: "test-client-id", expectedNonce: "n-abc", jwks: JWKS })
    ).rejects.toThrow("Nonce tidak cocok");
  });

  it("rejects expired ID Token", async () => {
    const idToken = await signIdToken(baseClaims({ exp: Math.floor(Date.now() / 1000) - 60 }));
    await expect(
      verifyRobloxIdToken(idToken, { clientId: "test-client-id", expectedNonce: "n-abc", jwks: JWKS })
    ).rejects.toThrow();
  });

  it("rejects invalid subject (non-numeric sub)", async () => {
    const idToken = await signIdToken(baseClaims({ sub: "not-a-number" }));
    await expect(
      verifyRobloxIdToken(idToken, { clientId: "test-client-id", expectedNonce: "n-abc", jwks: JWKS })
    ).rejects.toThrow("Subject tidak valid");
  });

  it("rejects HS256-signed token (algorithm allowlist ES256 only)", async () => {
    const hs256Token = await new SignJWT(baseClaims())
      .setProtectedHeader({ alg: "HS256", kid: "test-key-1" })
      .sign(new Uint8Array(32).fill(3));
    await expect(
      verifyRobloxIdToken(hs256Token, { clientId: "test-client-id", expectedNonce: "n-abc", jwks: JWKS })
    ).rejects.toThrow();
  });
});
