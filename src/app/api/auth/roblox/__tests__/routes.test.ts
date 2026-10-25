import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock Prisma + next/headers cookies untuk route tests
const mockPrisma = {
  oAuthState: {
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
  },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

// Patch verifyRobloxIdToken: verifikasi lokal via jose + JWKS lokal (tanpa network).
let localKeyPair: { privateKey: unknown } | null = null;
vi.mock("@/lib/oauth", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    verifyRobloxIdToken: vi.fn(async (idToken: string, opts: { expectedNonce: string }) => {
      const { jwtVerify, createLocalJWKSet } = await import("jose");
      const jwk = (globalThis as unknown as { __testJwk: Record<string, unknown> }).__testJwk;
      const jwks = { keys: [{ ...jwk, kid: "local-1", alg: "ES256" }] };
      const { payload } = await jwtVerify(idToken, createLocalJWKSet(jwks as never) as never, {
        algorithms: ["ES256"],
        issuer: "https://apis.roblox.com/oauth/",
        audience: "test-client-id",
      });
      if (payload.nonce !== opts.expectedNonce) throw new Error("Nonce tidak cocok");
      const sub = String(payload.sub ?? "");
      if (!/^\d+$/.test(sub)) throw new Error("Subject tidak valid"); // mirror lib nyata
      return {
        robloxId: BigInt(sub),
        username: String(payload.preferred_username ?? ""),
        displayName: String(payload.name ?? ""),
      };
    }),
  };
});

const { signTrustedSession, verifyTrustedSessionToken } = await import("@/lib/auth");
const { encryptSecret } = await import("@/lib/oauth");
const { GET: startGET } = await import("@/app/api/auth/roblox/start/route");
const { GET: callbackGET } = await import("@/app/api/auth/roblox/callback/route");

const ENV_KEYS = [
  "OAUTH_STATE_ENCRYPTION_KEY",
  "ROBLOX_OAUTH_CLIENT_ID",
  "ROBLOX_OAUTH_CLIENT_SECRET",
  "ROBLOX_OAUTH_REDIRECT_URI",
  "JWT_SECRET",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.OAUTH_STATE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.ROBLOX_OAUTH_CLIENT_ID = "test-client-id";
  process.env.ROBLOX_OAUTH_CLIENT_SECRET = "test-client-secret";
  process.env.ROBLOX_OAUTH_REDIRECT_URI = "http://localhost:3000/api/auth/roblox/callback";
  process.env.JWT_SECRET = "test-jwt-secret-minimum-32-chars-abcdef";
  cookieJar.clear();
  mockPrisma.oAuthState.create.mockReset().mockResolvedValue(undefined);
  mockPrisma.oAuthState.updateMany.mockReset().mockResolvedValue({ count: 1 });
  mockPrisma.oAuthState.findUnique.mockReset().mockResolvedValue(null);
  mockPrisma.user.upsert.mockReset().mockResolvedValue({ id: "user-1" });
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  const g = globalThis as unknown as { __origFetch?: typeof fetch };
  if (g.__origFetch) globalThis.fetch = g.__origFetch;
});

// ------------------------------------------------------------
// Route: GET /api/auth/roblox/start
// ------------------------------------------------------------
describe("GET /api/auth/roblox/start", () => {
  function req(url = "http://localhost:3000/api/auth/roblox/start") {
    return new Request(url, { method: "GET" });
  }

  it("missing config -> 503 OAUTH_NOT_CONFIGURED", async () => {
    delete process.env.ROBLOX_OAUTH_CLIENT_ID;
    delete process.env.ROBLOX_OAUTH_CLIENT_SECRET;
    delete process.env.ROBLOX_OAUTH_REDIRECT_URI;
    const res = await startGET(req());
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("OAUTH_NOT_CONFIGURED");
  });

  it("state persistence failure -> 503, safe rejection", async () => {
    mockPrisma.oAuthState.create.mockRejectedValue(new Error("db down"));
    const res = await startGET(req());
    expect(res.status).toBe(503);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("OAUTH_STATE_FAILED");
  });

  it("happy path: creates OAuthState, sets correlation cookie, redirects to Roblox", async () => {
    const res = await startGET(req("https://localhost:3000/api/auth/roblox/start"));
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("https://apis.roblox.com/oauth/v1/authorize")).toBe(true);
    const q = new URL(location).searchParams;
    expect(q.get("client_id")).toBe("test-client-id");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("scope")).toBe("openid profile");
    expect(q.get("redirect_uri")).toBe("http://localhost:3000/api/auth/roblox/callback");
    expect(location).not.toContain("test-client-secret");
    // DB record: verifier terenkripsi, bukan plaintext
    const createArgs = mockPrisma.oAuthState.create.mock.calls[0]![0] as {
      data: { codeVerifier: string; stateId: string; state: string };
    };
    expect(createArgs.data.codeVerifier).not.toContain(";");
    const { decryptSecret } = await import("@/lib/oauth");
    expect(decryptSecret(createArgs.data.codeVerifier, Buffer.alloc(32, 7))).toBeTruthy();
    // Cookie: hanya stateId correlation (bukan verifier/state)
    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toContain("brk_oauth_sid=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    const cookieValue = setCookie.split("brk_oauth_sid=")[1]!.split(";")[0];
    expect(cookieValue).toBe(createArgs.data.stateId);
    expect(cookieValue).not.toBe(createArgs.data.state);
  });
});

// ------------------------------------------------------------
// Route: GET /api/auth/roblox/callback
// ------------------------------------------------------------
describe("GET /api/auth/roblox/callback", () => {
  const STATE_ID = "a".repeat(64);
  const STATE = "b".repeat(64);
  const NONCE = "c".repeat(64);

  function cbReq(params: Record<string, string>, withCookie = true) {
    const url = new URL("http://localhost:3000/api/auth/roblox/callback");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = {};
    if (withCookie) headers.cookie = `brk_oauth_sid=${STATE_ID}`;
    return new Request(url, { headers });
  }

  function primeConsume() {
    mockPrisma.oAuthState.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.oAuthState.findUnique.mockResolvedValue({
      codeVerifier: encryptSecret("raw-verifier", Buffer.alloc(32, 7)),
      nonce: NONCE,
    });
  }

  function stubFetch(handler: (url: string) => Response | Promise<Response>) {
    const g = globalThis as unknown as { __origFetch?: typeof fetch };
    if (!g.__origFetch) g.__origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: unknown) => handler(String(url))) as never;
  }

  function mockRoblox(idToken: string) {
    stubFetch((u) => {
      if (u.includes("/oauth/v1/token")) {
        return new Response(JSON.stringify({ access_token: "AT", id_token: idToken }), { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    });
  }

  async function fakeIdToken(claims: Record<string, unknown>) {
    const { generateKeyPairSync } = await import("node:crypto");
    const { SignJWT } = await import("jose");
    if (!localKeyPair) {
      const kp = generateKeyPairSync("ec", { namedCurve: "P-256" });
      localKeyPair = { privateKey: kp.privateKey };
      (globalThis as unknown as { __testJwk: unknown }).__testJwk = kp.publicKey.export({ format: "jwk" });
    }
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "local-1" })
      .sign(localKeyPair.privateKey as never);
  }

  const baseClaims = (o: Record<string, unknown> = {}) => ({
    iss: "https://apis.roblox.com/oauth/",
    aud: "test-client-id",
    nonce: NONCE,
    sub: "777888999",
    preferred_username: "TrustedUser",
    name: "Trusted User",
    exp: Math.floor(Date.now() / 1000) + 300,
    ...o,
  });

  it("missing params -> redirect login with error", async () => {
    const res = await callbackGET(cbReq({}, false));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login?error=missing_params");
  });

  it("oauth error param -> oauth_denied", async () => {
    const res = await callbackGET(cbReq({ error: "access_denied" }));
    expect(res.headers.get("location")).toContain("/login?error=oauth_denied");
  });

  it("state mismatch (count 0) -> invalid_or_expired_state", async () => {
    mockPrisma.oAuthState.updateMany.mockResolvedValue({ count: 0 });
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=invalid_or_expired_state");
  });

  it("expired state (count 0) -> invalid_or_expired_state", async () => {
    mockPrisma.oAuthState.updateMany.mockResolvedValue({ count: 0 });
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=invalid_or_expired_state");
  });

  it("replayed callback: first OK, second rejected", async () => {
    primeConsume();
    mockRoblox(await fakeIdToken(baseClaims()));
    const first = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(first.headers.get("location")).toContain("/dashboard");
    // Konsumsi kedua -> count 0 (replay ditolak)
    mockPrisma.oAuthState.updateMany.mockResolvedValue({ count: 0 });
    const second = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(second.headers.get("location")).toContain("/login?error=invalid_or_expired_state");
  });

  it("invalid authorization code -> token_exchange_failed, NO trusted cookie", async () => {
    primeConsume();
    stubFetch(() => new Response("bad", { status: 400 }));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=token_exchange_failed");
    expect(cookieJar.has("brk_token")).toBe(false);
  });

  it("invalid ID Token signature -> invalid_id_token, NO trusted cookie", async () => {
    primeConsume();
    mockRoblox("garbage.token.here");
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=invalid_id_token");
    expect(cookieJar.has("brk_token")).toBe(false);
  });

  it("token endpoint unavailable -> token_exchange_failed", async () => {
    primeConsume();
    stubFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=token_exchange_failed");
    expect(cookieJar.has("brk_token")).toBe(false);
  });

  it("invalid nonce -> invalid_id_token", async () => {
    primeConsume();
    mockRoblox(await fakeIdToken(baseClaims({ nonce: "WRONG-NONCE" })));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=invalid_id_token");
  });

  it("invalid issuer -> invalid_id_token", async () => {
    primeConsume();
    mockRoblox(await fakeIdToken(baseClaims({ iss: "https://evil.example/oauth/" })));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=invalid_id_token");
  });

  it("invalid audience -> invalid_id_token", async () => {
    primeConsume();
    mockRoblox(await fakeIdToken(baseClaims({ aud: "other-client" })));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=invalid_id_token");
  });

  it("expired ID Token -> invalid_id_token", async () => {
    primeConsume();
    mockRoblox(await fakeIdToken(baseClaims({ exp: Math.floor(Date.now() / 1000) - 60 })));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=invalid_id_token");
  });

  it("invalid subject (non-numeric sub) -> rejected at ID token verification", async () => {
    primeConsume();
    mockRoblox(await fakeIdToken(baseClaims({ sub: "not-a-number" })));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    // Lib verifyRobloxIdToken menolak sub non-numerik -> invalid_id_token
    expect(res.headers.get("location")).toContain("/login?error=invalid_id_token");
    expect(cookieJar.has("brk_token")).toBe(false);
  });

  it("numeric but invalid sub (0) -> identity_invalid", async () => {
    primeConsume();
    mockRoblox(await fakeIdToken(baseClaims({ sub: "0" })));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=identity_invalid");
    expect(cookieJar.has("brk_token")).toBe(false);
  });

  it("user upsert failure -> user_reconciliation_failed, NO session", async () => {
    primeConsume();
    mockRoblox(await fakeIdToken(baseClaims({ sub: "42", preferred_username: "Ok", name: "Ok" })));
    mockPrisma.user.upsert.mockRejectedValue(new Error("P2002 unique"));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.headers.get("location")).toContain("/login?error=user_reconciliation_failed");
    expect(cookieJar.has("brk_token")).toBe(false);
  });

  it("HAPPY PATH: trusted v2 session issued, sub->robloxId, state cookie cleared", async () => {
    primeConsume();
    mockRoblox(await fakeIdToken(baseClaims()));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/dashboard");
    // User upsert memakai robloxId dari sub (bukan input browser)
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { robloxId: 777888999n } })
    );
    // Cookie brk_token diterbitkan via cookies() dengan klaim trusted v2
    expect(cookieJar.has("brk_token")).toBe(true);
    const token = cookieJar.get("brk_token")!;
    const payload = await verifyTrustedSessionToken(token);
    expect(payload?.authVersion).toBe(2);
    expect(payload?.authMethod).toBe("ROBLOX_OIDC");
    expect(payload?.isOwnershipVerified).toBe(true);
    expect(payload?.robloxId).toBe(777888999);
    // Cookie state dihapus pada respons (Max-Age 0) — urutan atribut bebas
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("brk_oauth_sid=");
    expect(setCookie.toLowerCase()).toContain("max-age=0");
    // Tidak ada secret/verifier bocor di redirect
    const loc = res.headers.get("location")!;
    expect(loc).not.toContain("raw-verifier");
    expect(loc).not.toContain("test-client-secret");
  });

  it("no credential leakage in any error response", async () => {
    primeConsume();
    stubFetch(() => new Response("bad", { status: 500 }));
    const res = await callbackGET(cbReq({ code: "X", state: STATE }));
    const body = await res.text();
    expect(body).not.toContain("test-client-secret");
    expect(body).not.toContain("raw-verifier");
    expect(res.headers.get("location")).not.toContain("secret");
  });

  it("trusted session sign/verify pair works standalone", async () => {
    const token = await signTrustedSession({ userId: "u-standalone", robloxId: 555 });
    const payload = await verifyTrustedSessionToken(token);
    expect(payload?.authVersion).toBe(2);
    expect(payload?.userId).toBe("u-standalone");
  });

  describe("safe runtime observability", () => {
    beforeEach(() => {
      vi.spyOn(console, "info").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    function logs(): string[] {
      return [console.info, console.warn, console.error]
        .flatMap((logger) => vi.mocked(logger).mock.calls)
        .map((args) => {
          expect(args).toHaveLength(1);
          expect(typeof args[0]).toBe("string");
          return args[0] as string;
        });
    }
    const terminalLogs = () => logs().filter((line) => /\[ROBLOX_OAUTH_EXCHANGE_(?:SUCCEEDED|FAILED)\]/.test(line));
    const correlation = (line: string) => line.match(/correlationId=([a-f0-9-]{36})/)?.[1];

    it("logs exchange success once and generates a fresh independent UUID per callback", async () => {
      primeConsume();
      mockRoblox(await fakeIdToken(baseClaims()));
      const first = await callbackGET(cbReq({ code: "SYNTHETIC_CODE_A", state: STATE }));
      const second = await callbackGET(cbReq({ code: "SYNTHETIC_CODE_B", state: STATE }));
      expect(first.headers.get("location")).toContain("/dashboard");
      expect(second.headers.get("location")).toContain("/dashboard");
      const lines = terminalLogs();
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        expect(line).toContain("[ROBLOX_OAUTH_EXCHANGE_SUCCEEDED]");
        expect(line).toContain("stage=complete");
        expect(line).toContain("outcome=success");
        expect(line).toMatch(/durationMs=\d+/);
        expect(correlation(line)).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
        for (const forbidden of [STATE, STATE_ID, NONCE, "SYNTHETIC_CODE_A", "SYNTHETIC_CODE_B"]) expect(line).not.toContain(forbidden);
      }
      expect(correlation(lines[0])).not.toBe(correlation(lines[1]));
      expect(console.warn).not.toHaveBeenCalled();
    });

    it.each([
      { name: "connect timeout", stage: "fetch", category: "NETWORK_FAILURE", cause: "UND_ERR_CONNECT_TIMEOUT" },
      { name: "abort", stage: "fetch", category: "TIMEOUT", cause: "N/A" },
      { name: "provider bad JSON", stage: "http_response", category: "PROVIDER_REJECTION", cause: "N/A" },
      { name: "success response bad JSON", stage: "response_body", category: "MALFORMED_RESPONSE", cause: "N/A" },
      { name: "missing token", stage: "token_fields", category: "MISSING_FIELDS", cause: "N/A" },
    ])("one safe failure log without retry or session: $name", async (scenario) => {
      primeConsume();
      stubFetch(() => {
        if (scenario.name === "connect timeout") throw Object.assign(new TypeError("private details"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
        if (scenario.name === "abort") throw Object.assign(new Error("private abort"), { name: "AbortError" });
        if (scenario.name === "provider bad JSON") return new Response("private body", { status: 502 });
        if (scenario.name === "success response bad JSON") return new Response("private body", { status: 200 });
        return new Response('{"access_token":"PRIVATE_ACCESS_TOKEN"}');
      });
      const res = await callbackGET(cbReq({ code: "PRIVATE_CODE", state: STATE }));
      expect(res.headers.get("location")).toContain("/login?error=token_exchange_failed");
      expect(res.headers.get("set-cookie")?.toLowerCase()).toContain("max-age=0");
      expect(cookieJar.has("brk_token")).toBe(false);
      expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(mockPrisma.oAuthState.updateMany).toHaveBeenCalledTimes(1);
      const lines = terminalLogs();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("[ROBLOX_OAUTH_EXCHANGE_FAILED]");
      expect(lines[0]).toContain(`stage=${scenario.stage}`);
      expect(lines[0]).toContain(`category=${scenario.category}`);
      expect(lines[0]).toContain(`causeCode=${scenario.cause}`);
      if (scenario.name === "provider bad JSON") {
        expect(lines[0]).toContain("status=502");
        expect(lines[0]).toContain("bodyOutcome=failed");
      }
      expect(console.info).not.toHaveBeenCalled();
      expect(logs().join(" ")).not.toContain("private");
      expect(logs().join(" ")).not.toContain("PRIVATE");
    });

    it("correlates verification failure with completed exchange without declaring login success", async () => {
      primeConsume();
      mockRoblox("PRIVATE_INVALID_ID_TOKEN");
      const res = await callbackGET(cbReq({ code: "PRIVATE_CODE", state: STATE }));
      expect(res.headers.get("location")).toContain("/login?error=invalid_id_token");
      expect(cookieJar.has("brk_token")).toBe(false);
      expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
      const exchange = terminalLogs();
      const verification = logs().filter((line) => line.startsWith("[ROBLOX_OAUTH_ID_TOKEN_FAILED]"));
      expect(exchange).toHaveLength(1);
      expect(exchange[0]).toContain("EXCHANGE_SUCCEEDED");
      expect(verification).toHaveLength(1);
      expect(correlation(verification[0])).toBe(correlation(exchange[0]));
      expect(verification[0]).toContain("stage=id_token_verification");
      expect(verification[0]).toMatch(/durationMs=\d+/);
      expect(logs().join(" ")).not.toContain("PRIVATE");
    });

    it.each(["success", "exchange_failure", "verification_failure"] as const)(
      "throwing logger does not change authentication: %s", async (scenario) => {
        primeConsume();
        if (scenario === "exchange_failure") stubFetch(() => new Response("private provider body", { status: 401 }));
        else mockRoblox(scenario === "success" ? await fakeIdToken(baseClaims()) : "PRIVATE_INVALID_ID_TOKEN");
        vi.mocked(console.info).mockImplementation(() => { throw new Error("private logger failure"); });
        vi.mocked(console.warn).mockImplementation(() => { throw new Error("private logger failure"); });
        const res = await callbackGET(cbReq({ code: "PRIVATE_CODE", state: STATE }));
        const expected = scenario === "success" ? "/dashboard"
          : scenario === "exchange_failure" ? "/login?error=token_exchange_failed" : "/login?error=invalid_id_token";
        expect(res.headers.get("location")).toContain(expected);
        expect(cookieJar.has("brk_token")).toBe(scenario === "success");
        expect(mockPrisma.user.upsert).toHaveBeenCalledTimes(scenario === "success" ? 1 : 0);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(terminalLogs()).toHaveLength(1);
        expect(console.error).not.toHaveBeenCalled();
      }
    );

    it.each(["success", "provider", "network", "verification"] as const)(
      "actual log arguments never contain sensitive material: %s", async (scenario) => {
        primeConsume();
        const code = "SENTINEL_AUTHORIZATION_CODE";
        const accessToken = "SENTINEL_ACCESS_TOKEN";
        const refreshToken = "SENTINEL_REFRESH_TOKEN";
        const extraHeader = "SENTINEL_HEADER_VALUE";
        const idToken = scenario === "verification" ? "SENTINEL_INVALID_ID_TOKEN" : await fakeIdToken(baseClaims());
        const request = cbReq({ code, state: STATE });
        request.headers.set("x-test-private", extraHeader);
        const forbidden = [
          code, accessToken, refreshToken, idToken, extraHeader,
          STATE_ID, STATE, NONCE, "raw-verifier", "test-client-id", "test-client-secret",
          request.url, request.headers.get("cookie")!, "http://localhost:3000/api/auth/roblox/callback",
        ];
        stubFetch(() => {
          if (scenario === "network") throw Object.assign(new Error(forbidden.join(" ")), {
            code: forbidden.join("\n"), cause: { code: "SENTINEL_UNSAFE_CAUSE" },
          });
          return new Response(JSON.stringify({
            access_token: accessToken, id_token: idToken, refresh_token: refreshToken,
            error: scenario === "provider" ? forbidden.join("\n") : undefined,
            error_description: forbidden.join(" "), state: STATE, nonce: NONCE,
          }), { status: scenario === "provider" ? 401 : 200 });
        });
        await callbackGET(request);
        const output = logs().join("\n");
        expect(terminalLogs()).toHaveLength(1);
        for (const value of forbidden) expect(output).not.toContain(value);
        expect(output).not.toContain("SENTINEL_UNSAFE_CAUSE");
        if (scenario === "provider") {
          expect(output).toContain("category=PROVIDER_REJECTION");
          expect(output).toContain("oauthError=N/A");
        }
      }
    );

    it("does not reactivate consumed state or repeat exchange after a failed attempt", async () => {
      primeConsume();
      stubFetch(() => { throw new Error("private network failure"); });
      const first = await callbackGET(cbReq({ code: "PRIVATE_CODE", state: STATE }));
      expect(first.headers.get("location")).toContain("token_exchange_failed");
      mockPrisma.oAuthState.updateMany.mockResolvedValue({ count: 0 });
      const replay = await callbackGET(cbReq({ code: "PRIVATE_CODE", state: STATE }));
      expect(replay.headers.get("location")).toContain("invalid_or_expired_state");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(terminalLogs()).toHaveLength(1);
      expect(cookieJar.has("brk_token")).toBe(false);
      expect(mockPrisma.oAuthState.updateMany.mock.calls[0][0]).toMatchObject({
        where: { stateId: STATE_ID, state: STATE, consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
    });

    it("logs unexpected exchange exceptions once without message, stack, or raw error", async () => {
      primeConsume();
      const oauth = await import("@/lib/oauth");
      vi.spyOn(oauth, "exchangeAuthorizationCode").mockRejectedValueOnce(
        Object.assign(new Error("SENTINEL_UNEXPECTED_ERROR"), { code: "SENTINEL_UNSAFE_CODE" })
      );
      const res = await callbackGET(cbReq({ code: "PRIVATE_CODE", state: STATE }));
      expect(res.headers.get("location")).toContain("token_exchange_failed");
      const lines = terminalLogs();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("code=TOKEN_EXCHANGE_UNEXPECTED_ERROR");
      expect(lines[0]).not.toContain("SENTINEL");
      expect(cookieJar.has("brk_token")).toBe(false);
    });
  });

});
