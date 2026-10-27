import { describe, expect, it, vi, beforeEach } from "vitest";

const TEST_ADMIN_KEY = "test-admin-key-minimum-32-chars-length-safe";
const STAFF_ROLE_ID = "1471794305499664426";

// Mock audit logger
vi.mock("@/lib/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

// Mock next/headers cookies
const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({
    set: mockCookieSet,
    get: vi.fn(),
  }),
}));

// Set up env for tests
beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_KEY = TEST_ADMIN_KEY;
  process.env.JWT_SECRET = "jwt-secret-minimum-32-chars-safe-for-tests";
  process.env.DISCORD_BOT_TOKEN = "test-bot-token";
  process.env.DISCORD_GUILD_ID = "test-guild-id";
});

describe("POST /api/admin/auth/verify-staff", () => {
  async function callRoute(body: unknown) {
    const { POST } = await import("../verify-staff/route");
    const req = new Request("http://localhost:3000/api/admin/auth/verify-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    return POST(req);
  }

  it("rejects non-JSON or invalid body structure -> 400", async () => {
    const res = await callRoute("not-json");
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Data verifikasi admin tidak valid");
  });

  it("regression: rejects legacy/assumed key 'DiklatReserse' when not matching ADMIN_KEY -> 401", async () => {
    const res = await callRoute({
      adminKey: "DiklatReserse",
      discordUsername: "staff_pusdik",
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toBe("Kunci admin salah.");
  });

  it("rejects arbitrary invalid admin key -> 401", async () => {
    const res = await callRoute({
      adminKey: "wrong-admin-key",
      discordUsername: "staff_pusdik",
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toBe("Kunci admin salah.");
  });

  it("progresses to Discord check when adminKey matches, rejects if Discord member lacks staff role -> 403", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            user: { id: "123456789", username: "staff_pusdik" },
            roles: ["999999999999999999"], // Bukan STAFF_ROLE_ID
          },
        ]),
        { status: 200 }
      )
    );

    try {
      const res = await callRoute({
        adminKey: TEST_ADMIN_KEY,
        discordUsername: "staff_pusdik",
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.message).toContain("tidak memegang role Personel Staff Pusdik");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("success: sets admin session cookie and returns ok when key and staff role match -> 200", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            user: { id: "123456789", username: "staff_pusdik" },
            roles: [STAFF_ROLE_ID],
          },
        ]),
        { status: 200 }
      )
    );

    try {
      const res = await callRoute({
        adminKey: TEST_ADMIN_KEY,
        discordUsername: "staff_pusdik",
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.verifiedAdmin.discordUsername).toBe("staff_pusdik");
      expect(mockCookieSet).toHaveBeenCalledWith(
        "brk_admin_verified",
        expect.any(String),
        expect.objectContaining({ httpOnly: true, path: "/" })
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("step 1 checkKeyOnly: returns ok: true when adminKey is valid -> 200", async () => {
    const res = await callRoute({
      adminKey: TEST_ADMIN_KEY,
      checkKeyOnly: true,
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toContain("Kunci keamanan instruktur valid");
  });

  it("step 1 checkKeyOnly: returns 401 when adminKey is invalid", async () => {
    const res = await callRoute({
      adminKey: "wrong-passcode",
      checkKeyOnly: true,
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Kunci admin salah");
  });

  it("step 2 oauth: verifies via discordAccessToken -> 200", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("/users/@me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: "123456789012345678", username: "staff_oauth" }), { status: 200 })
        );
      }
      if (urlStr.includes("/members/")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { id: "123456789012345678", username: "staff_oauth" },
              roles: [STAFF_ROLE_ID],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response("Not Found", { status: 404 }));
    });

    try {
      const res = await callRoute({
        adminKey: TEST_ADMIN_KEY,
        discordAccessToken: "fake-discord-access-token",
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.verifiedAdmin.discordUsername).toBe("staff_oauth");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
