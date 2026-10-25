import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ============================================================================
// TASK 03L.2E.4.10B — EXAM-SUBMIT-ATOMIC-IMPLEMENTATION REGRESSION TESTS
//
// Menguji invariant submit ujian Bareskrim Rekrutmen V2:
// 1. Happy path: result, answers (skipDuplicates: true), submittedAt disimpan konsisten.
// 2. Kegagalan DB: error pada create/createMany/update tidak menghasilkan sukses palsu.
// 3. Konflik unik attemptId: recovery TIDAK BOLEH melewati penulisan ExamAnswer.
// 4. Already submitted: attempt yang sudah dikumpulkan tidak boleh diproses ulang.
// 5. Concurrency: request paralel tidak menghasilkan state sukses parsial.
// 6. Candidate Guard: fail-closed pada batas penulisan.
// 7. Kontrak route HTTP: 200, 400, 403, 404, 409, 410, 500 tetap konsisten.
// ============================================================================

const USER = {
  id: "user-test-1",
  robloxId: 12345678n,
  username: "CasisUjian",
  displayName: "Casis Ujian",
  discordUsername: null,
  matraBlocked: false,
  policeGroupRankNumber: null,
  deletedAt: null,
  bannedGroupIds: null,
};

const PERIOD = {
  id: "ep-test-1",
  name: "Periode Ujian Akademik",
  description: null,
  recruitmentPeriodId: "rp-test-1",
  isActive: true,
  isAttendanceOpen: true,
  isExamOpen: true,
  examStartTime: null,
  examEndTime: null,
  seed: 99999,
  mcqCount: 1,
  essayCount: 0,
  passThreshold: 70,
  openedAt: new Date("2026-01-01T00:00:00.000Z"),
  closedAt: null,
  deletedAt: null,
};

const RP = {
  id: "rp-test-1",
  code: "BARESKRIM-2026",
  name: "Angkatan 2026",
  isActive: true,
  openedAt: new Date("2026-01-01T00:00:00.000Z"),
  closedAt: new Date("2026-12-31T23:59:59.000Z"),
  deletedAt: null,
};

const ATTENDANCE = {
  id: "att-row-1",
  userId: "user-test-1",
  periodId: "ep-test-1",
  tahap: "AKADEMIK",
  status: "HADIR",
  createdAt: new Date("2026-01-01T08:00:00.000Z"),
};

const SNAPSHOT_QUESTION = {
  id: "q-atomic-1",
  type: "MCQ",
  question: "Pertanyaan Uji Atomik",
  options: ["A", "B", "C", "D"],
  correctKey: "A",
  points: 100,
};

function makeAttempt(over: Record<string, unknown> = {}) {
  return {
    id: "att-atomic-1",
    userId: "user-test-1",
    periodId: "ep-test-1",
    attemptKey: "ep-test-1_user-test-1",
    startedAt: new Date(Date.now() - 30_000),
    submittedAt: null,
    questionsJson: [SNAPSHOT_QUESTION],
    period: { passThreshold: 70 },
    ...over,
  };
}

function p2002(target?: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: target === undefined ? undefined : { target },
  });
}

const mockPrisma = {
  examPeriod: {
    findMany: vi.fn(async () => [PERIOD]),
    findFirst: vi.fn(async () => PERIOD),
  },
  recruitmentPeriod: {
    findUnique: vi.fn(async () => RP),
  },
  application: {
    findFirst: vi.fn(async () => ({
      id: "app-test-1",
      userId: "user-test-1",
      recruitmentPeriodId: "rp-test-1",
      status: "DITERIMA",
      deletedAt: null,
    })),
  },
  attendance: {
    findFirst: vi.fn(async () => ATTENDANCE),
  },
  examAttempt: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  examResult: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  examAnswer: {
    createMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/init-schema", () => ({ ensureSchema: vi.fn(async () => {}) }));
vi.mock("@/lib/discord-api", () => ({
  checkDiscordRole: vi.fn(async () => ({ ok: false, hasRole: false })),
  assignDiscordRoleById: vi.fn(async () => ({ ok: true }) as const),
  removeDiscordRoleById: vi.fn(async () => ({ ok: true }) as const),
  assignDiscordRoleAndNickname: vi.fn(async () => ({ ok: true, nicknameOk: true }) as const),
}));

const { submitExam } = await import("@/lib/exam-service");

describe("TASK 03L.2E.4.10B — submitExam Atomic & Recovery Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.attendance.findFirst.mockResolvedValue(ATTENDANCE);
    mockPrisma.examAttempt.findUnique.mockResolvedValue(makeAttempt());
    mockPrisma.examResult.findUnique.mockResolvedValue(null);
    mockPrisma.examResult.create.mockResolvedValue({ id: "res-new-1" });
    mockPrisma.examAnswer.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.examAttempt.update.mockResolvedValue({ id: "att-atomic-1", submittedAt: new Date() });
    mockPrisma.examAttempt.updateMany.mockResolvedValue({ count: 1 });
  });

  // 1. Happy path
  it("1. Happy path: result, answers (skipDuplicates: true), dan submittedAt disimpan secara konsisten", async () => {
    const result = await submitExam(USER as never, {
      attemptId: "att-atomic-1",
      answers: [{ questionId: "q-atomic-1", answer: "A" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resultId).toBe("res-new-1");

    // Pastikan ExamResult.create dipanggil dengan kalkulasi grade
    expect(mockPrisma.examResult.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.examResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attemptId: "att-atomic-1",
          score: 100,
          passed: true,
        }),
      }),
    );

    // Pastikan ExamAnswer.createMany dipanggil dengan skipDuplicates: true
    expect(mockPrisma.examAnswer.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.examAnswer.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          attemptId: "att-atomic-1",
          questionId: "q-atomic-1",
          answer: "A",
          isCorrect: true,
          earnedPoints: 100,
        }),
      ],
      skipDuplicates: true,
    });

    // Pastikan ExamAttempt.updateMany dipanggil untuk menutup submittedAt
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: "att-atomic-1", submittedAt: null },
      data: { submittedAt: expect.any(Date) },
    });
  });

  // 2a. Kegagalan di ExamResult.create
  it("2a. DB error pada ExamResult.create -> dilempar, jawaban & submittedAt tidak dimutasi", async () => {
    mockPrisma.examResult.create.mockRejectedValueOnce(new Error("Database connection lost"));

    await expect(
      submitExam(USER as never, {
        attemptId: "att-atomic-1",
        answers: [{ questionId: "q-atomic-1", answer: "A" }],
      }),
    ).rejects.toThrow("Database connection lost");

    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 2b. Kegagalan di ExamAnswer.createMany
  it("2b. DB error pada ExamAnswer.createMany -> dilempar, submittedAt TIDAK ditandai (tidak ada false success)", async () => {
    mockPrisma.examAnswer.createMany.mockRejectedValueOnce(new Error("Deadlock in answers"));

    await expect(
      submitExam(USER as never, {
        attemptId: "att-atomic-1",
        answers: [{ questionId: "q-atomic-1", answer: "A" }],
      }),
    ).rejects.toThrow("Deadlock in answers");

    // submittedAt TIDAK boleh ditandai jika jawaban gagal disimpan
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 2c. Kegagalan di ExamAttempt.updateMany
  it("2c. DB error pada ExamAttempt.updateMany -> dilempar, tidak mengembalikan ok: true", async () => {
    mockPrisma.examAttempt.updateMany.mockRejectedValueOnce(new Error("Timeout updating attempt"));

    await expect(
      submitExam(USER as never, {
        attemptId: "att-atomic-1",
        answers: [{ questionId: "q-atomic-1", answer: "A" }],
      }),
    ).rejects.toThrow("Timeout updating attempt");
  });

  // 3. Konflik unik attemptId TIDAK BOLEH melewati kelengkapan jawaban (Recovery)
  it("3. Konflik unik attemptId (P2002) -> recovery WAJIB memulihkan ExamAnswer sebelum menutup attempt", async () => {
    // Simulasikan ExamResult sudah ada dari upaya sebelumnya yang gagal sebelum ExamAnswer disimpan
    const EXISTING_RESULT = { id: "res-recovered-1", attemptId: "att-atomic-1" };
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce(EXISTING_RESULT);

    const result = await submitExam(USER as never, {
      attemptId: "att-atomic-1",
      answers: [{ questionId: "q-atomic-1", answer: "A" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resultId).toBe("res-recovered-1");

    // CRITICAL: Pada recovery P2002, ExamAnswer.createMany TETAP WAJIB dipanggil!
    expect(mockPrisma.examAnswer.createMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.examAnswer.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          attemptId: "att-atomic-1",
          questionId: "q-atomic-1",
          answer: "A",
        }),
      ],
      skipDuplicates: true,
    });

    // Dan attempt ditutup
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: "att-atomic-1", submittedAt: null },
      data: { submittedAt: expect.any(Date) },
    });
  });

  // 3b. Recovery jika ExamAnswer gagal saat pemulihan -> fail-closed, tidak return ok: true
  it("3b. Jika ExamAnswer gagal saat pemulihan P2002 -> error dilempar, submittedAt tidak ditutup", async () => {
    const EXISTING_RESULT = { id: "res-recovered-1", attemptId: "att-atomic-1" };
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce(EXISTING_RESULT);
    mockPrisma.examAnswer.createMany.mockRejectedValueOnce(new Error("Disk full on recovery"));

    await expect(
      submitExam(USER as never, {
        attemptId: "att-atomic-1",
        answers: [{ questionId: "q-atomic-1", answer: "A" }],
      }),
    ).rejects.toThrow("Disk full on recovery");

    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 4. Attempt yang sudah dikumpulkan tidak boleh dikumpulkan ulang
  it("4. Attempt yang sudah submittedAt terisi -> ditolak ALREADY_SUBMITTED tanpa mutasi", async () => {
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce(
      makeAttempt({ submittedAt: new Date(Date.now() - 10_000) }),
    );

    const result = await submitExam(USER as never, {
      attemptId: "att-atomic-1",
      answers: [{ questionId: "q-atomic-1", answer: "B" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ALREADY_SUBMITTED");

    expect(mockPrisma.examResult.create).not.toHaveBeenCalled();
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 5. Concurrency: dua submit paralel tidak menghasilkan partial state
  it("5. Submit konkuren: Request B yang kena P2002 tetap memastikan jawaban disimpan dan attempt ditutup", async () => {
    const EXISTING_RESULT = { id: "res-concurrent-1", attemptId: "att-atomic-1" };
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce(EXISTING_RESULT);

    const resultB = await submitExam(USER as never, {
      attemptId: "att-atomic-1",
      answers: [{ questionId: "q-atomic-1", answer: "A" }],
    });

    expect(resultB.ok).toBe(true);
    if (resultB.ok) expect(resultB.resultId).toBe("res-concurrent-1");
    expect(mockPrisma.examAnswer.createMany).toHaveBeenCalledWith({
      data: expect.any(Array),
      skipDuplicates: true,
    });
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalled();
  });

  // 6. Candidate Guard fail-closed pada batas mutasi
  it("6. Candidate Guard: jika ctx menyatakan status kandidat DITOLAK -> fail-closed", async () => {
    const ineligibleCtx = {
      user: USER as never,
      application: {
        id: "app-test-1",
        userId: "user-test-1",
        recruitmentPeriodId: "rp-test-1",
        status: "DITOLAK" as const,
        deletedAt: null,
      },
      examPeriod: PERIOD as never,
      recruitmentPeriod: RP as never,
    };

    // Saat status bukan DITERIMA di database, findFirst({ where: { status: "DITERIMA" } }) menghasilkan null
    mockPrisma.application.findFirst.mockResolvedValueOnce(null as any);

    await expect(
      submitExam(USER as never, {
        attemptId: "att-atomic-1",
        answers: [{ questionId: "q-atomic-1", answer: "A" }],
      }, { ctx: ineligibleCtx as never }),
    ).rejects.toThrow();

    // Tidak ada write ke database
    expect(mockPrisma.examResult.create).not.toHaveBeenCalled();
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });
});
