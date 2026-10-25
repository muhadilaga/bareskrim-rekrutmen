import { describe, expect, it, vi } from "vitest";
import {
  CandidateGuardError,
  requireCurrentCandidateEligibility,
  requireOwnedHistoricalResource,
  type CandidateGuardDb,
  type CandidateGuardUser,
} from "../candidate-guard";

// ---------------------------------------------------------------------------
// Fixtures — record shape mengikuti prisma/schema.prisma aktual
// ---------------------------------------------------------------------------

const baseUser: CandidateGuardUser = {
  id: "user-1",
  username: "CasisSatu",
  displayName: "Casis Satu",
  discordUsername: "casis.satudiscord",
  matraBlocked: false,
  bannedGroupIds: null,
  deletedAt: null,
};

function periodFixture(over: Record<string, unknown> = {}) {
  return {
    id: "ep-1",
    name: "Periode Ujian 1",
    recruitmentPeriodId: "rp-1",
    isActive: true,
    isAttendanceOpen: false,
    isExamOpen: true,
    examStartTime: null,
    examEndTime: null,
    seed: 12345,
    mcqCount: 15,
    essayCount: 5,
    passThreshold: 70,
    openedAt: new Date("2026-01-01T00:00:00.000Z"),
    closedAt: null,
    ...over,
  };
}

function rpFixture(over: Record<string, unknown> = {}) {
  return {
    id: "rp-1",
    code: "XLI-01",
    name: "Angkatan XLI Gel 1",
    isActive: true,
    openedAt: new Date("2026-01-01T00:00:00.000Z"),
    closedAt: new Date("2026-02-01T00:00:00.000Z"),
    deletedAt: null,
    ...over,
  };
}

function appFixture(over: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    registrationId: "XLI-01-ABC123",
    recruitmentPeriodId: "rp-1",
    status: "DITERIMA",
    verifiedAt: new Date("2026-01-05T00:00:00.000Z"),
    userId: "user-1",
    deletedAt: null,
    ...over,
  };
}

function attemptFixture(over: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    userId: "user-1",
    periodId: "ep-1",
    attemptKey: "ep-1_user-1",
    startedAt: new Date("2026-01-10T00:00:00.000Z"),
    submittedAt: new Date("2026-01-10T01:00:00.000Z"),
    ...over,
  };
}

function resultFixture(over: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    attemptId: "att-1",
    score: 80,
    maxScore: 100,
    mcqScore: 50,
    essayScore: 30,
    status: "LULUS",
    passed: true,
    submittedAt: new Date("2026-01-10T01:00:00.000Z"),
    attempt: { id: "att-1", userId: "user-1", periodId: "ep-1" },
    ...over,
  };
}

function attendanceFixture(over: Record<string, unknown> = {}) {
  return {
    id: "abs-1",
    userId: "user-1",
    periodId: "ep-1",
    tahap: "AKADEMIK",
    status: "HADIR",
    discordUserId: "123456789",
    roleEligible: true,
    createdAt: new Date("2026-01-09T00:00:00.000Z"),
    ...over,
  };
}

/** Mock db double — shape sama dengan CandidateGuardDb (DI, tanpa Prisma). */
function makeDb(over: Record<string, unknown> = {}): CandidateGuardDb {
  const base = {
    examPeriod: { findMany: vi.fn(async () => [periodFixture()]) },
    recruitmentPeriod: { findUnique: vi.fn(async () => rpFixture()) },
    application: { findFirst: vi.fn(async () => appFixture()) },
    examAttempt: { findFirst: vi.fn(async () => null) },
    examResult: { findFirst: vi.fn(async () => null) },
    attendance: { findFirst: vi.fn(async () => null) },
  };
  return { ...base, ...over } as unknown as CandidateGuardDb;
}

async function expectGuardError(promise: Promise<unknown>, code: string): Promise<void> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(CandidateGuardError);
  expect((err as CandidateGuardError).code).toBe(code);
}

// ---------------------------------------------------------------------------
// requireCurrentCandidateEligibility
// ---------------------------------------------------------------------------

describe("requireCurrentCandidateEligibility", () => {
  it("1. Application DITERIMA -> PASS + context aman", async () => {
    const db = makeDb();
    const ctx = await requireCurrentCandidateEligibility(db, baseUser);

    expect(ctx.user.id).toBe("user-1");
    expect(ctx.user.username).toBe("CasisSatu");
    expect(ctx.application.status).toBe("DITERIMA");
    expect(ctx.application.registrationId).toBe("XLI-01-ABC123");
    expect(ctx.examPeriod.id).toBe("ep-1");
    expect(ctx.recruitmentPeriod.id).toBe("rp-1");
    // Tidak ada field sensitif di context
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain("accessTokenHash");
    expect(serialized).not.toContain("questionsJson");
    expect(serialized).not.toContain("password");
  });

  it("2. tanpa trusted user -> UNAUTHENTICATED", async () => {
    const db = makeDb();
    await expectGuardError(requireCurrentCandidateEligibility(db, null), "UNAUTHENTICATED");
    await expectGuardError(requireCurrentCandidateEligibility(db, undefined), "UNAUTHENTICATED");
    await expectGuardError(
      requireCurrentCandidateEligibility(db, { id: "", username: "x" }),
      "UNAUTHENTICATED",
    );
  });

  it("3. blocked user (matraBlocked / deletedAt) -> USER_BLOCKED", async () => {
    const db = makeDb();
    await expectGuardError(
      requireCurrentCandidateEligibility(db, { ...baseUser, matraBlocked: true }),
      "USER_BLOCKED",
    );
    await expectGuardError(
      requireCurrentCandidateEligibility(db, {
        ...baseUser,
        deletedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      "USER_BLOCKED",
    );
  });

  it("4. tidak ada ExamPeriod aktif -> NO_ACTIVE_PERIOD", async () => {
    const db = makeDb({ examPeriod: { findMany: vi.fn(async () => []) } });
    await expectGuardError(requireCurrentCandidateEligibility(db, baseUser), "NO_ACTIVE_PERIOD");
  });

  it("5. lebih dari satu ExamPeriod aktif -> AMBIGUOUS_ACTIVE_PERIOD (fail closed)", async () => {
    const db = makeDb({
      examPeriod: {
        findMany: vi.fn(async () => [periodFixture(), periodFixture({ id: "ep-2" })]),
      },
    });
    await expectGuardError(
      requireCurrentCandidateEligibility(db, baseUser),
      "AMBIGUOUS_ACTIVE_PERIOD",
    );
  });

  it("6. ExamPeriod aktif tanpa mapping -> PERIOD_UNMAPPED", async () => {
    const db = makeDb({
      examPeriod: { findMany: vi.fn(async () => [periodFixture({ recruitmentPeriodId: null })]) },
    });
    await expectGuardError(requireCurrentCandidateEligibility(db, baseUser), "PERIOD_UNMAPPED");
  });

  it("7. RecruitmentPeriod parent tidak ada -> RECRUITMENT_PERIOD_INVALID", async () => {
    const db = makeDb({ recruitmentPeriod: { findUnique: vi.fn(async () => null) } });
    await expectGuardError(
      requireCurrentCandidateEligibility(db, baseUser),
      "RECRUITMENT_PERIOD_INVALID",
    );
  });

  it("8. RecruitmentPeriod parent soft-deleted -> RECRUITMENT_PERIOD_INVALID", async () => {
    const db = makeDb({
      recruitmentPeriod: {
        findUnique: vi.fn(async () => rpFixture({ deletedAt: new Date("2026-01-01T00:00:00.000Z") })),
      },
    });
    await expectGuardError(
      requireCurrentCandidateEligibility(db, baseUser),
      "RECRUITMENT_PERIOD_INVALID",
    );
  });

  it("9. tidak ada Application untuk mapped period -> APPLICATION_NOT_FOUND_FOR_PERIOD", async () => {
    const db = makeDb({ application: { findFirst: vi.fn(async () => null) } });
    await expectGuardError(
      requireCurrentCandidateEligibility(db, baseUser),
      "APPLICATION_NOT_FOUND_FOR_PERIOD",
    );
  });

  it("10. Application milik user berbeda -> fail", async () => {
    const db = makeDb({ application: { findFirst: vi.fn(async () => appFixture({ userId: "user-OTHER" })) } });
    await expectGuardError(
      requireCurrentCandidateEligibility(db, baseUser),
      "APPLICATION_NOT_FOUND_FOR_PERIOD",
    );
  });

  it("11. Application untuk RecruitmentPeriod berbeda -> fail + query ter-scope recruitmentPeriodId", async () => {
    const findApplication = vi.fn(async (_args: unknown) =>
      appFixture({ recruitmentPeriodId: "rp-LAIN" }),
    );
    const db = makeDb({ application: { findFirst: findApplication } });
    await expectGuardError(
      requireCurrentCandidateEligibility(db, baseUser),
      "APPLICATION_NOT_FOUND_FOR_PERIOD",
    );
    // Ownership di-scope ke period yang dipetakan, bukan period sembarang
    expect(findApplication.mock.calls.length).toBeGreaterThan(0);
    expect(findApplication.mock.calls[0][0]).toMatchObject({
      where: { userId: "user-1", recruitmentPeriodId: "rp-1", deletedAt: null },
    });
  });

  it("12. Application soft-deleted -> fail", async () => {
    const db = makeDb({
      application: {
        findFirst: vi.fn(async () => appFixture({ deletedAt: new Date("2026-01-01T00:00:00.000Z") })),
      },
    });
    await expectGuardError(
      requireCurrentCandidateEligibility(db, baseUser),
      "APPLICATION_NOT_FOUND_FOR_PERIOD",
    );
  });

  it("13. MENUNGGU_VERIFIKASI -> APPLICATION_PENDING", async () => {
    const db = makeDb({ application: { findFirst: vi.fn(async () => appFixture({ status: "MENUNGGU_VERIFIKASI" })) } });
    await expectGuardError(requireCurrentCandidateEligibility(db, baseUser), "APPLICATION_PENDING");
  });

  it("14. DITOLAK -> APPLICATION_REJECTED", async () => {
    const db = makeDb({ application: { findFirst: vi.fn(async () => appFixture({ status: "DITOLAK" })) } });
    await expectGuardError(requireCurrentCandidateEligibility(db, baseUser), "APPLICATION_REJECTED");
  });

  it("15. DITERIMA -> PASS", async () => {
    const db = makeDb();
    const ctx = await requireCurrentCandidateEligibility(db, baseUser);
    expect(ctx.application.status).toBe("DITERIMA");
  });

  it("16. DB failure -> GUARD_UNAVAILABLE (bukan eligibility failure)", async () => {
    const db = makeDb({
      examPeriod: {
        findMany: vi.fn(async () => {
          throw new Error("connection refused");
        }),
      },
    });
    await expectGuardError(requireCurrentCandidateEligibility(db, baseUser), "GUARD_UNAVAILABLE");
  });

  it("16b. query Application gagal -> GUARD_UNAVAILABLE", async () => {
    const db = makeDb({
      application: {
        findFirst: vi.fn(async () => {
          throw new Error("db timeout");
        }),
      },
    });
    await expectGuardError(requireCurrentCandidateEligibility(db, baseUser), "GUARD_UNAVAILABLE");
  });
});

// ---------------------------------------------------------------------------
// requireOwnedHistoricalResource
// ---------------------------------------------------------------------------

describe("requireOwnedHistoricalResource", () => {
  it("17. ExamAttempt milik sendiri -> PASS", async () => {
    const db = makeDb({ examAttempt: { findFirst: vi.fn(async () => attemptFixture()) } });
    const out = await requireOwnedHistoricalResource(db, baseUser, { kind: "examAttempt", id: "att-1" });

    expect(out.kind).toBe("examAttempt");
    expect(out.resource.userId).toBe("user-1");
    expect(out.resource.periodId).toBe("ep-1");
    // questionsJson (berisi correctKey) sengaja tidak ikut
    expect(out.resource).not.toHaveProperty("questionsJson");
  });

  it("18. ExamAttempt milik user lain -> RESOURCE_FORBIDDEN", async () => {
    const db = makeDb({
      examAttempt: { findFirst: vi.fn(async () => attemptFixture({ userId: "user-OTHER" })) },
    });
    await expectGuardError(
      requireOwnedHistoricalResource(db, baseUser, { kind: "examAttempt", id: "att-1" }),
      "RESOURCE_FORBIDDEN",
    );
  });

  it("19. ExamResult milik sendiri (ownership via attempt.userId) -> PASS", async () => {
    const db = makeDb({ examResult: { findFirst: vi.fn(async () => resultFixture()) } });
    const out = await requireOwnedHistoricalResource(db, baseUser, { kind: "examResult", id: "res-1" });

    expect(out.kind).toBe("examResult");
    expect(out.resource.attemptUserId).toBe("user-1");
    expect(out.resource.score).toBe(80);
  });

  it("20. ExamResult milik user lain -> RESOURCE_FORBIDDEN", async () => {
    const db = makeDb({
      examResult: {
        findFirst: vi.fn(async () => resultFixture({ attempt: { id: "att-9", userId: "user-OTHER", periodId: "ep-9" } })),
      },
    });
    await expectGuardError(
      requireOwnedHistoricalResource(db, baseUser, { kind: "examResult", id: "res-1" }),
      "RESOURCE_FORBIDDEN",
    );
  });

  it("21. Attendance milik sendiri -> PASS", async () => {
    const db = makeDb({ attendance: { findFirst: vi.fn(async () => attendanceFixture()) } });
    const out = await requireOwnedHistoricalResource(db, baseUser, { kind: "attendance", id: "abs-1" });

    expect(out.kind).toBe("attendance");
    expect(out.resource.userId).toBe("user-1");
  });

  it("22. Attendance milik user lain / belum di-link -> RESOURCE_FORBIDDEN", async () => {
    const dbOther = makeDb({
      attendance: { findFirst: vi.fn(async () => attendanceFixture({ userId: "user-OTHER" })) },
    });
    await expectGuardError(
      requireOwnedHistoricalResource(dbOther, baseUser, { kind: "attendance", id: "abs-1" }),
      "RESOURCE_FORBIDDEN",
    );

    const dbNull = makeDb({
      attendance: { findFirst: vi.fn(async () => attendanceFixture({ userId: null })) },
    });
    await expectGuardError(
      requireOwnedHistoricalResource(dbNull, baseUser, { kind: "attendance", id: "abs-1" }),
      "RESOURCE_FORBIDDEN",
    );
  });

  it("23. ownership historis tetap PASS walau Application saat ini tidak DITERIMA", async () => {
    const findApplication = vi.fn(async () => {
      throw new Error("tidak boleh dipanggil");
    });
    const db = makeDb({
      application: { findFirst: findApplication },
      examAttempt: { findFirst: vi.fn(async () => attemptFixture()) },
    });
    const out = await requireOwnedHistoricalResource(db, baseUser, { kind: "examAttempt", id: "att-1" });

    expect(out.resource.userId).toBe("user-1");
    expect(findApplication).not.toHaveBeenCalled();
  });

  it("24. kompatibel Prisma.TransactionClient (DI client bebas mutation)", async () => {
    // Simulasi client yang lolos dari $transaction callback — struktural sama,
    // dibekukan untuk membuktikan guard tidak memutasi client.
    const txClient = Object.freeze(
      makeDb({
        examAttempt: { findFirst: vi.fn(async () => attemptFixture()) },
        application: { findFirst: vi.fn(async () => appFixture()) },
      }),
    ) as CandidateGuardDb;

    const ctx = await requireCurrentCandidateEligibility(txClient, baseUser);
    expect(ctx.user.id).toBe("user-1");

    const out = await requireOwnedHistoricalResource(txClient, baseUser, {
      kind: "examAttempt",
      id: "att-1",
    });
    expect(out.resource.userId).toBe("user-1");
  });

  it("24b. ExamResult tidak ada / DB gagal -> RESOURCE_FORBIDDEN / GUARD_UNAVAILABLE", async () => {
    const dbMissing = makeDb({ examResult: { findFirst: vi.fn(async () => null) } });
    await expectGuardError(
      requireOwnedHistoricalResource(dbMissing, baseUser, { kind: "examResult", id: "res-x" }),
      "RESOURCE_FORBIDDEN",
    );

    const dbFail = makeDb({
      examResult: {
        findFirst: vi.fn(async () => {
          throw new Error("conn refused");
        }),
      },
    });
    await expectGuardError(
      requireOwnedHistoricalResource(dbFail, baseUser, { kind: "examResult", id: "res-x" }),
      "GUARD_UNAVAILABLE",
    );
  });
});
