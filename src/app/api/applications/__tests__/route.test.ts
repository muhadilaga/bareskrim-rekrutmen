import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Prisma: seluruh jalur API diuji tanpa database nyata.
const mockPrisma = {
  recruitmentPeriod: {
    findFirst: vi.fn(),
  },
  application: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Import setelah mock agar modul memakai mock
const { POST } = await import("../route");

const OPEN_PERIOD = { id: "period-1", code: "XLI-02" };

let ipCounter = 0;
function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  ipCounter += 1;
  return new Request("http://localhost:3000/api/applications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // IP unik per request: hindari rate limiter in-memory membatalkan antar-test
      "x-forwarded-for": `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Budi Santoso",
    robloxUsername: "BudiReskrim_01",
    discordId: "@budi_reskrim",
    birthDate: "2005-08-17",
    gender: "L",
    origin: "Ternate",
    experience: "Pengalaman 2 tahun di POLRI RBX sebagai penyidik.",
    motivation: "Ingin bergabung dengan Pusdik Reserse untuk berkembang.",
    agreement: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Pastikan env DB di-set agar guard placeholder tidak aktif di test ini
  process.env.DATABASE_URL = "postgresql://user:pass@db.internal:5432/test";
  process.env.DIRECT_URL = "postgresql://user:pass@db.internal:5432/test";
});

describe("POST /api/applications — Hardening Tests", () => {
  it("rejects invalid JSON body (400)", async () => {
    const res = await POST(makeReq("invalid-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("rejects oversized body (413)", async () => {
    const bigBody = validPayload({ motivation: "x".repeat(20000) });
    const res = await POST(makeReq(bigBody));
    expect(res.status).toBe(413);
  });

  it("rejects cross-origin requests (403)", async () => {
    const res = await POST(
      makeReq(validPayload(), {
        origin: "http://evil.example.com",
        host: "localhost:3000",
      })
    );
    expect(res.status).toBe(403);
  });

  it("rejects invalid birth date — masa depan (400)", async () => {
    const res = await POST(makeReq(validPayload({ birthDate: "2999-01-01" })));
    expect(res.status).toBe(400);
  });

  it("rejects missing agreement (400)", async () => {
    const res = await POST(makeReq(validPayload({ agreement: false })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("rejects over-length input (400)", async () => {
    const res = await POST(makeReq(validPayload({ fullName: "a".repeat(300) })));
    expect(res.status).toBe(400);
  });

  it("returns 403 when no recruitment period is open", async () => {
    mockPrisma.recruitmentPeriod.findFirst.mockResolvedValue(null);
    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("tidak sedang dibuka");
  });

  it("returns 409 on duplicate submission (pre-check)", async () => {
    mockPrisma.recruitmentPeriod.findFirst.mockResolvedValue(OPEN_PERIOD);
    mockPrisma.application.findFirst.mockResolvedValue({ id: "app-existing" });
    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("sudah terdaftar");
  });

  it("handles concurrent duplicate via P2002 (409)", async () => {
    mockPrisma.recruitmentPeriod.findFirst.mockResolvedValue(OPEN_PERIOD);
    mockPrisma.application.findFirst.mockResolvedValue(null);
    mockPrisma.application.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["recruitmentPeriodId", "robloxUsernameKey"] },
    });
    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(409);
  });

  it("retries registrationId collision (P2002 lain) lalu sukses (201)", async () => {
    mockPrisma.recruitmentPeriod.findFirst.mockResolvedValue(OPEN_PERIOD);
    mockPrisma.application.findFirst.mockResolvedValue(null);
    mockPrisma.application.create
      .mockRejectedValueOnce({ code: "P2002", meta: { target: ["registrationId"] } })
      .mockResolvedValueOnce({
        id: "app-1",
        registrationId: "XLI-02-1234",
        status: "MENUNGGU_VERIFIKASI",
        createdAt: new Date("2026-10-02T10:00:00Z"),
      });
    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.registrationId).toBe("XLI-02-1234");
    expect(body.data.accessToken).toMatch(/^XLI-02/);
  });

  it("returns 409 generik when repeated P2002 collisions exhaust retries", async () => {
    mockPrisma.recruitmentPeriod.findFirst.mockResolvedValue(OPEN_PERIOD);
    mockPrisma.application.findFirst.mockResolvedValue(null);
    mockPrisma.application.create.mockRejectedValue({
      code: "P2002",
      meta: { target: ["registrationId"] },
    });
    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(409);
  });

  it("returns generic 500 on unexpected DB error without leaking details", async () => {
    mockPrisma.recruitmentPeriod.findFirst.mockResolvedValue(OPEN_PERIOD);
    mockPrisma.application.findFirst.mockResolvedValue(null);
    mockPrisma.application.create.mockRejectedValue(
      new Error("relation 'Application' does not exist on the current schema")
    );
    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("relation");
    expect(text).not.toContain("schema");
    expect(text).not.toContain("Application");
  });

  it("returns 503 when DB unavailable (placeholder guard)", async () => {
    process.env.DATABASE_URL = "postgresql://placeholder:***@localhost:5432/placeholder";
    process.env.DIRECT_URL = "postgresql://placeholder:***@localhost:5432/placeholder";
    const res = await POST(makeReq(validPayload()));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Database development belum tersedia");
  });
});
