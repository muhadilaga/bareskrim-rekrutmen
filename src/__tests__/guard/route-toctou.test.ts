import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ============================================================================
// TASK 03L.2E.4.6 — Candidate Guard TOCTOU hardening (jalur route).
//
// Candidate Guard asli dijalankan lewat route. Prisma di-mock dengan
// application.findFirst yang where-aware + queue, sehingga bisa mensimulasikan
// status Application berubah (DITERIMA -> DITOLAK/hilang) ANTARA pemeriksaan
// awal guard dan pemeriksaan final di batas penulisan. exam-service di-mock
// (submitExam).
// ============================================================================

const USER = {
  id: "user-1",
  robloxId: 123n,
  username: "CasisSatu",
  displayName: "Casis Satu",
  discordUsername: null,
  matraBlocked: false,
  policeGroupRankNumber: null,
  deletedAt: null,
  bannedGroupIds: null,
};

const PERIOD = {
  id: "ep-1",
  name: "Periode Ujian 1",
  description: null,
  recruitmentPeriodId: "rp-1",
  isActive: true,
  isAttendanceOpen: true,
  isExamOpen: true,
  seed: 1,
  mcqCount: 15,
  essayCount: 5,
  passThreshold: 70,
  openedAt: new Date("2026-01-01T00:00:00.000Z"),
  closedAt: null,
  deletedAt: null,
};

const RP = {
  id: "rp-1",
  code: "XLI-01",
  name: "Angkatan",
  isActive: true,
  openedAt: new Date("2026-01-01T00:00:00.000Z"),
  closedAt: new Date("2026-02-01T00:00:00.000Z"),
  deletedAt: null,
};

function appFixture(status: string, over: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    registrationId: "XLI-01-ABC123",
    recruitmentPeriodId: "rp-1",
    status,
    verifiedAt: new Date("2026-01-05T00:00:00.000Z"),
    userId: "user-1",
    deletedAt: null,
    ...over,
  };
}

function matchWhere(row: Record<string, unknown> | null, where: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  if (!where) return true;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.periodId !== undefined && row.periodId !== where.periodId) return false;
  if (where.recruitmentPeriodId !== undefined && row.recruitmentPeriodId !== where.recruitmentPeriodId) return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.deletedAt === null && row.deletedAt != null) return false;
  return true;
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["userId", "periodId", "tahap"] },
  });
}

const state: Record<string, unknown> & { applicationQueue: unknown[] } = { applicationQueue: [] };

const mockPrisma = {
  // TASK 03L.2E.4.10B-SQL — save memakai raw SQL satu statement.
  $queryRaw: vi.fn(async () => state.queryRawRows ?? [{ id: "att-1" }]),
  examPeriod: {
    findMany: vi.fn(async () => state.periods),
    findFirst: vi.fn(async () => state.period),
  },
  recruitmentPeriod: { findUnique: vi.fn(async () => state.rp) },
  application: {
    findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
      const row = (state.applicationQueue.length ? state.applicationQueue.shift() : state.application) as
        | Record<string, unknown>
        | null;
      return matchWhere(row, args?.where) ? row : null;
    }),
  },
  attendance: {
    findFirst: vi.fn(async () => state.attendance),
    findUnique: vi.fn(async () => state.attendance),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      if (state.attendanceCreateImpl) return (state.attendanceCreateImpl as () => Promise<unknown>)();
      return { id: "att-new", status: "HADIR", createdAt: new Date("2026-01-09T00:00:00.000Z"), ...args.data };
    }),
  },
  examAttempt: {
    findFirst: vi.fn(async () => state.attempt),
    findUnique: vi.fn(async () => state.attempt),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async () => ({ id: "attempt-new" })),
    delete: vi.fn(async () => ({})),
  },
  examResult: {
    findFirst: vi.fn(async () => state.resultForGuard),
    findUnique: vi.fn(async () => state.resultFull),
    update: vi.fn(async () => ({})),
    create: vi.fn(async () => ({ id: "res-new" })),
  },
  blacklistEntry: { findFirst: vi.fn(async () => null) },
  verdictEntry: { findFirst: vi.fn(async () => null) },
  pendingDiscordReport: { deleteMany: vi.fn(async () => ({})), upsert: vi.fn(async () => ({})) },
  question: { findMany: vi.fn(async () => []) },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => state.user) }));
vi.mock("@/lib/init-schema", () => ({ ensureSchema: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ logStudentAction: vi.fn(async () => {}) }));
vi.mock("@/lib/rate-limit", () => {
  const ok = { ok: true, retryAfterSeconds: 0 };
  return {
    clientIp: () => "127.0.0.1",
    createRateLimiter: () => ({ check: () => ok }),
    saveLimiter: { check: () => ok },
    submitLimiter: { check: () => ok },
    userSubmitLimiter: { check: () => ok },
  };
});
const submitExamMock = vi.fn();
vi.mock("@/lib/exam-service", () => ({
  startExamSession: vi.fn(),
  submitExam: submitExamMock,
}));
const sendDiscordExamReportMock = vi.fn(async () => "msg-1");
vi.mock("@/lib/discord", () => ({ sendDiscordExamReport: sendDiscordExamReportMock }));
vi.mock("@/lib/discord-api", () => ({
  checkDiscordRole: vi.fn(async () => ({ ok: false, hasRole: false })),
  assignDiscordRoleById: vi.fn(async () => ({ ok: true })),
  removeDiscordRoleById: vi.fn(async () => ({ ok: true })),
  assignDiscordRoleAndNickname: vi.fn(async () => ({ ok: true, nicknameOk: true })),
}));

const saveRoute = await import("@/app/api/exam/save/route");
const submitRoute = await import("@/app/api/exam/submit/route");
const reportRoute = await import("@/app/api/exam/report/route");
const attendanceSubmitRoute = await import("@/app/api/attendance/submit/route");

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ownedResult() {
  return {
    id: "res-1",
    attemptId: "att-1",
    score: 80,
    maxScore: 100,
    mcqScore: 60,
    essayScore: 20,
    status: "LULUS",
    passed: true,
    submittedAt: new Date(),
    discordMessageId: null,
    answersJson: [],
    attempt: {
      userId: "user-1",
      user: {
        username: "CasisSatu",
        displayName: "Casis Satu",
        robloxId: 123n,
        avatarUrl: null,
        policeGroupRank: null,
        discordUsername: null,
      },
      period: { name: PERIOD.name },
    },
  };
}

function reset(over: Record<string, unknown> = {}) {
  state.user = USER;
  state.periods = [PERIOD];
  state.period = PERIOD;
  state.rp = RP;
  state.application = appFixture("DITERIMA");
  state.applicationQueue = [];
  state.attendance = null;
  state.attempt = { id: "att-1", userId: "user-1", submittedAt: null, startedAt: new Date() };
  state.resultForGuard = null;
  state.resultFull = null;
  state.attendanceCreateImpl = null;
  Object.assign(state, over);
  vi.clearAllMocks();
}

beforeEach(() => reset());

describe("POST /api/exam/save — final write-boundary re-check", () => {
  it("1. status berubah DITERIMA -> DITOLAK sebelum write -> 403, ExamAttempt TIDAK diupdate", async () => {
    reset();
    state.applicationQueue = [appFixture("DITERIMA"), appFixture("DITOLAK")];
    const res = await saveRoute.POST(
      post("http://localhost/api/exam/save", { attemptId: "att-1", answers: { q1: "A" } }),
    );
    expect(res.status).toBe(403);
    // TASK 03L.2E.4.10B-SQL — assert $queryRaw (bukan `update`/`updateMany`):
    // kalau hanya yang lama yang diperiksa, assertion ini jadi kosong karena
    // route memang tidak pernah memanggilnya lagi.
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("POST /api/exam/submit — final write-boundary re-check", () => {
  it("2. status berubah DITERIMA -> DITOLAK sebelum submit -> 403, submitExam TIDAK dipanggil", async () => {
    reset();
    state.applicationQueue = [appFixture("DITERIMA"), appFixture("DITOLAK")];
    const res = await submitRoute.POST(
      post("http://localhost/api/exam/submit", { attemptId: "att-1", answers: [] }),
    );
    expect(res.status).toBe(403);
    expect(submitExamMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/exam/report — final write-boundary re-check", () => {
  it("3. status berubah DITERIMA -> DITOLAK sebelum side effect -> 403, laporan Discord TIDAK dikirim", async () => {
    reset({ resultFull: ownedResult() });
    state.applicationQueue = [appFixture("DITERIMA"), appFixture("DITOLAK")];
    const res = await reportRoute.POST(
      post("http://localhost/api/exam/report", { resultId: "res-1" }),
    );
    expect(res.status).toBe(403);
    expect(sendDiscordExamReportMock).not.toHaveBeenCalled();
    expect(mockPrisma.examResult.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/attendance/submit — TOCTOU", () => {
  it("4. status berubah DITERIMA -> DITOLAK sebelum write -> 403, attendance TIDAK dibuat", async () => {
    reset();
    state.applicationQueue = [appFixture("DITERIMA"), appFixture("DITOLAK")];
    const res = await attendanceSubmitRoute.POST(
      post("http://localhost/api/attendance/submit", { discordUserId: "casis#1234" }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
  });

  it("5. create kalah race (P2002) -> 409 idempotent (bukan 500)", async () => {
    reset();
    state.attendanceCreateImpl = async () => {
      throw p2002();
    };
    const res = await attendanceSubmitRoute.POST(
      post("http://localhost/api/attendance/submit", { discordUserId: "casis#1234" }),
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/sudah melakukan absensi/i);
  });
});
