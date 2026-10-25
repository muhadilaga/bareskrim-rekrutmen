import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// TASK 03L.2E.4.2 — Candidate Guard integration: exam save/submit/report,
// attendance submit, and historical review ownership.
//
// Candidate Guard dijalankan SEBENARNYA (real). Prisma di-mock agar guard
// benar-benar membaca period/Application. exam-service di-mock karena submit
// route memanggil submitExam (bukan target guard test).
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

const state: Record<string, unknown> = {};
const mockPrisma = {
  // TASK 03L.2E.4.10B-SQL — save memakai raw SQL satu statement; baris yang
  // kembali menentukan sukses/tolak.
  $queryRaw: vi.fn(async () => state.queryRawRows ?? [{ id: "att-1" }]),
  examPeriod: {
    findMany: vi.fn(async () => state.periods),
    findFirst: vi.fn(async () => state.period),
  },
  recruitmentPeriod: { findUnique: vi.fn(async () => state.rp) },
  application: { findFirst: vi.fn(async () => state.application) },
  attendance: {
    findFirst: vi.fn(async () => state.attendance),
    findUnique: vi.fn(async () => state.attendance),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: "att-new",
      status: "HADIR",
      createdAt: new Date("2026-01-09T00:00:00.000Z"),
      ...args.data,
    })),
  },
  examAttempt: {
    // Save route memakai findFirst (filter deletedAt); route lain findUnique.
    findFirst: vi.fn(async () => state.attempt),
    findUnique: vi.fn(async () => state.attempt),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async () => ({ id: "attempt-new" })),
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
const reviewRoute = await import("@/app/api/exam/review/route");

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function reset(over: Record<string, unknown> = {}) {
  state.user = USER;
  state.periods = [PERIOD];
  state.period = PERIOD;
  state.rp = RP;
  state.application = appFixture("DITERIMA");
  state.attendance = null;
  state.attempt = { id: "att-1", userId: "user-1", submittedAt: null, startedAt: new Date() };
  state.resultForGuard = null;
  state.resultFull = null;
  Object.assign(state, over);
  vi.clearAllMocks();
}

beforeEach(() => reset());

describe("POST /api/exam/save — current eligibility", () => {
  it("1. DITERIMA -> 200 dan menulis savedAnswers", async () => {
    const res = await saveRoute.POST(
      post("http://localhost/api/exam/save", { attemptId: "att-1", answers: { q1: "A" } }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("2. MENUNGGU_VERIFIKASI -> 403, tidak ada tulisan", async () => {
    reset({ application: appFixture("MENUNGGU_VERIFIKASI") });
    const res = await saveRoute.POST(
      post("http://localhost/api/exam/save", { attemptId: "att-1", answers: { q1: "A" } }),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("APPLICATION_PENDING");
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("3. DITOLAK -> 403", async () => {
    reset({ application: appFixture("DITOLAK") });
    const res = await saveRoute.POST(
      post("http://localhost/api/exam/save", { attemptId: "att-1", answers: {} }),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("APPLICATION_REJECTED");
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("4. Attempt milik user lain tetap 404 (ownership tidak dilemahkan)", async () => {
    reset({ attempt: { id: "att-1", userId: "user-OTHER", submittedAt: null } });
    const res = await saveRoute.POST(
      post("http://localhost/api/exam/save", { attemptId: "att-1", answers: {} }),
    );
    expect(res.status).toBe(404);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("5. tanpa trusted session -> 401", async () => {
    reset({ user: null });
    const res = await saveRoute.POST(
      post("http://localhost/api/exam/save", { attemptId: "att-1", answers: {} }),
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("POST /api/exam/submit — current eligibility", () => {
  it("6. DITERIMA -> submitExam dipanggil", async () => {
    submitExamMock.mockResolvedValueOnce({ ok: true, resultId: "res-1" });
    const res = await submitRoute.POST(
      post("http://localhost/api/exam/submit", { attemptId: "att-1", answers: [] }),
    );
    expect(res.status).toBe(200);
    expect(submitExamMock).toHaveBeenCalledTimes(1);
  });

  it("7. MENUNGGU_VERIFIKASI -> 403 dan submitExam TIDAK dipanggil", async () => {
    reset({ application: appFixture("MENUNGGU_VERIFIKASI") });
    const res = await submitRoute.POST(
      post("http://localhost/api/exam/submit", { attemptId: "att-1", answers: [] }),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("APPLICATION_PENDING");
    expect(submitExamMock).not.toHaveBeenCalled();
  });

  it("8. DITOLAK -> 403 dan submitExam TIDAK dipanggil", async () => {
    reset({ application: appFixture("DITOLAK") });
    const res = await submitRoute.POST(
      post("http://localhost/api/exam/submit", { attemptId: "att-1", answers: [] }),
    );
    expect(res.status).toBe(403);
    expect(submitExamMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/exam/report — current eligibility guards Discord side effects", () => {
  const ownedResult = () => ({
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
  });

  it("9. DITERIMA + hasil milik sendiri -> laporan Discord dikirim", async () => {
    reset({ resultFull: ownedResult() });
    const res = await reportRoute.POST(
      post("http://localhost/api/exam/report", { resultId: "res-1" }),
    );
    expect(res.status).toBe(200);
    expect(sendDiscordExamReportMock).toHaveBeenCalledTimes(1);
  });

  it("10. MENUNGGU_VERIFIKASI -> 403 dan TIDAK mengirim laporan Discord", async () => {
    reset({ application: appFixture("MENUNGGU_VERIFIKASI"), resultFull: ownedResult() });
    const res = await reportRoute.POST(
      post("http://localhost/api/exam/report", { resultId: "res-1" }),
    );
    expect(res.status).toBe(403);
    expect(sendDiscordExamReportMock).not.toHaveBeenCalled();
    expect(mockPrisma.examResult.update).not.toHaveBeenCalled();
  });

  it("11. DITOLAK -> 403 dan TIDAK mengirim laporan Discord", async () => {
    reset({ application: appFixture("DITOLAK"), resultFull: ownedResult() });
    const res = await reportRoute.POST(
      post("http://localhost/api/exam/report", { resultId: "res-1" }),
    );
    expect(res.status).toBe(403);
    expect(sendDiscordExamReportMock).not.toHaveBeenCalled();
  });

  it("12. Hasil milik user lain -> 404, tanpa side effect Discord", async () => {
    const other = ownedResult();
    other.attempt.userId = "user-OTHER";
    reset({ resultFull: other });
    const res = await reportRoute.POST(
      post("http://localhost/api/exam/report", { resultId: "res-1" }),
    );
    expect(res.status).toBe(404);
    expect(sendDiscordExamReportMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/attendance/submit — current eligibility", () => {
  it("13. DITERIMA -> attendance dibuat", async () => {
    const res = await attendanceSubmitRoute.POST(
      post("http://localhost/api/attendance/submit", { discordUserId: "casis#1234" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.attendance.create).toHaveBeenCalledTimes(1);
  });

  it("14. MENUNGGU_VERIFIKASI -> 403, attendance TIDAK dibuat", async () => {
    reset({ application: appFixture("MENUNGGU_VERIFIKASI") });
    const res = await attendanceSubmitRoute.POST(
      post("http://localhost/api/attendance/submit", { discordUserId: "casis#1234" }),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("APPLICATION_PENDING");
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
  });

  it("15. DITOLAK -> 403, attendance TIDAK dibuat", async () => {
    reset({ application: appFixture("DITOLAK") });
    const res = await attendanceSubmitRoute.POST(
      post("http://localhost/api/attendance/submit", { discordUserId: "casis#1234" }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
  });

  it("16. tanpa trusted session -> 401", async () => {
    reset({ user: null });
    const res = await attendanceSubmitRoute.POST(
      post("http://localhost/api/attendance/submit", { discordUserId: "casis#1234" }),
    );
    expect(res.status).toBe(401);
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/exam/review — historical ownership (tanpa current eligibility)", () => {
  const guardOwned = () => ({
    id: "res-1",
    attemptId: "att-1",
    score: 80,
    maxScore: 100,
    mcqScore: 60,
    essayScore: 20,
    status: "LULUS",
    passed: true,
    submittedAt: new Date(),
    attempt: { id: "att-1", userId: "user-1", periodId: "ep-1" },
  });
  const fullOwned = () => ({
    id: "res-1",
    score: 80,
    maxScore: 100,
    mcqScore: 60,
    essayScore: 20,
    status: "LULUS",
    passed: true,
    submittedAt: new Date(),
    answersJson: [],
    attempt: {
      userId: "user-1",
      questionsJson: [],
      period: { name: PERIOD.name },
      user: { username: "CasisSatu" },
    },
  });

  it("17. Hasil milik sendiri -> 200 walaupun status Application kini DITOLAK", async () => {
    reset({ application: appFixture("DITOLAK"), resultForGuard: guardOwned(), resultFull: fullOwned() });
    const res = await reviewRoute.GET(
      new Request("http://localhost/api/exam/review?resultId=res-1"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; summary: { score: number } };
    expect(json.ok).toBe(true);
    expect(json.summary.score).toBe(80);
  });

  it("18. Hasil milik user lain -> 403 (ownership), bukan status Application", async () => {
    const other = guardOwned();
    other.attempt.userId = "user-OTHER";
    reset({ resultForGuard: other, resultFull: fullOwned() });
    const res = await reviewRoute.GET(
      new Request("http://localhost/api/exam/review?resultId=res-1"),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("RESOURCE_FORBIDDEN");
  });

  it("19. tanpa trusted session -> 401", async () => {
    reset({ user: null });
    const res = await reviewRoute.GET(
      new Request("http://localhost/api/exam/review?resultId=res-1"),
    );
    expect(res.status).toBe(401);
  });

  it("20. resultId kosong -> 400 (tidak menyentuh guard)", async () => {
    reset();
    const res = await reviewRoute.GET(new Request("http://localhost/api/exam/review"));
    expect(res.status).toBe(400);
  });
});
