import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { finalizeExamAttempt } from "@/lib/exam-service";
import { CandidateGuardError } from "@/lib/candidate-guard";

// ============================================================================
// TASK 03L.2E.4.10B — SHARED EXAM FINALIZER & RECOVERY SUITE
//
// Menguji 15 invariant wajib:
//  1. Finalisasi normal oleh peserta
//  2. Finalisasi normal oleh cron
//  3. Recovery ketika ExamResult sudah ada tetapi ExamAnswer belum lengkap
//  4. Recovery ketika submittedAt masih null
//  5. Retry dengan payload identik (idempoten)
//  6. Retry dengan hasil grading berbeda (PAYLOAD_CONFLICT)
//  7. Konflik pada ExamAnswer existing (PAYLOAD_CONFLICT)
//  8. P2002 pada ExamResult.attemptId (idempoten & auto-recovery)
//  9. P2002 dari unique constraint lain harus dilempar
// 10. Conditional update ketika attempt sudah ditutup proses lain
// 11. Attempt snapshot tidak valid / soft-deleted
// 12. Eligibility tidak terpenuhi pada cron (Candidate Guard fail-closed)
// 13. Error DB di tengah rangkaian write tidak dilaporkan sebagai sukses palsu
// 14. Cron tetap memproses attempt berikutnya setelah kegagalan
// 15. Metrik processed & failed akurat
// ============================================================================

const SNAPSHOT_QUESTIONS = [
  {
    id: "q-rec-1",
    type: "MCQ",
    question: "Soal 1",
    options: ["A", "B", "C", "D"],
    correctKey: "A",
    points: 50,
  },
  {
    id: "q-rec-2",
    type: "MCQ",
    question: "Soal 2",
    options: ["A", "B", "C", "D"],
    correctKey: "B",
    points: 50,
  },
];

function makeAttempt(over: Record<string, unknown> = {}) {
  return {
    id: "att-rec-100",
    userId: "user-rec-1",
    periodId: "ep-rec-1",
    startedAt: new Date(Date.now() - 30 * 60_000),
    submittedAt: null,
    questionsJson: SNAPSHOT_QUESTIONS,
    period: {
      id: "ep-rec-1",
      recruitmentPeriodId: "rp-rec-1",
      passThreshold: 70,
      deletedAt: null,
    },
    savedAnswers: { "q-rec-1": "A", "q-rec-2": "B" },
    answers: [],
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

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  application: {
    findFirst: vi.fn(),
  },
  examPeriod: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  recruitmentPeriod: {
    findUnique: vi.fn(),
  },
  examAttempt: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  examResult: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  examAnswer: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
  attendance: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/init-schema", () => ({ ensureSchema: vi.fn(async () => {}) }));

describe("TASK 03L.2E.4.10B — finalizeExamAttempt Shared Finalizer & Recovery", () => {
  let answerTable: Array<{
    attemptId?: string;
    questionId: string;
    answer: string;
    isCorrect?: boolean | null;
    earnedPoints?: number | null;
  }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    answerTable = [];

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-rec-1",
      matraBlocked: false,
      deletedAt: null,
      blacklistEntries: [],
    });

    mockPrisma.application.findFirst.mockResolvedValue({
      id: "app-rec-1",
      userId: "user-rec-1",
      recruitmentPeriodId: "rp-rec-1",
      status: "DITERIMA",
      deletedAt: null,
    });

    mockPrisma.examResult.findUnique.mockResolvedValue(null);
    mockPrisma.examResult.create.mockResolvedValue({ id: "res-rec-new", score: 100, passed: true });
    mockPrisma.examAnswer.findMany.mockImplementation(async () => [...answerTable]);
    mockPrisma.examAnswer.createMany.mockImplementation(async ({ data }: { data: any[] }) => {
      for (const item of data) {
        if (!answerTable.some((x) => x.questionId === item.questionId)) {
          answerTable.push({
            isCorrect: null,
            earnedPoints: 0,
            ...item,
          });
        }
      }
      return { count: data.length };
    });
    mockPrisma.examAttempt.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.examAttempt.update.mockResolvedValue({});
  });

  // 1. Finalisasi normal oleh peserta
  it("1. Finalisasi normal oleh peserta: menulis ExamResult, ExamAnswer, dan update submittedAt", async () => {
    const attempt = makeAttempt();
    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
      now: new Date(),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.score).toBe(100);
      expect(res.passed).toBe(true);
      expect(res.recovered).toBe(false);
      expect(res.resultId).toBe("res-rec-new");
    }

    expect(mockPrisma.examResult.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.examAnswer.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ questionId: "q-rec-1", answer: "A", isCorrect: true }),
        expect.objectContaining({ questionId: "q-rec-2", answer: "B", isCorrect: true }),
      ]),
      skipDuplicates: true,
    });
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: attempt.id, submittedAt: null },
      data: { submittedAt: expect.any(Date) },
    });
  });

  // 2. Finalisasi normal oleh cron (mengambil dari savedAnswers)
  it("2. Finalisasi normal oleh cron: menggunakan savedAnswers dan memverifikasi kelayakan kandidat", async () => {
    const attempt = makeAttempt({
      savedAnswers: { "q-rec-1": "A", "q-rec-2": "B" },
    });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CRON",
      checkCandidateEligibility: true,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.score).toBe(100);
      expect(res.passed).toBe(true);
      expect(res.recovered).toBe(false);
    }

    // Cron memeriksa User & Application
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-rec-1" } }),
    );
    expect(mockPrisma.application.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-rec-1",
          recruitmentPeriodId: "rp-rec-1",
          deletedAt: null,
        },
      }),
    );
  });

  // 3. Recovery ketika ExamResult sudah ada tetapi ExamAnswer belum lengkap
  it("3. Recovery: ExamResult sudah ada, menyisipkan hanya ExamAnswer yang belum tercatat", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    // ExamResult sudah ada dengan skor 100, passed true
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-existing",
      score: 100,
      passed: true,
      status: "LULUS",
    });

    // Soal 1 sudah tercatat, Soal 2 belum
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CRON",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recovered).toBe(true);
      expect(res.resultId).toBe("res-rec-existing");
    }

    // Hanya soal 2 yang disisipkan
    expect(mockPrisma.examAnswer.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          attemptId: attempt.id,
          questionId: "q-rec-2",
          answer: "B",
        }),
      ],
      skipDuplicates: true,
    });

    // submittedAt diperbarui
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalled();
  });

  // 4. Recovery ketika submittedAt masih null
  it("4. Recovery: attempt belum submittedAt -> conditional update menutup submittedAt", async () => {
    const attempt = makeAttempt({ submittedAt: null });
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-existing",
      score: 100,
      passed: true,
    });
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 50 },
      { attemptId: attempt.id, questionId: "q-rec-2", answer: "B", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CRON",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recovered).toBe(true);
    }
    // ExamAnswer sudah lengkap, tidak ada createMany
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
    // submittedAt ditutup
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: attempt.id, submittedAt: null },
      data: { submittedAt: expect.any(Date) },
    });
  });

  // 5. Retry dengan payload identik
  it("5. Retry idempoten: payload dan hasil identik -> sukses recovered", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-1",
      score: 100,
      passed: true,
    });
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 50 },
      { attemptId: attempt.id, questionId: "q-rec-2", answer: "B", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recovered).toBe(true);
      expect(res.resultId).toBe("res-rec-1");
    }
  });

  // 6. Retry dengan hasil grading berbeda -> ditolak PAYLOAD_CONFLICT
  it("6. Retry dengan skor/kelulusan berbeda -> ditolak PAYLOAD_CONFLICT (Invariant B)", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    // Existing result tercatat skor 50
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-1",
      score: 50,
      passed: false,
    });

    // Payload baru menghasilkan skor 100
    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("skor tidak konsisten");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 7. Konflik pada ExamAnswer existing -> ditolak PAYLOAD_CONFLICT
  it("7. Konflik jawaban tersimpan vs payload baru -> ditolak PAYLOAD_CONFLICT (Invariant D)", async () => {
    const attempt = makeAttempt();
    // Jawaban di DB tercatat "C" untuk q-rec-1
    mockPrisma.examAnswer.findMany.mockResolvedValueOnce([
      { questionId: "q-rec-1", answer: "C" },
    ]);

    // Payload baru mengirim "A" untuk q-rec-1
    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("jawaban tersimpan berbeda");
    }
    // Tidak menimpa jawaban secara diam-diam
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
  });

  // 8. P2002 pada ExamResult.attemptId -> auto-recovery (Invariant H)
  it("8. P2002 pada attemptId saat create -> auto-recovery mengambil existing result", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-race",
      score: 100,
      passed: true,
    });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recovered).toBe(true);
      expect(res.resultId).toBe("res-rec-race");
    }
  });

  // 9. P2002 dari unique constraint lain harus dilempar
  it("9. P2002 dari target lain (bukan attemptId) -> wajib dilempar, tidak ditelan", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["some_other_column"]));

    await expect(
      finalizeExamAttempt({
        attempt,
        callerSource: "CANDIDATE",
        submittedAnswers: [
          { questionId: "q-rec-1", answer: "A" },
          { questionId: "q-rec-2", answer: "B" },
        ],
      }),
    ).rejects.toThrow("Unique constraint failed");
  });

  // 10. Conditional update ketika attempt sudah ditutup proses lain
  it("10. Conditional update: updateMany menyaring submittedAt: null (tidak menimpa timestamp lama)", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce({
      id: attempt.id,
      submittedAt: new Date(),
      deletedAt: null,
      result: {
        id: "res-rec-existing",
        score: 100,
        passed: true,
        mcqScore: 100,
        essayScore: 0,
        status: "LULUS",
        answersJson: [
          { questionId: "q-rec-1", userAnswer: "A", earned: 50, isCorrect: true },
          { questionId: "q-rec-2", userAnswer: "B", earned: 50, isCorrect: true },
        ],
      },
    });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CRON",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe("ALREADY_COMPLETED_ELSEWHERE");
      expect(res.closedBySelf).toBe(false);
    }
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: attempt.id, submittedAt: null },
      data: { submittedAt: expect.any(Date) },
    });
  });

  // 11. Attempt snapshot tidak valid
  it("11. Snapshot soal kosong atau tidak valid -> return INVALID", async () => {
    const attempt = makeAttempt({ questionsJson: [] });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CRON",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("INVALID");
    }
  });

  // 12. Eligibility tidak terpenuhi pada cron
  it("12. Candidate Guard: user matraBlocked pada cron -> throw CandidateGuardError", async () => {
    const attempt = makeAttempt();
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: "user-rec-1",
      matraBlocked: true,
      deletedAt: null,
      blacklistEntries: [],
    });

    await expect(
      finalizeExamAttempt({
        attempt,
        callerSource: "CRON",
        checkCandidateEligibility: true,
      }),
    ).rejects.toThrow(CandidateGuardError);

    // Pastikan tidak ada result atau attempt diubah
    expect(mockPrisma.examResult.create).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 12b. Application bukan DITERIMA pada cron
  it("12b. Candidate Guard: application status DITOLAK -> throw CandidateGuardError", async () => {
    const attempt = makeAttempt();
    mockPrisma.application.findFirst.mockResolvedValueOnce({
      id: "app-rec-1",
      userId: "user-rec-1",
      recruitmentPeriodId: "rp-rec-1",
      status: "DITOLAK",
      deletedAt: null,
    });

    await expect(
      finalizeExamAttempt({
        attempt,
        callerSource: "CRON",
        checkCandidateEligibility: true,
      }),
    ).rejects.toThrow(CandidateGuardError);
  });

  // 13. Error DB di tengah rangkaian write tidak dilaporkan sebagai sukses palsu
  it("13. DB error pada examAnswer.createMany -> dilempar, submittedAt tidak ditutup", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAnswer.createMany.mockRejectedValueOnce(new Error("DB Write Failure"));

    await expect(
      finalizeExamAttempt({
        attempt,
        callerSource: "CANDIDATE",
        submittedAnswers: [
          { questionId: "q-rec-1", answer: "A" },
          { questionId: "q-rec-2", answer: "B" },
        ],
      }),
    ).rejects.toThrow("DB Write Failure");

    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 14. Total score sama, tetapi mcqScore berbeda -> ditolak PAYLOAD_CONFLICT
  it("14. Konflik subskor MCQ: total score sama tetapi mcqScore beda -> ditolak PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-diff-mcq",
      score: 100,
      passed: true,
      mcqScore: 50, // beda dari graded.mcqScore (100)
      essayScore: 50,
    });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("subskor MCQ tidak konsisten");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
  });

  // 15. Total score sama, tetapi essayScore berbeda -> ditolak PAYLOAD_CONFLICT
  it("15. Konflik subskor Essay: total score sama tetapi essayScore beda -> ditolak PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-diff-essay",
      score: 100,
      passed: true,
      mcqScore: 100,
      essayScore: 20, // beda dari graded.essayScore (0)
    });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("subskor Essay tidak konsisten");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
  });

  // 16. Skor sama, tetapi passed berbeda -> ditolak PAYLOAD_CONFLICT
  it("16. Konflik status kelulusan: skor sama tetapi passed beda -> ditolak PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-diff-passed",
      score: 100,
      passed: false, // beda dari graded.passed (true)
      mcqScore: 100,
      essayScore: 0,
    });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("status kelulusan tidak konsisten");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
  });

  // 17. Skor dan subskor sama, tetapi answersJson berbeda secara semantik -> ditolak PAYLOAD_CONFLICT
  it("17. Konflik semantik answersJson: skor sama tetapi isi jawaban di answersJson beda -> ditolak PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-diff-json",
      score: 100,
      passed: true,
      mcqScore: 100,
      essayScore: 0,
      answersJson: [
        { questionId: "q-rec-1", userAnswer: "WRONG", earned: 50, isCorrect: true },
        { questionId: "q-rec-2", userAnswer: "B", earned: 50, isCorrect: true },
      ],
    });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("rincian answersJson tidak konsisten");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
  });

  // 18. JSON ekuivalen dengan urutan key berbeda dan urutan array berbeda -> lolos idempoten
  it("18. JSON ekuivalen: urutan array dan key berbeda tetap diterima idempoten", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    // Permutasi urutan elemen array dan urutan key dalam object JSON
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-permuted",
      score: 100,
      passed: true,
      mcqScore: 100,
      essayScore: 0,
      answersJson: [
        {
          earned: 50,
          userAnswer: "B ", // ada trailing space yg dinormalisasi .trim()
          isCorrect: true,
          questionId: "q-rec-2",
        },
        {
          isCorrect: true,
          questionId: "q-rec-1",
          earned: 50,
          userAnswer: "A",
        },
      ],
    });
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 50 },
      { attemptId: attempt.id, questionId: "q-rec-2", answer: "B", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recovered).toBe(true);
      expect(res.resultId).toBe("res-rec-permuted");
    }
  });

  // 19. Recovery step 7: concurrent answer insertion with conflicting answer -> ditolak PAYLOAD_CONFLICT
  it("19. Recovery step 7 data-race: refresh jawaban menemukan jawaban konkurensi berbeda -> ditolak PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-race-ans",
      score: 100,
      passed: true,
      mcqScore: 100,
      essayScore: 0,
    });
    // Saat Step 5 findMany kosong, tetapi saat Step 7 freshAnswers menemukan proses lain menulis "X"
    mockPrisma.examAnswer.findMany
      .mockResolvedValueOnce([]) // Step 5: belum ada jawaban
      .mockResolvedValueOnce([{ questionId: "q-rec-1", answer: "X" }]); // Step 7: proses paralel menulis "X"

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("jawaban tersimpan berbeda dengan payload final");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
  });

  // 20. Attempt soft-deleted ditolak sebelum DB queries
  it("20. Attempt soft-deleted (deletedAt != null) -> langsung ditolak NOT_FOUND tanpa query DB", async () => {
    const attempt = makeAttempt({ deletedAt: new Date() });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("NOT_FOUND");
      expect(res.message).toContain("telah dihapus");
    }
    expect(mockPrisma.examResult.create).not.toHaveBeenCalled();
    expect(mockPrisma.examAnswer.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 21. Conditional close count = 1 -> COMPLETED_BY_SELF
  it("21. Conditional close count = 1 -> status COMPLETED_BY_SELF, closedBySelf: true", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe("COMPLETED_BY_SELF");
      expect(res.closedBySelf).toBe(true);
    }
  });

  // 22. count = 0 dan attempt hilang / soft-deleted pasca-close -> NOT_FOUND
  it("22. count = 0 dan attempt hilang / deletedAt != null -> ATTEMPT_MISSING_OR_DELETED (NOT_FOUND)", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce(null);

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CRON",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("ATTEMPT_MISSING_OR_DELETED");
      expect(res.code).toBe("NOT_FOUND");
    }
  });

  // 23. count = 0 dan attempt masih terbuka (submittedAt === null) -> CONCURRENCY_RETRY_REQUIRED
  it("23. count = 0 dan attempt masih terbuka (submittedAt === null) -> CONCURRENCY_RETRY_REQUIRED", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce({
      id: attempt.id,
      submittedAt: null,
      deletedAt: null,
      result: null,
    });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CRON",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("CONCURRENCY_RETRY_REQUIRED");
    }
  });

  // 24. count = 0 dan ExamResult tidak ada -> INVALID_STATE
  it("24. count = 0 dan ExamResult tidak ada -> FINALIZATION_STATE_INCONSISTENT (INVALID_STATE)", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce({
      id: attempt.id,
      submittedAt: new Date(),
      deletedAt: null,
      result: null,
    });

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CRON",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("INVALID_STATE");
    }
  });

  // 25. count = 0 dan konflik dimensi Invariant B (score, passed, status, answersJson)
  it("25a. count = 0 dan konflik score -> PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce({
      id: attempt.id,
      submittedAt: new Date(),
      deletedAt: null,
      result: {
        id: "res-rec-existing",
        score: 50, // Mismatch (expected 100)
        passed: true,
        mcqScore: 100,
        essayScore: 0,
        status: "LULUS",
        answersJson: [
          { questionId: "q-rec-1", userAnswer: "A", earned: 50, isCorrect: true },
          { questionId: "q-rec-2", userAnswer: "B", earned: 50, isCorrect: true },
        ],
      },
    });

    const res = await finalizeExamAttempt({ attempt, callerSource: "CRON" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
    }
  });

  it("25b. count = 0 dan konflik answersJson -> PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce({
      id: attempt.id,
      submittedAt: new Date(),
      deletedAt: null,
      result: {
        id: "res-rec-existing",
        score: 100,
        passed: true,
        mcqScore: 100,
        essayScore: 0,
        status: "LULUS",
        answersJson: [
          { questionId: "q-rec-1", userAnswer: "Z", isCorrect: true, earned: 50 }, // Mismatch answer
          { questionId: "q-rec-2", userAnswer: "B", isCorrect: true, earned: 50 },
        ],
      },
    });

    const res = await finalizeExamAttempt({ attempt, callerSource: "CRON" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.diagnosticDetail).toBeUndefined();
    }
    expect(mockPrisma.examAttempt.update).not.toHaveBeenCalled();
  });

  // 25c. count = 0 dan konflik passed -> PAYLOAD_CONFLICT
  it("25c. count = 0 dan konflik passed -> PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce({
      id: attempt.id,
      submittedAt: new Date(),
      deletedAt: null,
      result: {
        id: "res-rec-existing",
        score: 100,
        passed: false, // Mismatch (expected true)
        mcqScore: 100,
        essayScore: 0,
        status: "LULUS",
        answersJson: [
          { questionId: "q-rec-1", userAnswer: "A", earned: 50, isCorrect: true },
          { questionId: "q-rec-2", userAnswer: "B", earned: 50, isCorrect: true },
        ],
      },
    });

    const res = await finalizeExamAttempt({ attempt, callerSource: "CRON" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.diagnosticDetail).toBeUndefined();
    }
    expect(mockPrisma.examAttempt.update).not.toHaveBeenCalled();
  });

  // 25d. count = 0 dan konflik mcqScore -> PAYLOAD_CONFLICT
  it("25d. count = 0 dan konflik mcqScore -> PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce({
      id: attempt.id,
      submittedAt: new Date(),
      deletedAt: null,
      result: {
        id: "res-rec-existing",
        score: 100,
        passed: true,
        mcqScore: 80, // Mismatch (expected 100)
        essayScore: 0,
        status: "LULUS",
        answersJson: [
          { questionId: "q-rec-1", userAnswer: "A", earned: 50, isCorrect: true },
          { questionId: "q-rec-2", userAnswer: "B", earned: 50, isCorrect: true },
        ],
      },
    });

    const res = await finalizeExamAttempt({ attempt, callerSource: "CRON" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.diagnosticDetail).toBeUndefined();
    }
    expect(mockPrisma.examAttempt.update).not.toHaveBeenCalled();
  });

  // 25e. count = 0 dan konflik essayScore -> PAYLOAD_CONFLICT
  it("25e. count = 0 dan konflik essayScore -> PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce({
      id: attempt.id,
      submittedAt: new Date(),
      deletedAt: null,
      result: {
        id: "res-rec-existing",
        score: 100,
        passed: true,
        mcqScore: 100,
        essayScore: 10, // Mismatch (expected 0)
        status: "LULUS",
        answersJson: [
          { questionId: "q-rec-1", userAnswer: "A", earned: 50, isCorrect: true },
          { questionId: "q-rec-2", userAnswer: "B", earned: 50, isCorrect: true },
        ],
      },
    });

    const res = await finalizeExamAttempt({ attempt, callerSource: "CRON" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.diagnosticDetail).toBeUndefined();
    }
    expect(mockPrisma.examAttempt.update).not.toHaveBeenCalled();
  });

  // 25f. count = 0 dan konflik status -> PAYLOAD_CONFLICT
  it("25f. count = 0 dan konflik status -> PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.examAttempt.findUnique.mockResolvedValueOnce({
      id: attempt.id,
      submittedAt: new Date(),
      deletedAt: null,
      result: {
        id: "res-rec-existing",
        score: 100,
        passed: true,
        mcqScore: 100,
        essayScore: 0,
        status: "TIDAK_LULUS", // Mismatch (expected LULUS)
        answersJson: [
          { questionId: "q-rec-1", userAnswer: "A", earned: 50, isCorrect: true },
          { questionId: "q-rec-2", userAnswer: "B", earned: 50, isCorrect: true },
        ],
      },
    });

    const res = await finalizeExamAttempt({ attempt, callerSource: "CRON" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.diagnosticDetail).toBeUndefined();
    }
    expect(mockPrisma.examAttempt.update).not.toHaveBeenCalled();
  });

  // 26. Database exception pada updateMany diteruskan sebagai kegagalan (tidak ditafsirkan sebagai count = 0)
  it("26. DB exception pada updateMany -> dilempar, bukan dianggap count = 0", async () => {
    const attempt = makeAttempt();
    mockPrisma.examAttempt.updateMany.mockRejectedValueOnce(new Error("Connection reset by peer"));

    await expect(
      finalizeExamAttempt({
        attempt,
        callerSource: "CRON",
      }),
    ).rejects.toThrow("Connection reset by peer");
  });

  // 27. Missing updateMany delegate melempar error konfigurasi eksplisit
  it("27. Prisma mock tanpa updateMany -> melempar error konfigurasi eksplisit tanpa fallback", async () => {
    const attempt = makeAttempt();
    const originalUpdateMany = mockPrisma.examAttempt.updateMany;
    delete (mockPrisma.examAttempt as Record<string, unknown>).updateMany;

    try {
      await expect(
        finalizeExamAttempt({
          attempt,
          callerSource: "CRON",
        }),
      ).rejects.toThrow(
        "PrismaClient delegate does not support updateMany. Unconditional update fallback is prohibited.",
      );
    } finally {
      mockPrisma.examAttempt.updateMany = originalUpdateMany;
    }
  });

  // =========================================================================
  // TASK 03L.2E.4.10B — ExamAnswer Full-Field Consistency & Recovery Guards (Tests 28-36)
  // =========================================================================

  // 28. Existing answers cocok pada seluruh field
  it("28. Existing answers cocok pada seluruh 5 field -> sukses tanpa memanggil createMany", async () => {
    const attempt = makeAttempt();
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 50 },
      { attemptId: attempt.id, questionId: "q-rec-2", answer: "B", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe("COMPLETED_BY_SELF");
    }
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalled();
  });

  // 29. Konflik answer
  it("29. Konflik field answer -> fail-closed PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "WRONG_ANSWER", isCorrect: true, earnedPoints: 50 },
      { attemptId: attempt.id, questionId: "q-rec-2", answer: "B", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("jawaban tersimpan berbeda dengan payload final");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 30. Konflik isCorrect
  it("30. Konflik field isCorrect -> fail-closed PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: false, earnedPoints: 50 }, // expected: true
      { attemptId: attempt.id, questionId: "q-rec-2", answer: "B", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("status penilaian isCorrect berbeda");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 31. Konflik earnedPoints
  it("31. Konflik field earnedPoints -> fail-closed PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 20 }, // expected: 50
      { attemptId: attempt.id, questionId: "q-rec-2", answer: "B", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("earnedPoints berbeda");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 32. Partial-answer completion
  it("32. Partial-answer completion: menyisipkan missing answer lalu memverifikasi seluruhnya", async () => {
    const attempt = makeAttempt();
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe("COMPLETED_BY_SELF");
    }
    expect(mockPrisma.examAnswer.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          attemptId: attempt.id,
          questionId: "q-rec-2",
          answer: "B",
          isCorrect: true,
          earnedPoints: 50,
        }),
      ],
      skipDuplicates: true,
    });
    expect(answerTable).toHaveLength(2);
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalled();
  });

  // 33. Extra/unexpected answer
  it("33. Extra/unexpected answer yang tidak ada di snapshot -> fail-closed PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 50 },
      { attemptId: attempt.id, questionId: "q-extra-unknown", answer: "X", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("jawaban ekstra tidak terdaftar dalam snapshot");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 34. Konflik yang disuntikkan setelah pemeriksaan awal pada jalur non-recovery
  it("34. Konflik disuntikkan setelah pre-check pada non-recovery -> post-insert recheck fail-closed", async () => {
    const attempt = makeAttempt();

    mockPrisma.examAnswer.findMany
      .mockImplementationOnce(async () => []) // Step 5 pre-check
      .mockImplementationOnce(async () => []) // Step 7 pre-insert recheck
      .mockImplementationOnce(async () => [   // Step 7 post-insert recheck
        { attemptId: attempt.id, questionId: "q-rec-1", answer: "INJECTED_CONFLICT", isCorrect: true, earnedPoints: 50 },
        { attemptId: attempt.id, questionId: "q-rec-2", answer: "B", isCorrect: true, earnedPoints: 50 },
      ]);

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("jawaban tersimpan berbeda dengan payload final");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  // 35. Recovery ketika result sudah tersimpan tetapi jawaban belum lengkap
  it("35. Recovery ketika result sudah tersimpan tetapi jawaban belum lengkap -> dilengkapi dan ditutup", async () => {
    const attempt = makeAttempt({ submittedAt: null });
    mockPrisma.examResult.create.mockRejectedValueOnce(p2002(["attemptId"]));
    mockPrisma.examResult.findUnique.mockResolvedValueOnce({
      id: "res-rec-existing",
      score: 100,
      passed: true,
      mcqScore: 100,
      essayScore: 0,
      status: "LULUS",
      answersJson: [
        { questionId: "q-rec-1", userAnswer: "A", earned: 50, isCorrect: true },
        { questionId: "q-rec-2", userAnswer: "B", earned: 50, isCorrect: true },
      ],
    });
    answerTable = [
      { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 50 },
    ];

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CRON",
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.recovered).toBe(true);
      expect(res.resultId).toBe("res-rec-existing");
    }
    expect(mockPrisma.examAnswer.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          attemptId: attempt.id,
          questionId: "q-rec-2",
          answer: "B",
          isCorrect: true,
          earnedPoints: 50,
        }),
      ],
      skipDuplicates: true,
    });
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: attempt.id, submittedAt: null },
      data: { submittedAt: expect.any(Date) },
    });
  });

  // 36. Konsistensi seluruh jawaban sebelum finalisasi dinyatakan sukses
  it("36. Post-insert recheck menemukan baris belum lengkap -> fail-closed PAYLOAD_CONFLICT", async () => {
    const attempt = makeAttempt();

    mockPrisma.examAnswer.findMany
      .mockImplementationOnce(async () => []) // Step 5 pre-check
      .mockImplementationOnce(async () => []) // Step 7 pre-insert recheck
      .mockImplementationOnce(async () => [   // Step 7 post-insert recheck: hanya 1 row dari 2
        { attemptId: attempt.id, questionId: "q-rec-1", answer: "A", isCorrect: true, earnedPoints: 50 },
      ]);

    const res = await finalizeExamAttempt({
      attempt,
      callerSource: "CANDIDATE",
      submittedAnswers: [
        { questionId: "q-rec-1", answer: "A" },
        { questionId: "q-rec-2", answer: "B" },
      ],
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe("FINALIZATION_STATE_INCONSISTENT");
      expect(res.code).toBe("PAYLOAD_CONFLICT");
      expect(res.message).toContain("Kelengkapan jawaban ujian pasca-penulisan tidak konsisten");
    }
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });
});
