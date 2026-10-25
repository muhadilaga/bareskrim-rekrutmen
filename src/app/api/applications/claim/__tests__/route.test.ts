import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
const mock = vi.hoisted(() => ({
  secret: "synthetic-claim-route-secret-at-least-32-chars", jar: new Map<string, string>(),
  findUser: vi.fn(), claim: vi.fn(), writeCookie: vi.fn(), sequence: 0,
}));
vi.mock("@/lib/constants", () => ({ getJwtSecret: () => mock.secret }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: (key: string) => ({ value: mock.jar.get(key) }), set: mock.writeCookie }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mock.findUser } } }));
vi.mock("@/lib/student-claim-service", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/student-claim-service")>(), claimApplicationForUser: mock.claim,
}));
import { POST } from "../route";
import { StudentClaimError, type StudentClaimErrorCode } from "@/lib/application-service";

const input = { registrationId: "SYNTHETIC-REG", accessToken: "SYNTHETIC-TOKEN" };
function request(body: unknown = input, headers: Record<string, string> = {}, raw = false) {
  return new Request("http://internal-proxy:3000/api/applications/claim", {
    method: "POST", headers: { origin: "https://portal.example", "content-type": "application/json", ...headers },
    body: raw ? String(body) : JSON.stringify(body),
  });
}
async function token(claims: Record<string, unknown>, expired = false) {
  mock.jar.set("brk_token", await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + (expired ? -60 : 3600)).sign(new TextEncoder().encode(mock.secret)));
}
beforeEach(async () => {
  vi.clearAllMocks(); mock.jar.clear();
  vi.stubEnv("ROBLOX_OAUTH_REDIRECT_URI", "https://portal.example/api/auth/roblox/callback");
  mock.sequence++;
  const userId = `synthetic-user-${mock.sequence}`;
  mock.findUser.mockReset().mockResolvedValue({ id: userId, username: "CasisTest", deletedAt: null });
  mock.claim.mockReset().mockResolvedValue({ success: true, isAlreadyLinked: false });
  await token({ userId, authVersion: 2, authMethod: "ROBLOX_OIDC", isOwnershipVerified: true });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("POST Student Claim", () => {
  it("accepts the configured public origin behind a proxy without trusting forwarded headers", async () => {
    const response = await POST(request(input, { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "http" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, code: "CLAIM_OK", message: "Pendaftaran berhasil dihubungkan." });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mock.writeCookie).not.toHaveBeenCalled();
    expect(mock.claim).toHaveBeenCalledWith(expect.anything(), input, { id: `synthetic-user-${mock.sequence}`, username: "CasisTest", deletedAt: null });
  });
  it.each(["", "null", "https://attacker.example", "https://portal.example.attacker.example", "http://portal.example"])("rejects origin %#", async origin => {
    const response = await POST(request(input, { origin, "x-forwarded-host": "portal.example" }));
    expect(response.status).toBe(403); expect(mock.claim).not.toHaveBeenCalled();
  });
  it("rejects a missing Origin and a cross-site browser request", async () => {
    const req = request(); req.headers.delete("origin");
    expect((await POST(req)).status).toBe(403);
    expect((await POST(request(input, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  });
  it("fails closed when canonical origin is unavailable", async () => {
    vi.stubEnv("ROBLOX_OAUTH_REDIRECT_URI", "");
    expect((await POST(request())).status).toBe(503);
    expect(mock.claim).not.toHaveBeenCalled();
  });
  it.each(["missing", "invalid", "legacy", "expired", "deleted", "no-user"])("rejects session %s", async kind => {
    if (kind === "missing") mock.jar.clear();
    if (kind === "invalid") mock.jar.set("brk_token", "synthetic-bad-token");
    if (kind === "legacy") await token({ userId: "legacy" });
    if (kind === "expired") await token({ userId: "expired", authVersion: 2, authMethod: "ROBLOX_OIDC", isOwnershipVerified: true }, true);
    if (kind === "deleted") mock.findUser.mockResolvedValue({ id: "deleted", username: "CasisTest", deletedAt: new Date() });
    if (kind === "no-user") mock.findUser.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mock.claim).not.toHaveBeenCalled();
  });
  it.each([{}, null, [], { ...input, userId: "attack" }, { ...input, username: "attack" },
    { ...input, registrationId: "x".repeat(129) }, { ...input, accessToken: "x".repeat(257) },
    { ...input, accessToken: "abc\nxyz" }, { ...input, accessToken: ["abc"] },
  ])("rejects invalid body %# before service access", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mock.claim).not.toHaveBeenCalled();
  });
  it("rejects unsupported content type and malformed JSON", async () => {
    expect((await POST(request(input, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request("{", {}, true))).status).toBe(400);
  });
  it("bounds actual UTF-8 bytes even with a forged small Content-Length", async () => {
    const req = request("界".repeat(800), { "content-length": "1" }, true);
    expect((await POST(req)).status).toBe(413); expect(mock.claim).not.toHaveBeenCalled();
  });
  it("rejects oversized Content-Length before reading", async () => {
    expect((await POST(request(input, { "content-length": "2049" }))).status).toBe(413);
    expect(mock.claim).not.toHaveBeenCalled();
  });
  it("cancels an oversized stream instead of buffering it all", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(1024)); controller.enqueue(new Uint8Array(1025));
    }, cancel });
    const req = new Request("http://internal-proxy/claim", { method: "POST", headers: { origin: "https://portal.example", "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(cancel).toHaveBeenCalled(); expect(mock.claim).not.toHaveBeenCalled();
  });
  it("returns identical public errors for all credential/ownership rejections", async () => {
    let expected: string | undefined;
    for (const code of ["APPLICATION_NOT_FOUND", "INVALID_CREDENTIALS", "ROBLOX_USERNAME_MISMATCH", "APPLICATION_ALREADY_CLAIMED", "APPLICATION_INELIGIBLE"] as StudentClaimErrorCode[]) {
      mock.claim.mockRejectedValue(new StudentClaimError(code, "SYNTHETIC-PRIVATE-DETAIL"));
      const response = await POST(request());
      expect(response.status).toBe(400);
      const body = await response.text();
      if (!expected) expected = body;
      expect(body).toBe(expected);
      expect(body).not.toMatch(/SYNTHETIC|PRIVATE/);
    }
  });
  it("limits by user, regardless of spoofed IP changes", async () => {
    for (let i = 0; i < 5; i++) expect((await POST(request(input, { "x-forwarded-for": `192.0.2.${i}` }))).status).toBe(200);
    const sixth = await POST(request(input, { "x-real-ip": "198.51.100.1" }));
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mock.claim).toHaveBeenCalledTimes(5);
  });
  it("never echoes or logs credentials on database failure", async () => {
    mock.claim.mockRejectedValue(new Error(JSON.stringify(input)));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/SYNTHETIC|registrationId|accessToken/);
    expect(console.error).not.toHaveBeenCalled(); expect(console.log).not.toHaveBeenCalled();
    expect(mock.writeCookie).not.toHaveBeenCalled();
  });
  it("returns unavailable when session database lookup fails", async () => {
    mock.findUser.mockRejectedValue(new Error("private-db-details"));
    const response = await POST(request());
    expect(response.status).toBe(503); expect(mock.claim).not.toHaveBeenCalled();
  });
});
