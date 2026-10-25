/**
 * Candidate Guard — centralized candidate eligibility & historical
 * ownership validation (TASK 03L.2E.3.1).
 *
 * Prinsip:
 * - Trusted server-session identity HANYA; username/registrationId dari
 *   client tidak pernah dipakai sebagai ownership proof.
 * - Fail closed: ambigu / DB gagal => ditolak, bukan diteruskan.
 * - Current eligibility (Application DITERIMA) vs historical ownership
 *   (hasil/attempt/absen milik sendiri) dipisah — ownership historis TIDAK
 *   mensyaratkan status DITERIMA saat ini.
 * - Database client DI: menerima PrismaClient ATAU Prisma.TransactionClient
 *   sehingga TASK 03L.2E.4 dapat menjalankan eligibility re-check di dalam
 *   transaction mutation yang sama.
 * - Guard ini BELUM diintegrasikan ke route exam/attendance (scope task).
 */

// ---------------------------------------------------------------------------
// Structured error model
// ---------------------------------------------------------------------------

export type CandidateGuardErrorCode =
  | "UNAUTHENTICATED"
  | "USER_BLOCKED"
  | "NO_ACTIVE_PERIOD"
  | "AMBIGUOUS_ACTIVE_PERIOD"
  | "PERIOD_UNMAPPED"
  | "RECRUITMENT_PERIOD_INVALID"
  | "APPLICATION_NOT_FOUND_FOR_PERIOD"
  | "APPLICATION_PENDING"
  | "APPLICATION_REJECTED"
  | "APPLICATION_NOT_ACCEPTED"
  | "RESOURCE_FORBIDDEN"
  | "GUARD_UNAVAILABLE";

// Eligibility/authorization failure => 4xx. DB/system failure => 503.
const HTTP_STATUS_BY_CODE: Record<CandidateGuardErrorCode, number> = {
  UNAUTHENTICATED: 401,
  USER_BLOCKED: 403,
  NO_ACTIVE_PERIOD: 403,
  AMBIGUOUS_ACTIVE_PERIOD: 403,
  PERIOD_UNMAPPED: 403,
  RECRUITMENT_PERIOD_INVALID: 403,
  APPLICATION_NOT_FOUND_FOR_PERIOD: 403,
  APPLICATION_PENDING: 403,
  APPLICATION_REJECTED: 403,
  APPLICATION_NOT_ACCEPTED: 403,
  RESOURCE_FORBIDDEN: 403,
  GUARD_UNAVAILABLE: 503,
};

export class CandidateGuardError extends Error {
  readonly code: CandidateGuardErrorCode;
  readonly httpStatus: number;

  constructor(code: CandidateGuardErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CandidateGuardError";
    this.code = code;
    this.httpStatus = HTTP_STATUS_BY_CODE[code];
  }
}

/** DB/system failure => GUARD_UNAVAILABLE. Tidak menyamar sebagai eligibility failure. */
function guardUnavailable(cause: unknown): never {
  throw new CandidateGuardError(
    "GUARD_UNAVAILABLE",
    `Database query gagal saat eligibility check: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
  );
}

// ---------------------------------------------------------------------------
// DI database client (structural: PrismaClient & Prisma.TransactionClient)
// ---------------------------------------------------------------------------

export interface CandidateGuardDb {
  user?: { findUnique(args: unknown): Promise<unknown> };
  examPeriod: { findMany(args: unknown): Promise<unknown[]>; findUnique?(args: unknown): Promise<unknown> };
  recruitmentPeriod: { findUnique(args: unknown): Promise<unknown> };
  application: { findFirst(args: unknown): Promise<unknown> };
  examAttempt: { findFirst(args: unknown): Promise<unknown> };
  examResult: { findFirst(args: unknown): Promise<unknown> };
  attendance: { findFirst(args: unknown): Promise<unknown> };
}

// ---------------------------------------------------------------------------
// Trusted identity (dari server session; bukan client payload)
// ---------------------------------------------------------------------------

export interface CandidateGuardUser {
  id: string;
  username: string;
  displayName?: string | null;
  discordUsername?: string | null;
  matraBlocked?: boolean | null;
  bannedGroupIds?: unknown;
  deletedAt?: Date | null;
}

// ---------------------------------------------------------------------------
// Safe structured contexts (tanpa token/hash/OAuth/admin credentials)
// ---------------------------------------------------------------------------

export interface CandidateEligibilityContext {
  user: {
    id: string;
    username: string;
    displayName: string | null;
    discordUsername: string | null;
  };
  application: {
    id: string;
    registrationId: string;
    recruitmentPeriodId: string;
    status: "DITERIMA";
    verifiedAt: Date | null;
  };
  examPeriod: {
    id: string;
    name: string;
    description: string | null;
    recruitmentPeriodId: string;
    isActive: boolean;
    isAttendanceOpen: boolean;
    isExamOpen: boolean;
    examStartTime: Date | null;
    examEndTime: Date | null;
    seed: number;
    mcqCount: number | null;
    essayCount: number | null;
    passThreshold: number;
    openedAt: Date | null;
    closedAt: Date | null;
  };
  recruitmentPeriod: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    openedAt: Date;
    closedAt: Date;
  };
}

export type HistoricalResourceKind = "examAttempt" | "examResult" | "attendance";

export interface HistoricalResourceRef {
  kind: HistoricalResourceKind;
  id: string;
}

export interface OwnedHistoricalResource {
  kind: HistoricalResourceKind;
  /** Field aman untuk route historis. Sengaja TANPA questionsJson (berisi correctKey). */
  resource: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Blocked check — pakai flag authoritative pada record User milik session.
// CATATAN: tidak ada reusable blacklist service di src/lib (BlacklistEntry
// ada di schema tapi hanya diakses inline oleh admin routes). Gap dilaporkan,
// tidak diduplikasi di sini. VerdictEntry tidak dipakai: schema menandainya
// informasional, tidak memblokir otomatis.
// ---------------------------------------------------------------------------

function assertUserNotBlocked(user: CandidateGuardUser): void {
  if (user.deletedAt != null) {
    throw new CandidateGuardError("USER_BLOCKED", "Akun user terhapus.");
  }
  if (user.matraBlocked === true) {
    throw new CandidateGuardError("USER_BLOCKED", "User diblokir (matraBlocked).");
  }
}

// ---------------------------------------------------------------------------
// Current eligibility — untuk start/save/submit ujian, attendance, report
// ---------------------------------------------------------------------------

export async function requireCurrentCandidateEligibility(
  db: CandidateGuardDb,
  user: CandidateGuardUser | null | undefined,
): Promise<CandidateEligibilityContext> {
  // 1. Trusted user tersedia
  if (!user || typeof user.id !== "string" || user.id.length === 0) {
    throw new CandidateGuardError("UNAUTHENTICATED", "Trusted user tidak tersedia.");
  }

  // 2. User tidak diblokir
  await assertUserNotBlocked(user);

  try {
    // 3. Resolve active ExamPeriod — SEMUA aktif non-deleted, bukan findFirst arbitrer
    const periods = (await db.examPeriod.findMany({
      where: { isActive: true, deletedAt: null },
    })) as Array<{
      id: string;
      name: string;
      description: string | null;
      recruitmentPeriodId: string | null;
      isActive: boolean;
      isAttendanceOpen: boolean;
      isExamOpen: boolean;
      examStartTime: Date | null;
      examEndTime: Date | null;
      seed: number;
      mcqCount: number | null;
      essayCount: number | null;
      passThreshold: number;
      openedAt: Date | null;
      closedAt: Date | null;
    }>;

    if (!Array.isArray(periods) || periods.length === 0) {
      throw new CandidateGuardError("NO_ACTIVE_PERIOD", "Tidak ada ExamPeriod aktif.");
    }
    if (periods.length > 1) {
      throw new CandidateGuardError(
        "AMBIGUOUS_ACTIVE_PERIOD",
        `${periods.length} ExamPeriod aktif bersamaan — fail closed.`,
      );
    }
    const examPeriod = periods[0];

    // 4. ExamPeriod harus mapped ke RecruitmentPeriod
    if (!examPeriod.recruitmentPeriodId) {
      throw new CandidateGuardError(
        "PERIOD_UNMAPPED",
        "ExamPeriod belum terhubung ke RecruitmentPeriod.",
      );
    }

    // 5. Parent RecruitmentPeriod ada & non-deleted.
    // isActive TIDAK diwajibkan (brief A.5 — source existing tidak mensyaratkan).
    const rp = (await db.recruitmentPeriod.findUnique({
      where: { id: examPeriod.recruitmentPeriodId },
    })) as {
      id: string;
      code: string;
      name: string;
      isActive: boolean;
      openedAt: Date;
      closedAt: Date;
      deletedAt: Date | null;
    } | null;

    if (!rp || rp.deletedAt !== null) {
      throw new CandidateGuardError(
        "RECRUITMENT_PERIOD_INVALID",
        "RecruitmentPeriod parent tidak ada atau soft-deleted.",
      );
    }

    // 6. Application milik trusted user.id pada mapped period
    const application = (await db.application.findFirst({
      where: {
        userId: user.id,
        recruitmentPeriodId: examPeriod.recruitmentPeriodId,
        deletedAt: null,
      },
    })) as {
      id: string;
      registrationId: string;
      recruitmentPeriodId: string;
      status: string;
      verifiedAt: Date | null;
      userId: string | null;
      deletedAt: Date | null;
    } | null;

    if (
      !application ||
      application.userId !== user.id ||
      application.recruitmentPeriodId !== examPeriod.recruitmentPeriodId ||
      application.deletedAt != null
    ) {
      throw new CandidateGuardError(
        "APPLICATION_NOT_FOUND_FOR_PERIOD",
        "Tidak ada Application valid milik user untuk periode ini.",
      );
    }

    // 7. Validate ApplicationStatus (Prisma enum ApplicationStatus)
    if (application.status === "MENUNGGU_VERIFIKASI") {
      throw new CandidateGuardError(
        "APPLICATION_PENDING",
        "Application masih menunggu verifikasi.",
      );
    }
    if (application.status === "DITOLAK") {
      throw new CandidateGuardError("APPLICATION_REJECTED", "Application ditolak.");
    }
    if (application.status !== "DITERIMA") {
      throw new CandidateGuardError(
        "APPLICATION_NOT_ACCEPTED",
        `Status Application tidak diterima: ${application.status}`,
      );
    }

    // 8. Safe structured context — tanpa accessTokenHash/token/OAuth/admin creds
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName ?? null,
        discordUsername: user.discordUsername ?? null,
      },
      application: {
        id: application.id,
        registrationId: application.registrationId,
        recruitmentPeriodId: application.recruitmentPeriodId,
        status: "DITERIMA",
        verifiedAt: application.verifiedAt ?? null,
      },
      examPeriod: {
        id: examPeriod.id,
        name: examPeriod.name,
        description: examPeriod.description,
        recruitmentPeriodId: examPeriod.recruitmentPeriodId,
        isActive: examPeriod.isActive,
        isAttendanceOpen: examPeriod.isAttendanceOpen,
        isExamOpen: examPeriod.isExamOpen,
        examStartTime: examPeriod.examStartTime,
        examEndTime: examPeriod.examEndTime,
        seed: examPeriod.seed,
        mcqCount: examPeriod.mcqCount,
        essayCount: examPeriod.essayCount,
        passThreshold: examPeriod.passThreshold,
        openedAt: examPeriod.openedAt,
        closedAt: examPeriod.closedAt,
      },
      recruitmentPeriod: {
        id: rp.id,
        code: rp.code,
        name: rp.name,
        isActive: rp.isActive,
        openedAt: rp.openedAt,
        closedAt: rp.closedAt,
      },
    };
  } catch (err) {
    if (err instanceof CandidateGuardError) throw err;
    return guardUnavailable(err);
  }
}

// ---------------------------------------------------------------------------
// TASK 03L.2E.4.6 — Final write-boundary re-check (anti-TOCTOU).
//
// Guard ini dipanggil SEKALI sebelum write. Antara titik itu dan write, admin
// dapat mengubah status Application (mis. DITERIMA -> DITOLAK). Helper ini
// memverifikasi ulang Application yang SUDAH diresolusi guard (by id, bukan
// query ulang period) segera sebelum side effect, sehingga request tidak
// menulis bila kelayakan berubah.
//
// BATASAN: read-then-write ini MEMPERSEMPIT jendela, bukan menghapusnya —
// tanpa Serializable isolation / row lock (tidak dipakai karena runtime
// memakai Supabase Transaction Pooler; lihat catatan P2028 di exam-service)
// masih ada jendela antara re-check dan commit. Sengaja HANYA memeriksa
// status/deletedAt Application (bukan jendela ujian), agar attempt yang sudah
// berjalan tetap bisa disubmit setelah examEndTime (aturan bisnis existing).
// ---------------------------------------------------------------------------

export async function assertEligibilityStillValid(
  db: CandidateGuardDb,
  ctx: CandidateEligibilityContext,
): Promise<void> {
  try {
    const app = (await db.application.findFirst({
      where: { id: ctx.application.id, status: "DITERIMA", deletedAt: null },
    })) as { id: string } | null;

    if (!app || app.id !== ctx.application.id) {
      throw new CandidateGuardError(
        "APPLICATION_NOT_ACCEPTED",
        "Kelayakan berubah sebelum operasi ditulis.",
      );
    }
  } catch (err) {
    if (err instanceof CandidateGuardError) throw err;
    return guardUnavailable(err);
  }
}

// ---------------------------------------------------------------------------
// TASK 03L.2E.4.10B — Kelayakan kandidat untuk cron auto-submit & recovery.
// Independen dari jendela buka ExamPeriod (jendela bisa sudah ditutup saat
// cron berjalan), memeriksa status User (aktif, tidak matraBlocked, tidak blacklist)
// dan status Application (DITERIMA, non-deleted).
// ---------------------------------------------------------------------------

export async function assertCandidateEligibleForPeriod(
  db: CandidateGuardDb,
  userId: string,
  recruitmentPeriodId?: string | null,
): Promise<void> {
  try {
    if (db.user?.findUnique) {
      const u = (await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          matraBlocked: true,
          deletedAt: true,
          blacklistEntries: {
            where: { revokedAt: null },
            select: { id: true },
          },
        },
      })) as {
        id: string;
        matraBlocked?: boolean | null;
        deletedAt?: Date | null;
        blacklistEntries?: Array<{ id: string }>;
      } | null;

      if (!u || u.deletedAt != null) {
        throw new CandidateGuardError(
          "USER_BLOCKED",
          "User tidak ditemukan atau non-aktif.",
        );
      }
      if (u.matraBlocked) {
        throw new CandidateGuardError(
          "USER_BLOCKED",
          "Akun terblokir mutasi matra.",
        );
      }
      if (u.blacklistEntries && u.blacklistEntries.length > 0) {
        throw new CandidateGuardError(
          "USER_BLOCKED",
          "Kandidat masuk daftar hitam.",
        );
      }
    }

    if (recruitmentPeriodId && db.application?.findFirst) {
      const app = (await db.application.findFirst({
        where: {
          userId,
          recruitmentPeriodId,
          deletedAt: null,
        },
        select: { id: true, status: true, deletedAt: true },
      })) as { id: string; status: string; deletedAt?: Date | null } | null;

      if (!app || app.deletedAt != null) {
        throw new CandidateGuardError(
          "APPLICATION_NOT_FOUND_FOR_PERIOD",
          "Tidak ada Application valid milik user untuk periode ini.",
        );
      }
      if (app.status === "DITOLAK") {
        throw new CandidateGuardError("APPLICATION_REJECTED", "Application ditolak.");
      }
      if (app.status !== "DITERIMA") {
        throw new CandidateGuardError(
          "APPLICATION_NOT_ACCEPTED",
          `Status Application tidak diterima: ${app.status}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof CandidateGuardError) throw err;
    return guardUnavailable(err);
  }
}

// ---------------------------------------------------------------------------
// Historical ownership — hasil ujian / attempt / absen milik sendiri.
// TIDAK menyentuh Application; TIDAK mensyaratkan status DITERIMA saat ini.
// ---------------------------------------------------------------------------

export async function requireOwnedHistoricalResource(
  db: CandidateGuardDb,
  user: CandidateGuardUser | null | undefined,
  ref: HistoricalResourceRef,
): Promise<OwnedHistoricalResource> {
  if (!user || typeof user.id !== "string" || user.id.length === 0) {
    throw new CandidateGuardError("UNAUTHENTICATED", "Trusted user tidak tersedia.");
  }

  try {
    if (ref.kind === "examAttempt") {
      const attempt = (await db.examAttempt.findFirst({
        where: { id: ref.id, deletedAt: null },
      })) as {
        id: string;
        userId: string;
        periodId: string;
        attemptKey: string;
        startedAt: Date;
        submittedAt: Date | null;
      } | null;

      if (!attempt || attempt.userId !== user.id) {
        throw new CandidateGuardError(
          "RESOURCE_FORBIDDEN",
          "ExamAttempt bukan milik user ini.",
        );
      }
      return {
        kind: "examAttempt",
        resource: {
          id: attempt.id,
          userId: attempt.userId,
          periodId: attempt.periodId,
          attemptKey: attempt.attemptKey,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
        },
      };
    }

    if (ref.kind === "examResult") {
      // ExamResult tidak punya userId langsung => ownership via attempt.userId
      const result = (await db.examResult.findFirst({
        where: { id: ref.id, deletedAt: null },
        include: { attempt: { select: { id: true, userId: true, periodId: true } } },
      })) as {
        id: string;
        attemptId: string;
        score: number;
        maxScore: number;
        mcqScore: number;
        essayScore: number;
        status: string;
        passed: boolean;
        submittedAt: Date;
        attempt: { id: string; userId: string; periodId: string };
      } | null;

      if (!result || !result.attempt || result.attempt.userId !== user.id) {
        throw new CandidateGuardError(
          "RESOURCE_FORBIDDEN",
          "ExamResult bukan milik user ini.",
        );
      }
      return {
        kind: "examResult",
        resource: {
          id: result.id,
          attemptId: result.attemptId,
          attemptUserId: result.attempt.userId,
          attemptPeriodId: result.attempt.periodId,
          score: result.score,
          maxScore: result.maxScore,
          mcqScore: result.mcqScore,
          essayScore: result.essayScore,
          status: result.status,
          passed: result.passed,
          submittedAt: result.submittedAt,
        },
      };
    }

    if (ref.kind === "attendance") {
      const attendance = (await db.attendance.findFirst({
        where: { id: ref.id, deletedAt: null },
      })) as {
        id: string;
        userId: string | null;
        periodId: string;
        tahap: string;
        status: string;
        discordUserId: string | null;
        roleEligible: boolean;
        createdAt: Date;
      } | null;

      // userId nullable; null = belum di-link => tidak boleh di-claim
      if (!attendance || attendance.userId == null || attendance.userId !== user.id) {
        throw new CandidateGuardError(
          "RESOURCE_FORBIDDEN",
          "Attendance bukan milik user ini.",
        );
      }
      return {
        kind: "attendance",
        resource: {
          id: attendance.id,
          userId: attendance.userId,
          periodId: attendance.periodId,
          tahap: attendance.tahap,
          status: attendance.status,
          discordUserId: attendance.discordUserId,
          roleEligible: attendance.roleEligible,
          createdAt: attendance.createdAt,
        },
      };
    }

    throw new CandidateGuardError(
      "RESOURCE_FORBIDDEN",
      "Jenis resource historis tidak dikenal.",
    );
  } catch (err) {
    if (err instanceof CandidateGuardError) throw err;
    return guardUnavailable(err);
  }
}
