import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ============================================================================
// TASK 03L.2E.4.6 — Candidate Guard TOCTOU hardening (jalur sesi ujian).
//
// Menguji startExamSession SEBENARNYA dengan Candidate Guard asli dan Prisma
// di-mock. Fokus:
//  (1) period binding — attempt memakai ExamPeriod yang divalidasi guard,
//      bukan hasil query ulang yang bisa berbeda (period-swap TOCTOU);
//  (2) idempotensi create saat race (P2002) tidak menjadi 500;
//  (3) pemeriksaan final di batas penulisan menolak write bila status
//      Application berubah (DITERIMA -> DITOLAK / hilang) di tengah request.
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
  examStartTime: null,
  examEndTime: null,
  seed: 12345,
  mcqCount: 0,
  essayCount: 0,
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

const ATTENDANCE = {
  id: "attendance-1",
  userId: "user-1",
  periodId: "ep-1",
  tahap: "AKADEMIK",
  status: "HADIR",
  createdAt: new Date("2026-01-09T00:00:00.000Z"),
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

// where-aware matcher supaya mock TIDAK "membohongi" pemeriksaan final
// (assertEligibilityStillValid WHERE status: DITERIMA harus benar-benar
// menyaring data yang tidak lagi DITERIMA).
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

const state: {
  periods: unknown[];
  period: unknown;
  rp: unknown;
  application: unknown;
  applicationQueue: unknown[];
  attendance: unknown;
  attempt: unknown;
  attemptQueue: unknown[];
  createImpl: (() => Promise<unknown>) | null;
} = {
  periods: [],
  period: null,
  rp: null,
  application: null,
  applicationQueue: [],
  attendance: null,
  attempt: null,
  attemptQueue: [],
  createImpl: null,
};

const mockPrisma = {
  examPeriod: {
    findMany: vi.fn(async () => state.periods),
    // Query lama yang DIVERIFIKASI tidak dipakai lagi oleh startExamSession.
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
  attendance: { findFirst: vi.fn(async () => state.attendance) },
  examAttempt: {
    findUnique: vi.fn(async () => {
      if (state.attemptQueue.length) return state.attemptQueue.shift();
      return state.attempt;
    }),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      if (state.createImpl) return state.createImpl();
      return { id: "attempt-new", startedAt: new Date(), ...args.data };
    }),
  },
  examResult: { findUnique: vi.fn(async () => null) },
  question: { findMany: vi.fn(async () => []) },
  blacklistEntry: { findFirst: vi.fn(async () => null) },
  verdictEntry: { findFirst: vi.fn(async () => null) },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/init-schema", () => ({ ensureSchema: vi.fn(async () => {}) }));
vi.mock("@/lib/discord-api", () => ({
  checkDiscordRole: vi.fn(async () => ({ ok: false, hasRole: false })),
  assignDiscordRoleById: vi.fn(async () => ({ ok: true }) as const),
  removeDiscordRoleById: vi.fn(async () => ({ ok: true }) as const),
  assignDiscordRoleAndNickname: vi.fn(async () => ({ ok: true, nicknameOk: true }) as const),
}));

const { startExamSession } = await import("@/lib/exam-service");

function reset(over: Partial<typeof state> = {}) {
  state.periods = [PERIOD];
  state.period = PERIOD;
  state.rp = RP;
  state.application = appFixture("DITERIMA");
  state.applicationQueue = [];
  state.attendance = ATTENDANCE;
  state.attempt = null;
  state.attemptQueue = [];
  state.createImpl = null;
  Object.assign(state, over);
  vi.clearAllMocks();
}

beforeEach(() => reset());

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`attemptKey`)", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["attemptKey"] },
  });
}

describe("startExamSession — TOCTOU period binding", () => {
  it("1. attempt memakai period yang divalidasi guard; TIDAK query ulang findFirst", async () => {
    await startExamSession(USER as never);
    expect(mockPrisma.examPeriod.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.examAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ periodId: "ep-1", attemptKey: "ep-1_user-1" }) }),
    );
  });

  it("2. findFirst mengembalikan periode BERBEDA (swap) — create tetap memakai period guard (ep-1)", async () => {
    reset({ period: { ...PERIOD, id: "ep-EVIL", recruitmentPeriodId: null } });
    await startExamSession(USER as never);
    expect(mockPrisma.examAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ periodId: "ep-1" }) }),
    );
  });
});

describe("startExamSession — TOCTOU create race (P2002)", () => {
  it("3. create kalah race (P2002) + attempt belum submit -> kembalikan sesi resume (bukan throw/500)", async () => {
    const raced = {
      id: "attempt-raced",
      userId: "user-1",
      periodId: "ep-1",
      attemptKey: "ep-1_user-1",
      startedAt: new Date(),
      submittedAt: null,
      questionsJson: [],
      savedAnswers: { q1: "A" },
      flaggedQuestions: [],
      bookmarkedQuestions: [],
    };
    reset();
    state.attemptQueue = [null, raced];
    state.createImpl = async () => {
      throw p2002();
    };

    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attemptId).toBe("attempt-raced");
      expect(result.savedAnswers).toEqual({ q1: "A" });
    }
    expect(mockPrisma.examAttempt.create).toHaveBeenCalledTimes(1);
  });

  it("4. create kalah race (P2002) + attempt sudah submit -> ALREADY_SUBMITTED (bukan throw)", async () => {
    const raced = {
      id: "attempt-raced",
      userId: "user-1",
      periodId: "ep-1",
      attemptKey: "ep-1_user-1",
      startedAt: new Date(Date.now() - 60_000),
      submittedAt: new Date(),
      questionsJson: [],
      savedAnswers: null,
      flaggedQuestions: [],
      bookmarkedQuestions: [],
    };
    reset();
    state.attemptQueue = [null, raced];
    state.createImpl = async () => {
      throw p2002();
    };

    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ALREADY_SUBMITTED");
  });
});

describe("startExamSession — final eligibility re-check at write boundary", () => {
  it("5. status berubah DITERIMA -> DITOLAK sebelum write -> NOT_ELIGIBLE, tidak membuat attempt", async () => {
    reset();
    state.applicationQueue = [appFixture("DITERIMA"), appFixture("DITOLAK")];

    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_ELIGIBLE");
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("6. Application hilang/soft-delete sebelum write -> NOT_ELIGIBLE, tidak membuat attempt", async () => {
    reset();
    state.applicationQueue = [appFixture("DITERIMA"), null];

    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_ELIGIBLE");
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });
});
