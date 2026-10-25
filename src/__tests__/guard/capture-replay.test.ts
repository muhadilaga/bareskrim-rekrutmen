import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// TASK 03L.2E.4.10B — Capture-and-replay DIUJI tanpa database.
//
// Modul ini memock `@/lib/prisma`, jadi route produksi benar-benar dieksekusi
// tetapi TIDAK PERNAH menyentuh database: `$queryRaw` yang dipanggil route
// hanya_push ke array dan mengembalikan baris palsu.
//
// Yang dibuktikan di sini:
//   1. Statement yang ditangkap benar-benar berasal dari route produksi
//      (bukan SQL yang diketik ulang di test).
//   2. Pemetaan parameter terturunkan dengan benar untuk 1/2/3 fragmen SET.
//   3. Rebind mengganti nilai tanpa mengubah struktur SQL.
// ============================================================================

const CTX = {
  applicationId: "app-capture",
  userId: "user-capture",
  recruitmentPeriodId: "rp-capture",
  examPeriodId: "ep-capture",
  attemptId: "att-capture",
};

const CAPTURED: Prisma.Sql[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async (q: Prisma.Sql) => {
      CAPTURED.push(q);
      return [{ id: "att-capture" }];
    }),
    examPeriod: {
      findMany: vi.fn(async () => [
        {
          id: CTX.examPeriodId,
          name: "ep",
          description: null,
          recruitmentPeriodId: CTX.recruitmentPeriodId,
          isActive: true,
          isAttendanceOpen: true,
          isExamOpen: true,
          examStartTime: null,
          examEndTime: null,
          seed: 1,
          mcqCount: 1,
          essayCount: 0,
          passThreshold: 70,
          openedAt: null,
          closedAt: null,
          deletedAt: null,
        },
      ]),
    },
    recruitmentPeriod: {
      findUnique: vi.fn(async () => ({
        id: CTX.recruitmentPeriodId,
        code: "RP",
        name: "rp",
        isActive: true,
        openedAt: new Date(),
        closedAt: new Date(),
        deletedAt: null,
      })),
    },
    application: {
      findFirst: vi.fn(async () => ({
        id: CTX.applicationId,
        registrationId: "REG",
        recruitmentPeriodId: CTX.recruitmentPeriodId,
        status: "DITERIMA",
        verifiedAt: new Date(),
        userId: CTX.userId,
        deletedAt: null,
      })),
    },
    attendance: { findFirst: vi.fn(async () => ({})), findUnique: vi.fn(async () => ({})) },
    examAttempt: {
      findFirst: vi.fn(async () => ({
        id: CTX.attemptId,
        userId: CTX.userId,
        periodId: CTX.examPeriodId,
        submittedAt: null,
        deletedAt: null,
      })),
      findUnique: vi.fn(async () => null),
    },
    examResult: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
    blacklistEntry: { findFirst: vi.fn(async () => null) },
    verdictEntry: { findFirst: vi.fn(async () => null) },
    question: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(async () => ({
    id: CTX.userId,
    username: "capture",
    displayName: "Capture",
    discordUsername: null,
    matraBlocked: false,
    deletedAt: null,
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "127.0.0.1",
  createRateLimiter: () => ({ check: () => ({ ok: true, retryAfterSeconds: 0 }) }),
  saveLimiter: { check: () => ({ ok: true, retryAfterSeconds: 0 }) },
  submitLimiter: { check: () => ({ ok: true, retryAfterSeconds: 0 }) },
  userSubmitLimiter: { check: () => ({ ok: true, retryAfterSeconds: 0 }) },
}));

// Impor SETELAH mock terdaftar.
const { deriveParamMap, rebindSql } = await import("../support/params");
const saveRoute = await import("@/app/api/exam/save/route");

function post(body: unknown): Request {
  return new Request("http://127.0.0.1:1/api/exam/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function capture(payload: Record<string, unknown>): Promise<Prisma.Sql> {
  CAPTURED.length = 0;
  const res = await saveRoute.POST(post({ attemptId: CTX.attemptId, ...payload }));
  if (res.status !== 200) throw new Error(`route status ${res.status}`);
  if (CAPTURED.length !== 1) throw new Error(`capture count ${CAPTURED.length}`);
  return CAPTURED[0];
}

beforeEach(() => {
  CAPTURED.length = 0;
});

describe("Capture statement dari route produksi", () => {
  it("1. statement yang ditangkap memuat bentuk produksi yang完整", async () => {
    const sql = await capture({ answers: { q1: "A" } });
    const { statement } = sql.inspect();

    expect(statement).toMatch(/WITH elig AS MATERIALIZED/);
    expect(statement).toMatch(/FOR UPDATE OF a/);
    expect(statement).toMatch(/EXISTS \(SELECT 1 FROM elig\)/);
    expect(statement).toMatch(/RETURNING att\.id/);
    expect(statement).toMatch(/att\."submittedAt"\s+IS NULL/);
    expect(statement).toMatch(/rp\."deletedAt"\s+IS NULL/);
    expect(statement).toMatch(/a\."deletedAt"\s+IS NULL/);
    expect(statement).toMatch(/att\."deletedAt"\s+IS NULL/);
  });

  it("2. nilai request TIDAK pernah masuk ke teks SQL", async () => {
    const sql = await capture({ answers: { q1: "A" } });
    const { statement, values } = sql.inspect();

    expect(statement).not.toContain("att-capture");
    expect(statement).not.toContain("user-capture");
    expect(values).toContain("att-capture");
    expect(values).toContain("user-capture");
  });

  it("3. 1 fragmen SET -> 7 parameter, semua kunci dikenali", async () => {
    const sql = await capture({ answers: { q1: "A" } });
    const { statement, values } = sql.inspect();

    expect(values).toHaveLength(7);
    expect(Object.keys(deriveParamMap(statement)).sort()).toEqual([
      "applicationId",
      "attemptId",
      "attemptPeriodId",
      "attemptUserId",
      "eligibilityUserId",
      "recruitmentPeriodId",
      "savedAnswers",
    ]);
  });

  it("4. 2 fragmen SET -> flagged ikut, indeks attempt bergeser", async () => {
    const one = deriveParamMap((await capture({ answers: { q1: "A" } })).inspect().statement);
    const two = deriveParamMap(
      (await capture({ answers: { q1: "A" }, flaggedQuestions: ["q1"] })).inspect().statement
    );

    expect(two.flaggedQuestions).toBeDefined();
    expect(two.attemptId).toBe(one.attemptId! + 1);
    expect(two.bookmarkedQuestions).toBeUndefined();
  });

  it("5. 3 fragmen SET -> flagged + bookmark keduanya ikut", async () => {
    const sql = await capture({
      answers: { q1: "A" },
      flaggedQuestions: ["q1"],
      bookmarkedQuestions: ["q2"],
    });
    const { statement, values } = sql.inspect();

    expect(values).toHaveLength(9);
    const map = deriveParamMap(statement);
    expect(map.flaggedQuestions).toBeDefined();
    expect(map.bookmarkedQuestions).toBeDefined();
    expect(new Set(Object.values(map)).size).toBe(Object.values(map).length);
  });

  it("6. rebind pada statement生产的: struktur sama, nilai berubah", async () => {
    const original = await capture({ answers: { q1: "A" } });
    const before = original.inspect().statement;

    const rebound = rebindSql(original, {
      applicationId: "APP_X",
      attemptId: "ATT_X",
      attemptUserId: "USER_X",
      attemptPeriodId: "EP_X",
      savedAnswers: JSON.stringify({ q: "Z" }),
    }).inspect();

    expect(rebound.statement).toBe(before);
    expect(rebound.values).toContain("APP_X");
    expect(rebound.values).toContain("ATT_X");
    expect(rebound.values).toContain("USER_X");
    expect(rebound.values).toContain("EP_X");
    expect(rebound.values).toContain(JSON.stringify({ q: "Z" }));
  });

  it("7. JSON hostile tetap parameter, tidak dirangkai", async () => {
    const sql = await capture({ answers: { q1: "'; DROP TABLE \"User\"; --" } });
    const { statement, values } = sql.inspect();

    expect(statement).not.toContain("DROP TABLE");
    expect(values.some((v) => String(v).includes("DROP TABLE"))).toBe(true);
  });

  it("8. kedua tangkapan tidak saling memengaruhi (state bersih)", async () => {
    const a = await capture({ answers: { q1: "A" } });
    const b = await capture({ answers: { q2: "B" } });

    expect(a.inspect().values).not.toEqual(b.inspect().values);
    expect(a.inspect().statement).toBe(b.inspect().statement);
  });
});