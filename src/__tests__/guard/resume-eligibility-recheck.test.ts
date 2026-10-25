import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ============================================================================
// TASK 03L.2E.4.6 — F2: eligibility diulang pada jalur resume sesi ujian.
//
// `startExamSession` hanya memanggil `assertEligibilityStillValid` pada jalur
// create attempt baru. Jalur resume (`existing` ditemukan) mengembalikan
// snapshot soal + jawaban tersimpan tanpa re-check, sehingga admin yang mencabut
// kelayakan (DITERIMA -> DITOLAK / soft-delete) di tengah sesi tetap bisa
// membaca dan melanjutkan attempt.
//
// Mock application.findFirst bersifat where-aware DAN berantakan sehingga
// pemeriksaan guard awal (WHERE userId+recruitmentPeriodId) tetap melewati
// fixture DITERIMA, sementara pemeriksaan final (WHERE id + status DITERIMA +
// deletedAt null) ditolak oleh fixture DITOLAK / soft-deleted.
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

const SNAPSHOT_QUESTION = {
  id: "q1",
  type: "MCQ",
  question: "Rahasia soal",
  options: ["A", "B"],
  correctKey: "A",
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

function matchWhere(
  row: Record<string, unknown> | null,
  where: Record<string, unknown> | undefined,
): boolean {
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
  rp: unknown;
  application: unknown;
  attendance: unknown;
  attempt: unknown;
  resultForAttempt: unknown;
  createImpl: (() => Promise<unknown>) | null;
  resultCreateImpl: (() => Promise<unknown>) | null;
} = {
  periods: [PERIOD],
  rp: RP,
  application: appFixture("DITERIMA"),
  attendance: ATTENDANCE,
  attempt: null,
  resultForAttempt: null,
  createImpl: null,
  resultCreateImpl: null,
};

const mockPrisma = {
  examPeriod: {
    findMany: vi.fn(async () => state.periods),
    findFirst: vi.fn(async () => PERIOD),
  },
  recruitmentPeriod: { findUnique: vi.fn(async () => state.rp) },
  application: {
    findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
      matchWhere(state.application as Record<string, unknown> | null, args?.where)
        ? state.application
        : null,
    ),
  },
  attendance: { findFirst: vi.fn(async () => state.attendance) },
  examAttempt: {
    findUnique: vi.fn(async () => state.attempt),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      if (state.createImpl) return state.createImpl();
      return { id: "attempt-new", startedAt: new Date(), ...args.data };
    }),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
    delete: vi.fn(async () => ({})),
  },
  examResult: {
    findUnique: vi.fn(async () => state.resultForAttempt),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      if (state.resultCreateImpl) return state.resultCreateImpl();
      return { id: "res-new", ...args.data };
    }),
  },
  examAnswer: { createMany: vi.fn(async () => ({ count: 0 })) },
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

const { startExamSession, submitExam } = await import("@/lib/exam-service");

function existingAttempt(over: Record<string, unknown> = {}) {
  return {
    id: "att-existing",
    userId: "user-1",
    periodId: "ep-1",
    attemptKey: "ep-1_user-1",
    startedAt: new Date(Date.now() - 60_000),
    submittedAt: null,
    questionsJson: [SNAPSHOT_QUESTION],
    savedAnswers: { q1: "A" },
    flaggedQuestions: [],
    bookmarkedQuestions: [],
    ...over,
  };
}

function reset(over: Partial<typeof state> = {}) {
  state.periods = [PERIOD];
  state.rp = RP;
  state.application = appFixture("DITERIMA");
  state.attendance = ATTENDANCE;
  state.attempt = null;
  state.resultForAttempt = null;
  state.createImpl = null;
  state.resultCreateImpl = null;
  Object.assign(state, over);
  vi.clearAllMocks();

  // mockImplementation pada mockPrisma bertahan antar test (clearAllMocks tidak
  // mereset implementation), jadi default-nya dipasang ulang secara eksplisit.
  mockPrisma.application.findFirst.mockImplementation(async (args?: { where?: Record<string, unknown> }) =>
    matchWhere(state.application as Record<string, unknown> | null, args?.where)
      ? state.application
      : null,
  );
  mockPrisma.examAttempt.findUnique.mockImplementation(async () => state.attempt);
  mockPrisma.examResult.findUnique.mockImplementation(async () => state.resultForAttempt);
}

beforeEach(() => reset());

// ---------------------------------------------------------------------------
// F2 — re-check eligibility pada jalur resume.
// ---------------------------------------------------------------------------

describe("F2 — startExamSession jalur resume melakukan re-check eligibility", () => {
  it("1. attempt ada + Application DITERIMA -> sesi resume tetap dikembalikan", async () => {
    reset({ attempt: existingAttempt() });

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attemptId).toBe("att-existing");
      expect(result.savedAnswers).toEqual({ q1: "A" });
      expect(result.questions).toHaveLength(1);
    }
    // Re-check dijalankan: 1 call guard awal + 1 call re-check di jalur resume.
    expect(mockPrisma.application.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("2. Application DITERIMA -> DITOLAK sebelum resume -> NOT_ELIGIBLE, tanpa sesi", async () => {
    reset({ attempt: existingAttempt() });
    // Re-check membaca fixture DITOLAK sementara pemeriksaan guard awal sudah lewat.
    state.application = appFixture("DITOLAK");

    const result = await startExamSession(USER as never);

    // Guard awal membaca DITOLAK -> ditolak di gerbang pertama (tetap fail-closed).
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_ELIGIBLE");
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("3. status berubah DITERIMA -> DITOLAK ANTARA guard dan resume -> tidak ada sesi", async () => {
    reset({ attempt: existingAttempt() });
    // Antrean where-aware: call #1 (guard awal) DITERIMA, call #2 (re-check resume) DITOLAK.
    const queue = [appFixture("DITERIMA"), appFixture("DITOLAK")];
    mockPrisma.application.findFirst.mockImplementation(
      async (args?: { where?: Record<string, unknown> }) => {
        const row = queue.shift() ?? null;
        return matchWhere(row as Record<string, unknown> | null, args?.where) ? row : null;
      },
    );

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_ELIGIBLE");
      expect(result.message).toMatch(/kelayakan berubah/i);
    }
    expect(mockPrisma.application.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("4. Application di-soft-delete sebelum resume -> tidak ada sesi", async () => {
    reset({ attempt: existingAttempt() });
    const queue = [
      appFixture("DITERIMA"),
      appFixture("DITERIMA", { deletedAt: new Date("2026-01-10T00:00:00.000Z") }),
    ];
    mockPrisma.application.findFirst.mockImplementation(
      async (args?: { where?: Record<string, unknown> }) => {
        const row = queue.shift() ?? null;
        return matchWhere(row as Record<string, unknown> | null, args?.where) ? row : null;
      },
    );

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_ELIGIBLE");
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("5. attempt sudah submitted + hasil ada -> ALREADY_SUBMITTED (perilaku dipertahankan)", async () => {
    reset({
      attempt: existingAttempt({ submittedAt: new Date("2026-01-10T00:00:00.000Z") }),
      resultForAttempt: { id: "res-1", attemptId: "att-existing" },
    });

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ALREADY_SUBMITTED");
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("6. jalur create baru tetap satu re-check (tidak ganda)", async () => {
    reset();

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(true);
    // 1 guard awal + 1 re-check di batas penulisan create.
    expect(mockPrisma.application.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.examAttempt.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TASK 03L.2E.4.7 — rechek eligibility sebelum `examAttempt.delete` auto-heal.
//
// Auto-heal menghapus attempt yang sudah submitted lalu hasht-nya dihapus admin
// ("Hapus Rekap Nilai"), supaya casis boleh mengulang. `delete` adalah write, dan
// sebelumnya berjalan tanpa re-check kelayakan: peserta yang kelayakannya
// dicabut di tengah request tetap dapat membuat attempt lamanya dihapus.
// ---------------------------------------------------------------------------

describe("Auto-heal — re-check eligibility sebelum examAttempt.delete", () => {
  const SUBMITTED_NO_RESULT = existingAttempt({
    submittedAt: new Date("2026-01-10T00:00:00.000Z"),
  });

  it("7. auto-heal normal (masih DITERIMA, hasil sudah dihapus) -> delete lalu create baru", async () => {
    reset({ attempt: SUBMITTED_NO_RESULT, resultForAttempt: null });

    const result = await startExamSession(USER as never);

    // Fitur existing harus tetap bekerja.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attemptId).toBe("attempt-new");
    expect(mockPrisma.examAttempt.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "att-existing" } }),
    );
    expect(mockPrisma.examAttempt.create).toHaveBeenCalledTimes(1);
  });

  it("8. ALREADY_SUBMITTED tidak menambah re-check (jalur tanpa side effect)", async () => {
    reset({
      attempt: SUBMITTED_NO_RESULT,
      resultForAttempt: { id: "res-1", attemptId: "att-existing" },
    });

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ALREADY_SUBMITTED");
    // Tidak ada write sama sekali, jadi tidak perlu re-check tambahan.
    expect(mockPrisma.examAttempt.delete).not.toHaveBeenCalled();
    // Hanya guard awal.
    expect(mockPrisma.application.findFirst).toHaveBeenCalledTimes(1);
  });

  it("9. kelayakan DITERIMA -> DITOLAK sebelum auto-heal -> attempt TIDAK dihapus, NOT_ELIGIBLE", async () => {
    reset({ attempt: SUBMITTED_NO_RESULT, resultForAttempt: null });
    // Call #1 (guard awal) DITERIMA, call #2 (re-check sebelum delete) DITOLAK.
    const queue = [appFixture("DITERIMA"), appFixture("DITOLAK")];
    mockPrisma.application.findFirst.mockImplementation(
      async (args?: { where?: Record<string, unknown> }) => {
        const row = queue.shift() ?? null;
        return matchWhere(row as Record<string, unknown> | null, args?.where) ? row : null;
      },
    );

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_ELIGIBLE");
      expect(result.message).toMatch(/kelayakan berubah/i);
    }
    // Data peserta harus utuh: tidak dihapus, tidak dibuat ulang.
    expect(mockPrisma.examAttempt.delete).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("10. Application di-soft-delete sebelum auto-heal -> attempt TIDAK dihapus", async () => {
    reset({ attempt: SUBMITTED_NO_RESULT, resultForAttempt: null });
    const queue = [
      appFixture("DITERIMA"),
      appFixture("DITERIMA", { deletedAt: new Date("2026-01-10T00:00:00.000Z") }),
    ];
    mockPrisma.application.findFirst.mockImplementation(
      async (args?: { where?: Record<string, unknown> }) => {
        const row = queue.shift() ?? null;
        return matchWhere(row as Record<string, unknown> | null, args?.where) ? row : null;
      },
    );

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_ELIGIBLE");
    expect(mockPrisma.examAttempt.delete).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it("11. auto-heal yang berhasil tetap menjalankan re-check di batas write create", async () => {
    reset({ attempt: SUBMITTED_NO_RESULT, resultForAttempt: null });

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(true);
    // guard awal + re-check sebelum delete + re-check sebelum create = 3.
    expect(mockPrisma.application.findFirst).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// F3 — target P2002 pada ExamAttempt.create / ExamResult.create.
// ---------------------------------------------------------------------------

function p2002(target?: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: target === undefined ? undefined : { target },
  });
}

describe("F3 — ExamAttempt.create: hanya target percobaan-ganda yang idempoten", () => {
  const RACED = existingAttempt({ id: "attempt-raced" });

  it("7. target attemptKey -> resume idempotent (bukan 500)", async () => {
    reset();
    state.createImpl = async () => {
      throw p2002(["attemptKey"]);
    };
    const queue = [null, RACED];
    mockPrisma.examAttempt.findUnique.mockImplementation(async () => queue.shift() ?? null);

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attemptId).toBe("attempt-raced");
  });

  it("8. target @@unique([periodId,userId]) -> juga idempotent (constraint yang sama)", async () => {
    reset();
    state.createImpl = async () => {
      throw p2002(["periodId", "userId"]);
    };
    const queue = [null, RACED];
    mockPrisma.examAttempt.findUnique.mockImplementation(async () => queue.shift() ?? null);

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attemptId).toBe("attempt-raced");
  });

  it("9. target string (nama index) -> idempotent", async () => {
    reset();
    state.createImpl = async () => {
      throw p2002("ExamAttempt_attemptKey_key");
    };
    const queue = [null, RACED];
    mockPrisma.examAttempt.findUnique.mockImplementation(async () => queue.shift() ?? null);

    const result = await startExamSession(USER as never);

    expect(result.ok).toBe(true);
  });

  it("10. target BERBEDA -> dilempar, bukan dianggap sukses", async () => {
    reset();
    state.createImpl = async () => {
      throw p2002(["seed"]);
    };
    const queue = [null, RACED];
    mockPrisma.examAttempt.findUnique.mockImplementation(async () => queue.shift() ?? null);

    await expect(startExamSession(USER as never)).rejects.toThrow();
  });

  it("11. target tidak ada -> dilempar, bukan dianggap sukses", async () => {
    reset();
    state.createImpl = async () => {
      throw p2002();
    };
    const queue = [null, RACED];
    mockPrisma.examAttempt.findUnique.mockImplementation(async () => queue.shift() ?? null);

    await expect(startExamSession(USER as never)).rejects.toThrow();
  });
});

describe("F3 — ExamResult.create: hanya target attemptId yang idempoten", () => {
  const ATTEMPT_FOR_SUBMIT = {
    id: "att-1",
    userId: "user-1",
    periodId: "ep-1",
    startedAt: new Date(Date.now() - 60_000),
    submittedAt: null,
    questionsJson: [SNAPSHOT_QUESTION],
    period: { passThreshold: 70 },
  };

  // Mirip kondisi DB nyata: hasil untuk attempt ini SUDAH ada di tabel.
  // Ini yang membuat tes di bawah diskriminatif — bila handler memakai
  // "semua P2002 = idempoten" (perilaku pre-F3), findUnique akan mengembalikan
  // hasil ini dan handler melaporkan { ok: true, resultId } untuk konflik yang
  // BUKAN miliknya, lalu menandai attempt sebagai submitted.
  const EXISTING_RESULT = { id: "res-existing", attemptId: "att-1" };

  it("12. target attemptId -> kembalikan hasil yang ada (idempotent)", async () => {
    reset({ resultForAttempt: EXISTING_RESULT });
    mockPrisma.examAttempt.findUnique.mockImplementation(async () => ATTEMPT_FOR_SUBMIT);
    state.resultCreateImpl = async () => {
      throw p2002(["attemptId"]);
    };

    const result = await submitExam(USER as never, { attemptId: "att-1", answers: [{ questionId: "q1", answer: "A" }] });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resultId).toBe("res-existing");
    // Idempoten yang sah tetap menutup attempt-nya (perilaku existing dipertahankan).
    expect(mockPrisma.examAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-1", submittedAt: null },
        data: expect.objectContaining({ submittedAt: expect.any(Date) }),
      }),
    );
  });

  it("13. target BERBEDA -> dilempar, TIDAK dilaporkan sukses walau hasil untuk attempt itu ADA", async () => {
    reset({ resultForAttempt: EXISTING_RESULT });
    mockPrisma.examAttempt.findUnique.mockImplementation(async () => ATTEMPT_FOR_SUBMIT);
    state.resultCreateImpl = async () => {
      throw p2002(["id"]);
    };

    // Konflik P2002 dengan target yang tidak dikenal harus dilempar apa adanya.
    await expect(
      submitExam(USER as never, { attemptId: "att-1", answers: [{ questionId: "q1", answer: "A" }] }),
    ).rejects.toThrow();

    // Tidak boleh ditelan sebagai submit sukses ...
    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
    // ... dan tidak boleh menandai attempt sebagai submitted.
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  it("14. target tidak ada -> dilempar, TIDAK dilaporkan sukses walau hasil untuk attempt itu ADA", async () => {
    reset({ resultForAttempt: EXISTING_RESULT });
    mockPrisma.examAttempt.findUnique.mockImplementation(async () => ATTEMPT_FOR_SUBMIT);
    state.resultCreateImpl = async () => {
      throw p2002();
    };

    await expect(
      submitExam(USER as never, { attemptId: "att-1", answers: [{ questionId: "q1", answer: "A" }] }),
    ).rejects.toThrow();

    expect(mockPrisma.examAnswer.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });

  it("15. handler TIDAK boleh mengembalikan {ok:true,resultId} untuk konflik yang tidak dikenal", async () => {
    // Guard eksplisit terhadap regresi: apa pun yang terjadi, hasil submitExam
    // tidak boleh berupa sukses-butuh-penolakan ini.
    reset({ resultForAttempt: EXISTING_RESULT });
    mockPrisma.examAttempt.findUnique.mockImplementation(async () => ATTEMPT_FOR_SUBMIT);
    state.resultCreateImpl = async () => {
      throw p2002(["discordMessageId"]);
    };

    const outcome = await submitExam(USER as never, {
      attemptId: "att-1",
      answers: [{ questionId: "q1", answer: "A" }],
    }).then(
      (r) => ({ resolved: true, r }),
      (e: unknown) => ({ resolved: false, e }),
    );

    expect(outcome.resolved).toBe(false);
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
  });
});