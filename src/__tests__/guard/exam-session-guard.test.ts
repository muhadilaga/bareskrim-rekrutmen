import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// TASK 03L.2E.4.2 — Candidate Guard integration: exam session (start).
//
// Menguji implementasi Candidate Guard SEBENARNYA lewat exam-service.s
// startExamSession (real) + route GET /api/exam/session (real). Prisma di-mock
// agar guard benar-benar dijalankan terhadap data periode/Application.
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

const ATTENDANCE = {
  id: "att-1",
  userId: "user-1",
  periodId: "ep-1",
  tahap: "AKADEMIK",
  status: "HADIR",
  createdAt: new Date("2026-01-09T00:00:00.000Z"),
};

const state: {
  user: typeof USER | null;
  periods: unknown[];
  period: unknown;
  rp: unknown;
  application: unknown;
  attendance: unknown;
  attempt: unknown;
} = {
  user: USER,
  periods: [],
  period: null,
  rp: null,
  application: null,
  attendance: null,
  attempt: null,
};

const mockPrisma = {
  examPeriod: {
    findMany: vi.fn(async () => state.periods),
    findFirst: vi.fn(async () => state.period),
  },
  recruitmentPeriod: { findUnique: vi.fn(async () => state.rp) },
  application: { findFirst: vi.fn(async () => state.application) },
  attendance: {
    findFirst: vi.fn(async () => state.attendance),
    findUnique: vi.fn(async () => state.attendance),
  },
  examAttempt: {
    findUnique: vi.fn(async () => state.attempt),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: "attempt-new", ...args.data })),
    update: vi.fn(async () => ({})),
  },
  examResult: {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: "res-new" })),
  },
  question: { findMany: vi.fn(async () => []) },
  blacklistEntry: { findFirst: vi.fn(async () => null) },
  verdictEntry: { findFirst: vi.fn(async () => null) },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => state.user) }));
vi.mock("@/lib/init-schema", () => ({ ensureSchema: vi.fn(async () => {}) }));
vi.mock("@/lib/discord-api", () => ({
  checkDiscordRole: vi.fn(async () => ({ ok: false, hasRole: false })),
  assignDiscordRoleById: vi.fn(async () => ({ ok: true }) as const),
  removeDiscordRoleById: vi.fn(async () => ({ ok: true }) as const),
  assignDiscordRoleAndNickname: vi.fn(async () => ({ ok: true, nicknameOk: true }) as const),
}));
vi.mock("@/lib/audit", () => ({ logStudentAction: vi.fn() }));
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

const { startExamSession } = await import("@/lib/exam-service");
const sessionRoute = await import("@/app/api/exam/session/route");

function reset(over: Partial<typeof state> = {}) {
  state.user = USER;
  state.periods = [PERIOD];
  state.period = PERIOD;
  state.rp = RP;
  state.application = appFixture("DITERIMA");
  state.attendance = ATTENDANCE;
  state.attempt = null;
  Object.assign(state, over);
  vi.clearAllMocks();
}

beforeEach(() => reset());

describe("exam session guard — requireCurrentCandidateEligibility via startExamSession (REAL guard)", () => {
  it("1. Application DITERIMA + period valid -> attempt dibuat", async () => {
    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(true);
    expect(mockPrisma.examAttempt.create).toHaveBeenCalledTimes(1);
  });

  it("2. MENUNGGU_VERIFIKASI -> NOT_ELIGIBLE dan TIDAK membuat attempt", async () => {
    reset({ application: appFixture("MENUNGGU_VERIFIKASI") });
    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_ELIGIBLE");
      expect(result.message).toMatch(/menunggu verifikasi/i);
    }
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("3. DITOLAK -> NOT_ELIGIBLE dan TIDAK membuat attempt", async () => {
    reset({ application: appFixture("DITOLAK") });
    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_ELIGIBLE");
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("4. Tidak ada Application untuk period -> NOT_ELIGIBLE", async () => {
    reset({ application: null });
    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_ELIGIBLE");
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("5. Application soft-deleted -> NOT_ELIGIBLE", async () => {
    reset({ application: appFixture("DITERIMA", { deletedAt: new Date() }) });
    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("6. RecruitmentPeriod soft-deleted -> NOT_ELIGIBLE", async () => {
    reset({ rp: { ...RP, deletedAt: new Date() } });
    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("7. ExamPeriod tidak terpetakan (recruitmentPeriodId null) -> NOT_ELIGIBLE", async () => {
    reset({ period: { ...PERIOD, recruitmentPeriodId: null }, periods: [{ ...PERIOD, recruitmentPeriodId: null }] });
    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("8. Periode ambigu (2 aktif) -> NOT_ELIGIBLE (fail closed)", async () => {
    reset({ periods: [PERIOD, { ...PERIOD, id: "ep-2" }] });
    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_ELIGIBLE");
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("9. DB gagal saat resolve period -> GUARD_UNAVAILABLE (bukan eligibility)", async () => {
    reset();
    mockPrisma.examPeriod.findMany.mockImplementationOnce(async () => {
      throw new Error("connection refused");
    });
    const result = await startExamSession(USER as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("GUARD_UNAVAILABLE");
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/exam/session — status mapping via candidate guard", () => {
  it("10. DITERIMA -> 200", async () => {
    const res = await sessionRoute.GET(new Request("http://localhost/api/exam/session"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; attemptId: string };
    expect(json.ok).toBe(true);
    expect(json.attemptId).toBe("attempt-new");
  });

  it("11. MENUNGGU_VERIFIKASI -> 403 (bukan 200)", async () => {
    reset({ application: appFixture("MENUNGGU_VERIFIKASI") });
    const res = await sessionRoute.GET(new Request("http://localhost/api/exam/session"));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { ok: boolean; code: string; message: string };
    expect(json.ok).toBe(false);
    expect(json.code).toBe("NOT_ELIGIBLE");
    expect(json.message).toMatch(/menunggu verifikasi/i);
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("12. DITOLAK -> 403 dan tidak ada attempt", async () => {
    reset({ application: appFixture("DITOLAK") });
    const res = await sessionRoute.GET(new Request("http://localhost/api/exam/session"));
    expect(res.status).toBe(403);
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("13. tanpa trusted session -> 401 dan tidak ada attempt", async () => {
    reset({ user: null });
    const res = await sessionRoute.GET(new Request("http://localhost/api/exam/session"));
    expect(res.status).toBe(401);
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("14. GUARD_UNAVAILABLE -> 503", async () => {
    reset();
    mockPrisma.examPeriod.findMany.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    const res = await sessionRoute.GET(new Request("http://localhost/api/exam/session"));
    expect(res.status).toBe(503);
  });
});
