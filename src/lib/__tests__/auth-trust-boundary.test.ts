import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";

// ------------------------------------------------------------
// Mocks global
// ------------------------------------------------------------
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));

const mockPrisma = {
  user: { findUnique: vi.fn() },
  examPeriod: { findFirst: vi.fn() },
  attendance: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  examAttempt: { findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/exam-service", () => ({
  startExamSession: vi.fn(),
  submitExam: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logStudentAction: vi.fn() }));
const alwaysOk = { ok: true, retryAfterSeconds: 0 };
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "127.0.0.1",
  submitLimiter: { check: () => alwaysOk },
  userSubmitLimiter: { check: () => alwaysOk },
  verifyLimiter: { check: () => alwaysOk },
  saveLimiter: { check: () => alwaysOk },
  createRateLimiter: () => ({ check: () => alwaysOk }),
}));

const TEST_SECRET = "test-secret-03L2B1-minimum-32-chars!!";
const { getSessionUser, signTrustedSession } = await import("@/lib/auth");
const { startExamSession } = await import("@/lib/exam-service");
const examSessionRoute = await import("@/app/api/exam/session/route");
const examSubmitRoute = await import("@/app/api/exam/submit/route");
const attendanceCheckRoute = await import("@/app/api/attendance/check/route");
const attendanceSubmitRoute = await import("@/app/api/attendance/submit/route");
const { POST: legacyVerifyPOST } = await import("@/app/api/auth/verify/route");
const { linkApplicationToUser } = await import("@/lib/application-service");

const savedSecret = process.env.JWT_SECRET;

async function signRaw(claims: Record<string, unknown>, secret: string, expSeconds = 7200) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expSeconds)
    .sign(new TextEncoder().encode(secret));
}

const LEGACY_CLAIMS = { userId: "user-1", robloxId: 123 };
async function legacyToken() {
  return signRaw(LEGACY_CLAIMS, TEST_SECRET);
}

const USER_ROW = {
  id: "user-1",
  robloxId: 123n,
  username: "TrustedUser",
  displayName: "Trusted User",
  matraBlocked: false,
  policeGroupRankNumber: 5,
};

function reqWithCookie(token: string | null, url = "http://localhost/api/test", method = "GET", body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `brk_token=${token}`;
  return new Request(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  cookieJar.clear();
  mockPrisma.user.findUnique.mockReset().mockResolvedValue(USER_ROW);
  mockPrisma.examPeriod.findFirst.mockReset().mockResolvedValue(null);
  mockPrisma.attendance.findUnique.mockReset().mockResolvedValue(null);
  mockPrisma.examAttempt.findUnique.mockReset().mockResolvedValue({ periodId: "p1", userId: "user-1" });
  vi.mocked(startExamSession).mockReset().mockResolvedValue({
    ok: true,
    attemptId: "att-1",
    questions: [],
    remainingSeconds: 100,
    period: { name: "XLI-02", description: null, examStartTime: null, examEndTime: null },
    savedAnswers: null,
    flaggedQuestions: [],
    bookmarkedQuestions: [],
  });
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

// ------------------------------------------------------------
// PHASE E.1 — Legacy /api/auth/verify tidak menerbitkan cookie login
// ------------------------------------------------------------
describe("E1: legacy /api/auth/verify tidak menerbitkan sesi", () => {
  it("mengembalikan 410 LEGACY_LOGIN_DISABLED tanpa Set-Cookie", async () => {
    const res = await legacyVerifyPOST();
    expect(res.status).toBe(410);
    const json = (await res.json()) as { success: boolean; code: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe("LEGACY_LOGIN_DISABLED");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("tidak memanggil database maupun API Roblox (tombstone murni)", () => {
    // Verifikasi statis: route tidak mengimpor prisma/roblox/auth lib.
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/auth/verify/route.ts"),
      "utf-8"
    );
    expect(src).not.toContain("@/lib/prisma");
    expect(src).not.toContain("@/lib/roblox");
    expect(src).not.toContain("@/lib/auth");
  });
});

// ------------------------------------------------------------
// PHASE E.2–E.7 — Penolakan JWT per karakteristik
// ------------------------------------------------------------
describe("E2–E7: penolakan JWT pada authentication layer (getSessionUser)", () => {
  it("E2: legacy JWT (tanpa klaim trusted) DITOLAK", async () => {
    const user = await getSessionUser(reqWithCookie(await legacyToken()));
    expect(user).toBeNull();
  });

  it("E3: trusted JWT v2 DITERIMA di authentication layer", async () => {
    const token = await signTrustedSession({ userId: "user-1", robloxId: 123 });
    const user = await getSessionUser(reqWithCookie(token));
    expect(user).not.toBeNull();
    expect(user!.id).toBe("user-1");
  });

  it("E4: JWT tanpa authVersion=2 DITOLAK", async () => {
    const token = await signRaw(
      { userId: "user-1", robloxId: 123, authMethod: "ROBLOX_OIDC", isOwnershipVerified: true },
      TEST_SECRET
    );
    expect(await getSessionUser(reqWithCookie(token))).toBeNull();
  });

  it("E5: JWT tanpa ownership verification DITOLAK", async () => {
    const token = await signRaw(
      { userId: "user-1", robloxId: 123, authVersion: 2, authMethod: "ROBLOX_OIDC" },
      TEST_SECRET
    );
    expect(await getSessionUser(reqWithCookie(token))).toBeNull();
  });

  it("E6: JWT dengan signature invalid DITOLAK", async () => {
    const forged = await signRaw(
      { userId: "user-1", robloxId: 123, authVersion: 2, authMethod: "ROBLOX_OIDC", isOwnershipVerified: true },
      "secret-lain-sekali-panjang-32-chars-x"
    );
    expect(await getSessionUser(reqWithCookie(forged))).toBeNull();
  });

  it("E7: session expired DITOLAK", async () => {
    const expired = await new SignJWT({
      userId: "user-1",
      robloxId: 123,
      authVersion: 2,
      authMethod: "ROBLOX_OIDC",
      isOwnershipVerified: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(TEST_SECRET));
    expect(await getSessionUser(reqWithCookie(expired))).toBeNull();
  });
});

// ------------------------------------------------------------
// PHASE E.2 route-level — ujian & absensi menolak legacy JWT
// ------------------------------------------------------------
describe("E2: route ujian dan absensi menolak legacy JWT", () => {
  it("api/exam/session -> 401 untuk legacy JWT", async () => {
    const res = await examSessionRoute.GET(reqWithCookie(await legacyToken(), "http://localhost/api/exam/session"));
    expect(res.status).toBe(401);
  });

  it("api/exam/submit -> 401 untuk legacy JWT", async () => {
    const res = await examSubmitRoute.POST(
      reqWithCookie(await legacyToken(), "http://localhost/api/exam/submit", "POST", { attemptId: "a", answers: [] })
    );
    expect(res.status).toBe(401);
  });

  it("api/attendance/check -> 401 untuk legacy JWT", async () => {
    const res = await attendanceCheckRoute.GET(
      reqWithCookie(await legacyToken(), "http://localhost/api/attendance/check")
    );
    expect(res.status).toBe(401);
  });

  it("api/attendance/submit -> 401 untuk legacy JWT", async () => {
    const res = await attendanceSubmitRoute.POST(
      reqWithCookie(await legacyToken(), "http://localhost/api/attendance/submit", "POST", {
        discordUserId: "someone",
      })
    );
    expect(res.status).toBe(401);
  });
});

// ------------------------------------------------------------
// PHASE E.3 route-level — trusted JWT diterima
// ------------------------------------------------------------
describe("E3: trusted JWT v2 diterima oleh route ujian/absensi", () => {
  it("api/exam/session -> 200 untuk trusted JWT", async () => {
    const token = await signTrustedSession({ userId: "user-1", robloxId: 123 });
    const res = await examSessionRoute.GET(reqWithCookie(token, "http://localhost/api/exam/session"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; attemptId: string };
    expect(json.ok).toBe(true);
    expect(json.attemptId).toBe("att-1");
  });

  it("api/attendance/check -> lolos auth (bukan 401) untuk trusted JWT", async () => {
    const token = await signTrustedSession({ userId: "user-1", robloxId: 123 });
    const res = await attendanceCheckRoute.GET(
      reqWithCookie(token, "http://localhost/api/attendance/check")
    );
    // examPeriod null -> 404 (bukan 401) => lapisan auth menerima sesi
    expect(res.status).toBe(404);
  });
});

// ------------------------------------------------------------
// PHASE E.8 — Tidak ada bypass melalui route alternatif
// ------------------------------------------------------------
describe("E8: tidak ada bypass melalui route alternatif", () => {
  const CONSUMERS = [
    "src/app/api/exam/submit/route.ts",
    "src/app/api/exam/review/route.ts",
    "src/app/api/exam/session/route.ts",
    "src/app/api/exam/report/route.ts",
    "src/app/api/exam/save/route.ts",
    "src/app/api/attendance/submit/route.ts",
    "src/app/api/attendance/check/route.ts",
    "src/app/(app)/ujian/page.tsx",
  ];

  it("semua consumer sesi memakai getSessionUser; tidak ada pembacaan cookie/jwtVerify langsung", () => {
    for (const rel of CONSUMERS) {
      const src = readFileSync(path.join(process.cwd(), rel), "utf-8");
      expect(src, `${rel} harus memakai getSessionUser`).toContain("getSessionUser(");
      expect(src, `${rel} tidak boleh memverifikasi JWT sendiri`).not.toContain("jose");
      expect(src, `${rel} tidak boleh membaca cookies() langsung`).not.toContain("cookies()");
      expect(src, `${rel} tidak boleh memakai penandatangan/penerbit legacy`).not.toMatch(
        /signSession|createSessionCookie|verifyTokenPayload/
      );
    }
  });

  it("tidak ada route di src/app yang membaca brk_token selain lib/auth.ts", () => {
    // Audit statis: satu-satunya pembaca brk_token ada di src/lib/auth.ts
    // (middleware.ts membaca cookie admin brk_admin_verified — jalur terpisah).
    // File __tests__ dikecualikan (hanya berisi string asersi).
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "__tests__" || entry.name === "node_modules") continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          if (readFileSync(full, "utf-8").includes("brk_token")) found.push(full);
        }
      }
    };
    walk(path.join(process.cwd(), "src/app"));
    for (const f of found) {
      expect(f, `${f} tidak boleh menyentuh brk_token`).toContain(path.join("src", "lib", "auth.ts"));
    }
  });
});

// ------------------------------------------------------------
// PHASE E.9 — Trusted login tidak otomatis mengubah ApplicationStatus
// ------------------------------------------------------------
describe("E9: trusted login tidak mengubah ApplicationStatus", () => {
  it("linkApplicationToUser tidak menulis status pada updateMany", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      application: {
        findUnique: vi.fn().mockResolvedValue({
          id: "app-1",
          robloxUsernameKey: "testuser",
          userId: null,
          status: "MENUNGGU_VERIFIKASI",
        }),
        updateMany,
      },
    };
    const result = await linkApplicationToUser(tx as never, {
      applicationId: "app-1",
      userId: "user-1",
      robloxUsername: "TestUser",
    });
    expect(result.success).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const data = JSON.stringify(updateMany.mock.calls[0]![0].data);
    expect(data).not.toContain("status");
    expect(data).not.toContain("DITERIMA");
  });

  it("callback OAuth tidak menyentuh tabel Application", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/api/auth/roblox/callback/route.ts"),
      "utf-8"
    );
    expect(src).not.toMatch(/application\.(upsert|update|create|updateMany)/i);
    expect(src).not.toContain("DITERIMA");
  });
});

// ------------------------------------------------------------
// PHASE E.10 — Permission checks existing tidak dihapus
// ------------------------------------------------------------
describe("E10: permission checks existing tidak dihapus", () => {
  it("guard matra tetap ada di exam session & submit", () => {
    const session = readFileSync(path.join(process.cwd(), "src/app/api/exam/session/route.ts"), "utf-8");
    const submit = readFileSync(path.join(process.cwd(), "src/app/api/exam/submit/route.ts"), "utf-8");
    expect(session).toContain("user.matraBlocked");
    expect(submit).toContain("user.matraBlocked");
  });

  it("guard blacklist & verdict tetap ada di attendance submit", () => {
    const src = readFileSync(path.join(process.cwd(), "src/app/api/attendance/submit/route.ts"), "utf-8");
    expect(src).toContain("blacklistEntry");
    expect(src).toContain("verdictEntry");
  });

  it("guard rank/blacklist/attendance tetap ada di exam-service", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/exam-service.ts"), "utf-8");
    expect(src).toContain("isBlockedByAdminLists");
    expect(src).toContain("RANK_BLOCKED");
    expect(src).toContain("NO_ATTENDANCE");
  });
});
