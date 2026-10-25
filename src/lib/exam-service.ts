// ============================================================
// Exam Service - logika inti (dipakai halaman server & API route)
// ============================================================

import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/constants";
import { BlacklistCategory, Prisma, VerdictStatus } from "@prisma/client";
import { checkDiscordRole } from "@/lib/discord-api";
import {
  buildQuestionSet,
  gradeExam,
  hashString,
  sanitizeForClient,
  type ClientQuestion,
  type SnapshotQuestion,
  type GradedAnswerDetail,
} from "@/lib/grading";
import { ensureSchema } from "@/lib/init-schema";
import { decideExamSessionAction } from "@/lib/exam-window";
import {
  requireCurrentCandidateEligibility,
  assertEligibilityStillValid,
  assertCandidateEligibleForPeriod,
  CandidateGuardError,
  type CandidateEligibilityContext,
} from "@/lib/candidate-guard";
import {
  isExpectedUniqueViolation,
  type ExpectedUniqueConstraint,
} from "@/lib/prisma-unique";
import type { User } from "@prisma/client";

// TASK 03L.2E.4.6 — Unique constraint yang BENAR-BENAR relevan untuk race
// ExamAttempt.create. `attemptKey` = `${periodId}_${userId}` dan
// `@@unique([periodId, userId])` menunjuk attempt yang sama, jadi keduanya
// sah diperlakukan sebagai race "percobaan ganda". P2002 pada constraint lain
// TIDAK boleh dianggap idempotensi (lihat prisma/migrations/.../init_v2_baseline).
const ATTEMPT_UNIQUE_CONFLICTS: readonly ExpectedUniqueConstraint[] = [
  { fields: ["attemptKey"], indexNames: ["ExamAttempt_attemptKey_key"] },
  { fields: ["periodId", "userId"], indexNames: ["ExamAttempt_periodId_userId_key"] },
];

// TASK 03L.2E.4.6 — ExamResult hanya punya satu unique: attemptId (satu hasil
// per attempt). P2002 dengan target lain / tanpa target = konflik tak dikenal.
const RESULT_UNIQUE_CONFLICTS: readonly ExpectedUniqueConstraint[] = [
  { fields: ["attemptId"], indexNames: ["ExamResult_attemptId_key"] },
];

/**
 * Terjemahkan CandidateGuardError menjadi ExamSessionResult.
 * Error lain (bug tak terduga) dilempar ulang — jangan disamarkan jadi 403.
 */
function eligibilityFailure(err: unknown): ExamSessionResult {
  if (err instanceof CandidateGuardError) {
    return {
      ok: false,
      code: err.code === "GUARD_UNAVAILABLE" ? "GUARD_UNAVAILABLE" : "NOT_ELIGIBLE",
      message: err.message,
    };
  }
  throw err;
}

export type ExamSessionResult =
  | { ok: true; attemptId: string; questions: ClientQuestion[]; remainingSeconds: number; period: { name: string; description: string | null; examStartTime: string | null; examEndTime: string | null }; savedAnswers: Record<string, string> | null; flaggedQuestions: string[]; bookmarkedQuestions: string[] }
  | { ok: false; code: "NO_ACTIVE_PERIOD" | "ALREADY_SUBMITTED" | "RANK_BLOCKED" | "PERIOD_CLOSED" | "NO_ATTENDANCE" | "NO_ROLE" | "EXAM_NOT_OPEN" | "INSUFFICIENT_QUESTIONS" | "NOT_ELIGIBLE" | "GUARD_UNAVAILABLE"; message: string };

// Cek apakah user sudah absen pada periode tertentu.
// HANYA berdasarkan userId (identitas terverifikasi) — TIDAK berdasarkan
// discordUserId karena itu input bebas user dan bisa dipalsukan (orang lain
// bisa meniru username Discord casis yang sudah absen).
export async function hasAttendance(userId: string, periodId: string) {
  return prisma.attendance.findFirst({
    where: {
      periodId,
      tahap: "AKADEMIK",
      userId,
    },
  });
}


async function isBlockedByAdminLists(username: string): Promise<{ blocked: boolean; message?: string }> {
  try {
    const [blacklist, verdict] = await Promise.all([
      prisma.blacklistEntry.findFirst({
        where: {
          category: { in: [BlacklistCategory.POLRI, BlacklistCategory.PENDIDIKAN] },
          username: { equals: username, mode: "insensitive" },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.verdictEntry.findFirst({
        where: {
          username: { equals: username, mode: "insensitive" },
          status: VerdictStatus.TIDAK_LULUS,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (blacklist) {
      const label = blacklist.category === "PENDIDIKAN" ? "blacklist pendidikan" : "blacklist Polri";
      return {
        blocked: true,
        message: `Akses ditolak: nama Anda terdaftar dalam ${label} dan tidak dapat mengikuti ujian.`,
      };
    }
    if (verdict) {
      return {
        blocked: true,
        message: "Akses ditolak: putusan sidang Anda berstatus TIDAK LULUS.",
      };
    }
    return { blocked: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return { blocked: false };
    }
    throw e;
  }
}

// Cek role "Tahap Akademik" di Discord.
// Prioritas: Discord REST API langsung → bot server → skip (lolos)
async function checkAcademicRole(discordUsername: string): Promise<{ ok: boolean; hasRole: boolean }> {
  if (CONFIG.discordBotToken && CONFIG.discordGuildId && CONFIG.tahapAkademikRoleId) {
    return checkDiscordRole(discordUsername, "Tahap Akademik");
  }
  // Bot belum dikonfigurasi → skip check (lolos)
  return { ok: false, hasRole: false };
}

// Bangun payload sesi lanjutan (resume) dari attempt yang sudah ada.
// Dipakai jalur normal (existing) DAN jalur race P2002 saat create.
function buildResumeSession(
  existing: {
    id: string;
    startedAt: Date;
    questionsJson: unknown;
    savedAnswers: unknown;
    flaggedQuestions: unknown;
    bookmarkedQuestions: unknown;
  },
  period: {
    name: string;
    description: string | null;
    examStartTime: Date | null;
    examEndTime: Date | null;
  },
): ExamSessionResult {
  const durationMs = CONFIG.examDurationMinutes * 60_000;
  const elapsed = Date.now() - existing.startedAt.getTime();
  return {
    ok: true,
    attemptId: existing.id,
    questions: sanitizeForClient(existing.questionsJson as unknown as SnapshotQuestion[]),
    remainingSeconds: Math.max(0, Math.floor((durationMs - elapsed) / 1000)),
    period: {
      name: period.name,
      description: period.description,
      examStartTime: period.examStartTime?.toISOString() ?? null,
      examEndTime: period.examEndTime?.toISOString() ?? null,
    },
    savedAnswers: (existing.savedAnswers as Record<string, string>) ?? null,
    flaggedQuestions: (existing.flaggedQuestions as string[]) ?? [],
    bookmarkedQuestions: (existing.bookmarkedQuestions as string[]) ?? [],
  };
}

// Mulai / lanjutkan sesi ujian untuk user pada periode aktif
export async function startExamSession(user: User): Promise<ExamSessionResult> {
  await ensureSchema();

  // Gerbang pangkat: sesi lama yang pangkatnya kini di bawah minimal diblokir.
  if (
    user.policeGroupRankNumber != null &&
    user.policeGroupRankNumber < CONFIG.minPoliceRank
  ) {
    return {
      ok: false,
      code: "RANK_BLOCKED",
      message: `Akses ditolak: pangkat Anda di grup "${CONFIG.policeGroupName}" masih di bawah persyaratan minimal (${CONFIG.minPoliceRankName}). Silakan ajukan kenaikan pangkat terlebih dahulu.`,
    };
  }


  const adminListBlock = await isBlockedByAdminLists(user.username);
  if (adminListBlock.blocked) {
    return {
      ok: false,
      code: "RANK_BLOCKED",
      message: adminListBlock.message ?? "Akses ditolak oleh admin.",
    };
  }

  // TASK 03L.2E.4.2 — Candidate Guard (current eligibility).
  // Hanya calon dengan Application DITERIMA yang ter-link ke trusted user pada
  // RecruitmentPeriod yang dipetakan CAN EXAM. Dijalankan di service (bukan hanya
  // di route) karena halaman server `/ujian` memanggil startExamSession langsung
  // — gerbang harus fail-closed untuk SEMUA jalur sebelum side effect
  // (pembuatan ExamAttempt). Guard TIDAK menghapus gerbang rank/blacklist/
  // matra/absensi existing di atas/bawah ini.
  //
  // TASK 03L.2E.4.6 — TOCTOU: guard MENGIKAT periode. Attempt dibuat untuk
  // ExamPeriod yang divalidasi guard (ctx.examPeriod), BUKAN hasil query ulang
  // terpisah dengan predikat berbeda. Versi sebelumnya memakai
  // `examPeriod.findFirst({ isActive: true })` (tanpa filter deletedAt dan tanpa
  // verifikasi mapping RecruitmentPeriod) sehingga periode yang ditulis bisa
  // berbeda dari yang d validasi guard bila admin mengaktifkan/menghapus periode
  // di antara keduanya.
  let ctx: CandidateEligibilityContext;
  try {
    ctx = await requireCurrentCandidateEligibility(prisma, user);
  } catch (err) {
    return eligibilityFailure(err);
  }

  const period = ctx.examPeriod;

  // NOTE: `closedAt` hanya mengontrol jendela absensi, bukan akses ujian.
  // Akses ujian di-control oleh `isExamOpen` + `examStartTime`/`examEndTime`.
  // Attempt yang sudah dimulai tetap boleh dilanjutkan/disubmit setelah
  // examEndTime; jendela itu hanya menolak attempt baru.

  // Gerbang absensi: tanpa record absen, soal tidak bisa diakses
  // lewat halaman maupun API (session). Attendance yang belum ter-link
  // ke user (userId kosong) di-link otomatis di sini.
  const attendance = await hasAttendance(user.id, period.id);
  if (!attendance) {
    return {
      ok: false,
      code: "NO_ATTENDANCE",
      message: "Anda belum melakukan absensi untuk periode ini. Silakan absen terlebih dahulu.",
    };
  }

  // Gerbang motivasi / kelayakan akademik (dapat di-override instruktur)
  if (attendance.roleEligible === false) {
    return {
      ok: false,
      code: "NO_ROLE",
      message: attendance.motivationReason || "Status motivasi absensi Anda belum memenuhi syarat Tahap Akademik atau memerlukan revisi instruktur.",
    };
  }

  let existing = await prisma.examAttempt.findUnique({
    where: { attemptKey: `${period.id}_${user.id}` },
  });

  // Auto-heal: attempt yang sudah submit tapi hasilnya dihapus admin
  // (fitur "Hapus Rekap Nilai") tidak lagi memblokir; casis boleh mengulang.
  if (existing?.submittedAt) {
    const hasResult = await prisma.examResult.findUnique({
      where: { attemptId: existing.id },
    });
    if (!hasResult) {
      // TASK 03L.2E.4.7 — `examAttempt.delete` adalah WRITE yang sebelumnya
      // berjalan tanpa pemeriksaan eligibility di batasnya: kelayakan bisa
      // saja dicabut (DITERIMA -> DITOLAK / soft-delete) di antara guard di atas
      // dan delete ini, sehingga peserta yang sudah tidak luluh tetap dapat
      // membuat attempt lamanya dihapus. Re-check di sini fail-closed: bila
      // kelayakan berubah, attempt UTUH dan request berhenti NOT_ELIGIBLE.
      //
      // Kontrak tidak berubah. Jalur `ALREADY_SUBMITTED` di bawah tidak
      // tersentuh, dan selama peserta masih luluh delete tetap berjalan
      // seperti sebelumnya sehingga fitur auto-heal ("Hapus Rekap Nilai")
      // tetap berfungsi. Kalau kelayakannya dicabut lalu diterima kembali,
      // auto-heal akan terpicu ulang pada request berikutnya.
      //
      // Query tambahan ini hanya terjadi pada cabang auto-heal, yaitu kasus
      // langka (attempt submitted + hasil sudah dihapus admin).
      try {
        await assertEligibilityStillValid(prisma, ctx);
      } catch (err) {
        return eligibilityFailure(err);
      }
      await prisma.examAttempt.delete({ where: { id: existing.id } });
      existing = null;
    } else {
      return {
        ok: false,
        code: "ALREADY_SUBMITTED",
        message: "Anda sudah mengisi ujian pada periode ini. Hasil akan ditampilkan.",
      };
    }
  }

  const windowDecision = decideExamSessionAction({
    now: new Date(),
    isExamOpen: period.isExamOpen,
    examStartTime: period.examStartTime,
    examEndTime: period.examEndTime,
    hasUnsubmittedAttempt: !!existing,
  });
  if (windowDecision.action === "block") {
    return {
      ok: false,
      code: windowDecision.code,
      message: windowDecision.message,
    };
  }

  // Lanjutkan percobaan yang belum selesai (misal halaman ter-refresh).
  // Waktu sisa dihitung dari server (attempt.startedAt) agar refresh
  // tidak bisa me-reset timer.
  //
  // TASK 03L.2E.4.6 — Jalur resume juga MEMUNCURKAN state attempt ke klien
  // (snapshot soal + jawaban tersimpan), jadi pemeriksaan final di batas
  // penulisan wajib diulang di sini, bukan hanya pada jalur create baru.
  // Tanpa ini, admin yang mencabut kelayakan (DITERIMA -> DITOLAK /
  // soft-delete) di tengah sesi tetap bisa membaca/melanjutkan snapshot
  // dan jawaban yang sudah tersimpan.
  //
  // CATATAN: jalur race P2002 di bawah TIDAK melakukan re-check tambahan karena
  // assertEligibilityStillValid sudah dijalankan pada request yang sama,
  // beberapa baris sebelum create — menambah query hanya memperbesar jendela
  // dan menambah beban tanpa menutup celah baru.
  if (existing) {
    try {
      await assertEligibilityStillValid(prisma, ctx);
    } catch (err) {
      return eligibilityFailure(err);
    }
    return buildResumeSession(existing, period);
  }

  const [mcqs, essays] = await Promise.all([
    prisma.question.findMany({ where: { type: "MCQ", isActive: true } }),
    prisma.question.findMany({ where: { type: "ESSAY", isActive: true } }),
  ]);

  const mcqCount = period.mcqCount ?? CONFIG.mcqCount;
  const essayCount = period.essayCount ?? CONFIG.essayCount;

  if (mcqs.length < mcqCount || essays.length < essayCount) {
    return {
      ok: false,
      code: "INSUFFICIENT_QUESTIONS",
      message: "Bank soal belum mencukupi untuk konfigurasi periode ini. Hubungi instruktur.",
    };
  }

  // Gerbang role "Tahap Akademik": hanya berlaku saat memulai attempt baru.
  // Jika bot tidak terjangkau atau belum dikonfigurasi, check dianggap lolos
  // (tidak memblokir user); hanya ditolak bila bot menjawab & role tidak ada.
  if (user.discordUsername) {
    const roleCheck = await checkAcademicRole(user.discordUsername);
    if (roleCheck.ok && !roleCheck.hasRole) {
      return {
        ok: false,
        code: "NO_ROLE",
        message:
          "Role Tahap Akademik belum terpasang di Discord Anda. Hubungi admin untuk melakukan absensi / verifikasi ulang terlebih dahulu.",
      };
    }
    // Jika !roleCheck.ok (bot tidak terjangkau/belum config) → lolos
  }

  // Subset soal dipilih oleh seed periode (sama utk semua casis), tetapi
  // urutan soal & posisi opsi diacak per username agar tiap casis berbeda.
  const userSeed = hashString(`${period.id}:${user.id}`);
  const snapshot = buildQuestionSet(mcqs, essays, period.seed, userSeed, mcqCount, essayCount);

  // TASK 03L.2E.4.6 — Pemeriksaan final di batas penulisan: pastikan Application
  // yang diresolusi guard MASIH DITERIMA tepat sebelum membuat attempt. Menutup
  // jendela status-revocation (DITERIMA -> DITOLAK) selama durasi request.
  try {
    await assertEligibilityStillValid(prisma, ctx);
  } catch (err) {
    return eligibilityFailure(err);
  }

  // TASK 03L.2E.4.6 — TOCTOU create: dua request session bersamaan dapat sama-
  // sama lolos findUnique lalu keduanya create; unique(attemptKey) membuat yang
  // kedua gagal P2002. Tangani sebagai idempotent (kembalikan attempt yang sudah
  // ada) alih-alih membiarkannya menjadi 500 — HANYA bila target P2002 cocok
  // dengan constraint percobaan-ganda; P2002 lain dilempar apa adanya.
  let attempt;
  try {
    attempt = await prisma.examAttempt.create({
      data: {
        periodId: period.id,
        userId: user.id,
        attemptKey: `${period.id}_${user.id}`,
        questionsJson: snapshot as unknown as object,
      },
    });
  } catch (err) {
    if (isExpectedUniqueViolation(err, ATTEMPT_UNIQUE_CONFLICTS)) {
      const raced = await prisma.examAttempt.findUnique({
        where: { attemptKey: `${period.id}_${user.id}` },
      });
      if (raced) {
        if (raced.submittedAt) {
          return {
            ok: false,
            code: "ALREADY_SUBMITTED",
            message: "Anda sudah mengisi ujian pada periode ini. Hasil akan ditampilkan.",
          };
        }
        return buildResumeSession(raced, period);
      }
    }
    throw err;
  }

  return {
    ok: true,
    attemptId: attempt.id,
    questions: sanitizeForClient(snapshot),
    remainingSeconds: CONFIG.examDurationMinutes * 60,
    period: {
      name: period.name,
      description: period.description,
      examStartTime: period.examStartTime?.toISOString() ?? null,
      examEndTime: period.examEndTime?.toISOString() ?? null,
    },
    savedAnswers: null,
    flaggedQuestions: [],
    bookmarkedQuestions: [],
  };
}

export interface SubmitExamInput {
  attemptId: string;
  answers: Array<{ questionId: string; answer: string }>;
}

export type SubmitExamResult =
  | { ok: true; resultId: string; score: number; passed: boolean }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "ALREADY_SUBMITTED"
        | "EXPIRED"
        | "INVALID"
        | "NO_ATTENDANCE"
        | "PAYLOAD_CONFLICT"
        | "ELIGIBILITY_VIOLATION"
        | "CONCURRENCY_RETRY_REQUIRED"
        | "INVALID_STATE";
      message: string;
    };

export interface FinalizeExamAttemptParams {
  attempt: {
    id: string;
    userId: string;
    periodId: string;
    startedAt: Date | string;
    submittedAt?: Date | string | null;
    deletedAt?: Date | string | null;
    questionsJson: unknown;
    savedAnswers?: unknown;
    period?: {
      id?: string;
      recruitmentPeriodId?: string | null;
      passThreshold?: number | null;
      deletedAt?: Date | string | null;
    } | null;
    answers?: Array<{ questionId: string; answer: string | null }>;
  };
  callerSource: "CANDIDATE" | "CRON";
  submittedAnswers?: Array<{ questionId: string; answer: string }>;
  ctx?: CandidateEligibilityContext;
  now?: Date;
  passThreshold?: number;
  checkCandidateEligibility?: boolean;
}

export type FinalizeSuccessStatus =
  | "COMPLETED_BY_SELF"
  | "ALREADY_COMPLETED_ELSEWHERE";

export type FinalizeFailureStatus =
  | "ATTEMPT_MISSING_OR_DELETED"
  | "FINALIZATION_STATE_INCONSISTENT"
  | "PRECONDITION_FAILED";

export type FinalizeExamSuccess = {
  ok: true;
  status: FinalizeSuccessStatus;
  resultId: string;
  score: number;
  passed: boolean;
  attemptStatus: string;
  recovered: boolean;
  closedBySelf: boolean;
};

export type FinalizeExamFailure = {
  ok: false;
  status: FinalizeFailureStatus;
  code:
    | "NOT_FOUND"
    | "ALREADY_SUBMITTED"
    | "EXPIRED"
    | "INVALID"
    | "NO_ATTENDANCE"
    | "PAYLOAD_CONFLICT"
    | "ELIGIBILITY_VIOLATION"
    | "CONCURRENCY_RETRY_REQUIRED"
    | "INVALID_STATE";
  message: string;
  diagnosticDetail?: string;
};

export type FinalizeExamAttemptResult =
  | FinalizeExamSuccess
  | FinalizeExamFailure;

/**
 * Normalisasi dan perbandingan semantik answersJson:
 *  - Membandingkan array GradedAnswerDetail berdasarkan questionId
 *  - Mentoleransi urutan key dalam JSON object maupun urutan elemen array
 *  - Menormalisasi spasi pada userAnswer (.trim())
 *  - Membandingkan earned points dan status isCorrect
 */
export function areAnswersJsonSemanticallyEqual(
  existingRaw: unknown,
  currentDetails: GradedAnswerDetail[],
): boolean {
  if (!existingRaw) return false;
  let parsed = existingRaw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(parsed)) return false;
  if (parsed.length !== currentDetails.length) return false;

  const existingMap = new Map<string, Record<string, unknown>>();
  for (const item of parsed) {
    if (!item || typeof item !== "object" || !("questionId" in item)) return false;
    existingMap.set(String((item as Record<string, unknown>).questionId), item as Record<string, unknown>);
  }

  for (const current of currentDetails) {
    const ex = existingMap.get(current.questionId);
    if (!ex) return false;

    const exAns = typeof ex.userAnswer === "string" ? ex.userAnswer.trim() : (ex.userAnswer ?? "");
    const curAns = typeof current.userAnswer === "string" ? current.userAnswer.trim() : (current.userAnswer ?? "");
    if (exAns !== curAns) return false;

    if (ex.earned !== undefined && ex.earned !== null && current.earned !== undefined && current.earned !== null) {
      if (Number(ex.earned) !== Number(current.earned)) return false;
    }

    if (ex.isCorrect !== undefined && current.isCorrect !== undefined) {
      if (ex.isCorrect !== current.isCorrect) return false;
    }
  }

  return true;
}

export interface ExamAnswerRowLike {
  attemptId?: string;
  questionId: string;
  answer: string | null;
  isCorrect?: boolean | null;
  earnedPoints?: number | null;
}

export interface ExpectedAnswerData {
  attemptId: string;
  questionId: string;
  answer: string;
  isCorrect: boolean | null;
  earnedPoints: number;
}

export interface ExamAnswerValidationResult {
  ok: boolean;
  conflictReason?: string;
  questionId?: string;
}

/**
 * Validasi baris ExamAnswer terhadap ekspektasi grading deterministik.
 * Memeriksa:
 * 1. attemptId (jika tersedia pada row)
 * 2. questionId terdaftar pada snapshot (tidak ada extra/orphan questions)
 * 3. teks answer (dinormalisasi trim)
 * 4. isCorrect (boolean vs null, membedakan MCQ dari ESSAY)
 * 5. earnedPoints (poin per soal)
 */
export function validateExamAnswerRows(
  rows: ExamAnswerRowLike[],
  expectedAnswers: ExpectedAnswerData[],
  attemptId: string,
): ExamAnswerValidationResult {
  const expectedMap = new Map<string, ExpectedAnswerData>();
  for (const exp of expectedAnswers) {
    expectedMap.set(exp.questionId, exp);
  }

  for (const row of rows) {
    if (row.attemptId !== undefined && row.attemptId !== attemptId) {
      return {
        ok: false,
        conflictReason: `attemptId mismatch: expected ${attemptId}, got ${row.attemptId}`,
        questionId: row.questionId,
      };
    }

    const expected = expectedMap.get(row.questionId);
    if (!expected) {
      return {
        ok: false,
        conflictReason: `jawaban ekstra tidak terdaftar dalam snapshot soal ujian`,
        questionId: row.questionId,
      };
    }

    const rowAnswer = (row.answer ?? "").trim();
    const expAnswer = (expected.answer ?? "").trim();
    if (rowAnswer !== expAnswer) {
      return {
        ok: false,
        conflictReason: `jawaban tersimpan berbeda dengan payload final (DB: "${rowAnswer}", payload: "${expAnswer}")`,
        questionId: row.questionId,
      };
    }

    if (row.isCorrect !== undefined) {
      if (row.isCorrect !== expected.isCorrect) {
        return {
          ok: false,
          conflictReason: `status penilaian isCorrect berbeda (DB: ${String(row.isCorrect)}, expected: ${String(expected.isCorrect)})`,
          questionId: row.questionId,
        };
      }
    }

    if (row.earnedPoints !== undefined) {
      if (row.earnedPoints !== expected.earnedPoints) {
        return {
          ok: false,
          conflictReason: `earnedPoints berbeda (DB: ${String(row.earnedPoints)}, expected: ${String(expected.earnedPoints)})`,
          questionId: row.questionId,
        };
      }
    }
  }

  return { ok: true };
}

/**
 * TASK 03L.2E.4.10B — Shared Exam Finalizer & Auto-Submit Recovery.
 * Digunakan oleh API submit peserta dan API cron/auto-submit.
 *
 * Invariant yang dijamin:
 *  A. Maksimal 1 ExamResult per attemptId.
 *  B. Deterministic verification: skor & passed existing dibandingkan sebelum dinyatakan identik.
 *  C & D. ExamAnswer reconciliation: mendeteksi perbedaan jawaban (fail-closed jika konflik).
 *  E & F. Conditional update pada submittedAt (hanya jika null, tidak menimpa timestamp lama).
 *  G. Recovery menyelesaikan state yang kurang tanpa membuat result kedua.
 *  H. P2002 hanya ditoleransi pada attemptId, bukan constraint lain.
 *  I. Sequential writes terdokumentasi batas kegagalannya.
 */
export async function finalizeExamAttempt(
  params: FinalizeExamAttemptParams,
): Promise<FinalizeExamAttemptResult> {
  const {
    attempt,
    callerSource,
    submittedAnswers,
    ctx,
    now = new Date(),
    passThreshold,
    checkCandidateEligibility = true,
  } = params;

  // 0. Rejection jika attempt sudah di-soft-delete
  if (attempt.deletedAt != null) {
    return {
      ok: false,
      status: "ATTEMPT_MISSING_OR_DELETED",
      code: "NOT_FOUND",
      message: "Attempt ujian telah dihapus atau tidak ditemukan.",
    };
  }

  // 1. Candidate Guard / Eligibility Check
  if (ctx) {
    await assertEligibilityStillValid(prisma, ctx);
  } else if (callerSource === "CRON" && checkCandidateEligibility && attempt.userId) {
    const recruitmentPeriodId =
      attempt.period?.recruitmentPeriodId ??
      (attempt.periodId && prisma.examPeriod?.findUnique
        ? (
            (await prisma.examPeriod.findUnique({
              where: { id: attempt.periodId },
              select: { recruitmentPeriodId: true },
            })) as { recruitmentPeriodId?: string | null } | null
          )?.recruitmentPeriodId
        : undefined);

    await assertCandidateEligibleForPeriod(prisma, attempt.userId, recruitmentPeriodId);
  }

  // 2. Validate Questions Snapshot
  const snapshot = attempt.questionsJson as unknown as SnapshotQuestion[];
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    return {
      ok: false,
      status: "PRECONDITION_FAILED",
      code: "INVALID",
      message: "Snapshot soal tidak valid.",
    };
  }
  const validIds = new Set(snapshot.map((q) => q.id));

  // 3. Assemble answers map
  const answersMap: Record<string, string> = {};

  if (submittedAnswers && Array.isArray(submittedAnswers) && submittedAnswers.length > 0) {
    for (const a of submittedAnswers) {
      if (!validIds.has(a.questionId)) continue;
      if (typeof a.answer !== "string") continue;
      answersMap[a.questionId] = a.answer.slice(0, 4000);
    }
  } else {
    // Jalur Cron / Recovery: ambil dari savedAnswers (auto-save draft)
    if (
      attempt.savedAnswers &&
      typeof attempt.savedAnswers === "object" &&
      !Array.isArray(attempt.savedAnswers)
    ) {
      for (const [k, v] of Object.entries(attempt.savedAnswers as Record<string, unknown>)) {
        if (validIds.has(k) && typeof v === "string") {
          answersMap[k] = v.slice(0, 4000);
        }
      }
    }
    // Jika ada ExamAnswer rows yang sudah tersimpan sebelumnya
    if (Array.isArray(attempt.answers)) {
      for (const a of attempt.answers) {
        if (validIds.has(a.questionId) && typeof a.answer === "string") {
          answersMap[a.questionId] = a.answer.slice(0, 4000);
        }
      }
    }
  }

  // 4. Grading
  const threshold = passThreshold ?? attempt.period?.passThreshold ?? CONFIG.kkm;
  const graded = gradeExam(snapshot, answersMap, threshold);

  const answerData = graded.details
    .map((d) => {
      const qid = snapshot.find((s) => s.id === d.questionId)?.id;
      if (!qid) return null;
      return {
        attemptId: attempt.id,
        questionId: qid,
        answer: d.userAnswer,
        isCorrect: d.type === "MCQ" ? d.isCorrect : null,
        earnedPoints: d.earned,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // 5. Periksa ExamAnswer yang sudah ada untuk mendeteksi konflik jawaban (Invariant D)
  const existingAnswers = prisma.examAnswer?.findMany
    ? ((await prisma.examAnswer.findMany({
        where: { attemptId: attempt.id },
      })) as ExamAnswerRowLike[])
    : [];

  const preValidation = validateExamAnswerRows(existingAnswers, answerData, attempt.id);
  if (!preValidation.ok) {
    return {
      ok: false,
      status: "FINALIZATION_STATE_INCONSISTENT",
      code: "PAYLOAD_CONFLICT",
      message: `Konflik jawaban pada soal ${preValidation.questionId ?? "tidak dikenal"}: ${preValidation.conflictReason}`,
    };
  }

  let resultId: string;
  let isRecovered = false;

  // 6. Tulis ExamResult (Invariant A & H)
  // Menangani P2002 secara spesifik HANYA untuk constraint attemptId
  try {
    const created = await prisma.examResult.create({
      data: {
        attemptId: attempt.id,
        score: graded.score,
        maxScore: graded.maxScore,
        mcqScore: graded.mcqScore,
        essayScore: graded.essayScore,
        status: graded.status,
        passed: graded.passed,
        answersJson: graded.details as unknown as object,
      },
    });
    resultId = created.id;
  } catch (e) {
    // Invariant H: P2002 HANYA ditoleransi untuk constraint attemptId
    if (isExpectedUniqueViolation(e, RESULT_UNIQUE_CONFLICTS)) {
      const existing = prisma.examResult?.findUnique
        ? ((await prisma.examResult.findUnique({
            where: { attemptId: attempt.id },
          })) as {
            id: string;
            score: number;
            passed: boolean;
            mcqScore?: number;
            essayScore?: number;
            status?: string;
            answersJson?: unknown;
          } | null)
        : null;

      if (!existing) throw e;

      // Invariant B: Verifikasi konsistensi seluruh field deterministik
      if (
        existing.score !== undefined &&
        existing.score !== null &&
        existing.score !== graded.score
      ) {
        return {
          ok: false,
          status: "FINALIZATION_STATE_INCONSISTENT",
          code: "PAYLOAD_CONFLICT",
          message: "Konflik hasil ujian: skor tidak konsisten dengan rekaman tersimpan.",
        };
      }
      if (
        existing.passed !== undefined &&
        existing.passed !== null &&
        existing.passed !== graded.passed
      ) {
        return {
          ok: false,
          status: "FINALIZATION_STATE_INCONSISTENT",
          code: "PAYLOAD_CONFLICT",
          message: "Konflik hasil ujian: status kelulusan tidak konsisten dengan rekaman tersimpan.",
        };
      }
      if (
        existing.mcqScore !== undefined &&
        existing.mcqScore !== null &&
        existing.mcqScore !== graded.mcqScore
      ) {
        return {
          ok: false,
          status: "FINALIZATION_STATE_INCONSISTENT",
          code: "PAYLOAD_CONFLICT",
          message: "Konflik hasil ujian: subskor MCQ tidak konsisten dengan rekaman tersimpan.",
        };
      }
      if (
        existing.essayScore !== undefined &&
        existing.essayScore !== null &&
        existing.essayScore !== graded.essayScore
      ) {
        return {
          ok: false,
          status: "FINALIZATION_STATE_INCONSISTENT",
          code: "PAYLOAD_CONFLICT",
          message: "Konflik hasil ujian: subskor Essay tidak konsisten dengan rekaman tersimpan.",
        };
      }
      if (
        existing.status !== undefined &&
        existing.status !== null &&
        existing.status !== graded.status
      ) {
        return {
          ok: false,
          status: "FINALIZATION_STATE_INCONSISTENT",
          code: "PAYLOAD_CONFLICT",
          message: "Konflik hasil ujian: status tidak konsisten dengan rekaman tersimpan.",
        };
      }
      if (
        existing.answersJson !== undefined &&
        existing.answersJson !== null &&
        !areAnswersJsonSemanticallyEqual(existing.answersJson, graded.details)
      ) {
        return {
          ok: false,
          status: "FINALIZATION_STATE_INCONSISTENT",
          code: "PAYLOAD_CONFLICT",
          message: "Konflik hasil ujian: rincian answersJson tidak konsisten dengan rekaman tersimpan.",
        };
      }

      resultId = existing.id;
      isRecovered = true;
    } else {
      throw e;
    }
  }

  // 7. Simpan ExamAnswer yang belum ada (missing) dan verifikasi kelengkapan pasca-insert
  let currentAnswers = existingAnswers;
  if (prisma.examAnswer?.findMany) {
    currentAnswers = (await prisma.examAnswer.findMany({
      where: { attemptId: attempt.id },
    })) as ExamAnswerRowLike[];
    const recheckVal = validateExamAnswerRows(currentAnswers, answerData, attempt.id);
    if (!recheckVal.ok) {
      return {
        ok: false,
        status: "FINALIZATION_STATE_INCONSISTENT",
        code: "PAYLOAD_CONFLICT",
        message: `Konflik jawaban pada soal ${recheckVal.questionId ?? "tidak dikenal"}: ${recheckVal.conflictReason}`,
      };
    }
  }

  const currentQuestions = new Set(currentAnswers.map((a) => a.questionId));
  const missingAnswers = answerData.filter(
    (ad) => !currentQuestions.has(ad.questionId),
  );

  if (missingAnswers.length > 0 && prisma.examAnswer?.createMany) {
    await prisma.examAnswer.createMany({
      data: missingAnswers,
      skipDuplicates: true,
    });
  }

  // Post-Insert Recheck: verifikasi kelengkapan dan konsistensi seluruh baris pasca-insert
  if (prisma.examAnswer?.findMany) {
    const finalAnswers = (await prisma.examAnswer.findMany({
      where: { attemptId: attempt.id },
    })) as ExamAnswerRowLike[];

    if (finalAnswers.length !== answerData.length) {
      return {
        ok: false,
        status: "FINALIZATION_STATE_INCONSISTENT",
        code: "PAYLOAD_CONFLICT",
        message: `Kelengkapan jawaban ujian pasca-penulisan tidak konsisten: diharapkan ${answerData.length} baris, ditemukan ${finalAnswers.length} baris.`,
      };
    }

    const postVal = validateExamAnswerRows(finalAnswers, answerData, attempt.id);
    if (!postVal.ok) {
      return {
        ok: false,
        status: "FINALIZATION_STATE_INCONSISTENT",
        code: "PAYLOAD_CONFLICT",
        message: `Konflik jawaban pasca-penulisan pada soal ${postVal.questionId ?? "tidak dikenal"}: ${postVal.conflictReason}`,
      };
    }
  }

  // 8. Conditional Update pada ExamAttempt.submittedAt (Invariants E, F)
  // Menjamin retry atau cron tidak menimpa timestamp yang telah ditetapkan
  if (!prisma.examAttempt?.updateMany) {
    throw new Error(
      "PrismaClient delegate does not support updateMany. Unconditional update fallback is prohibited.",
    );
  }

  const updateResult = await prisma.examAttempt.updateMany({
    where: {
      id: attempt.id,
      submittedAt: null,
    },
    data: {
      submittedAt: now,
    },
  });

  if (updateResult.count === 1) {
    return {
      ok: true,
      status: "COMPLETED_BY_SELF",
      resultId,
      score: graded.score,
      passed: graded.passed,
      attemptStatus: graded.status,
      recovered: isRecovered,
      closedBySelf: true,
    };
  }

  // Rekonsiliasi pasca count === 0: verifikasi apakah attempt benar-benar sudah ditutup
  // oleh worker lain dan result terbukti konsisten
  const verifiedAttempt = prisma.examAttempt?.findUnique
    ? ((await prisma.examAttempt.findUnique({
        where: { id: attempt.id },
        include: { result: true },
      })) as {
        id: string;
        submittedAt: Date | null;
        deletedAt: Date | null;
        result?: {
          id: string;
          score: number;
          passed: boolean;
          mcqScore?: number | null;
          essayScore?: number | null;
          status?: string | null;
          answersJson?: unknown;
        } | null;
      } | null)
    : null;

  if (!verifiedAttempt || verifiedAttempt.deletedAt != null) {
    return {
      ok: false,
      status: "ATTEMPT_MISSING_OR_DELETED",
      code: "NOT_FOUND",
      message: "Sesi ujian telah dihapus atau tidak ditemukan.",
    };
  }

  if (verifiedAttempt.submittedAt == null) {
    return {
      ok: false,
      status: "FINALIZATION_STATE_INCONSISTENT",
      code: "CONCURRENCY_RETRY_REQUIRED",
      message: "Penutupan sesi ujian gagal diperbarui dan attempt masih terbuka.",
    };
  }

  if (!verifiedAttempt.result) {
    return {
      ok: false,
      status: "FINALIZATION_STATE_INCONSISTENT",
      code: "INVALID_STATE",
      message: "Sesi ujian telah ditutup namun rekaman hasil ujian tidak ditemukan.",
    };
  }

  const exRes = verifiedAttempt.result;
  const isConflict =
    exRes.score !== graded.score ||
    exRes.passed !== graded.passed ||
    (exRes.mcqScore !== undefined &&
      exRes.mcqScore !== null &&
      exRes.mcqScore !== graded.mcqScore) ||
    (exRes.essayScore !== undefined &&
      exRes.essayScore !== null &&
      exRes.essayScore !== graded.essayScore) ||
    (exRes.status !== undefined &&
      exRes.status !== null &&
      exRes.status !== graded.status) ||
    !exRes.answersJson ||
    !areAnswersJsonSemanticallyEqual(exRes.answersJson, graded.details);

  if (isConflict) {
    return {
      ok: false,
      status: "FINALIZATION_STATE_INCONSISTENT",
      code: "PAYLOAD_CONFLICT",
      message: "Konflik hasil ujian: data tersimpan di basis data berbeda dengan payload finalisasi.",
    };
  }

  // Verifikasi konsistensi ExamAnswer pasca-penutupan konkuren (Invariants C & D)
  if (prisma.examAnswer?.findMany) {
    const reconAnswers = (await prisma.examAnswer.findMany({
      where: { attemptId: attempt.id },
    })) as ExamAnswerRowLike[];

    if (reconAnswers.length !== answerData.length) {
      return {
        ok: false,
        status: "FINALIZATION_STATE_INCONSISTENT",
        code: "PAYLOAD_CONFLICT",
        message: `Kelengkapan jawaban ujian pasca-penutupan konkuren tidak konsisten: diharapkan ${answerData.length} baris, ditemukan ${reconAnswers.length} baris.`,
      };
    }

    const reconVal = validateExamAnswerRows(reconAnswers, answerData, attempt.id);
    if (!reconVal.ok) {
      return {
        ok: false,
        status: "FINALIZATION_STATE_INCONSISTENT",
        code: "PAYLOAD_CONFLICT",
        message: `Konflik jawaban pasca-penutupan konkuren pada soal ${reconVal.questionId ?? "tidak dikenal"}: ${reconVal.conflictReason}`,
      };
    }
  }

  return {
    ok: true,
    status: "ALREADY_COMPLETED_ELSEWHERE",
    resultId: exRes.id,
    score: exRes.score,
    passed: exRes.passed,
    attemptStatus: exRes.status ?? graded.status,
    recovered: true,
    closedBySelf: false,
  };
}

// Submit & auto-grade secara server-side (laporan Discord dikirim
// terpisah lewat /api/exam/report agar submit tidak kena timeout).
export async function submitExam(
  user: User,
  input: SubmitExamInput,
  options?: { ctx?: CandidateEligibilityContext },
): Promise<SubmitExamResult> {
  if (options?.ctx) {
    await assertEligibilityStillValid(prisma, options.ctx);
  }

  await ensureSchema();
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: input.attemptId },
    include: { period: true },
  });

  if (!attempt || attempt.userId !== user.id) {
    return { ok: false, code: "NOT_FOUND", message: "Sesi ujian tidak ditemukan." };
  }

  // Gerbang absensi: submit ditolak bila attendance untuk periode ini hilang
  // (misal absen dihapus admin di tengah pengerjaan).
  const attendance = await hasAttendance(user.id, attempt.periodId);
  if (!attendance) {
    return {
      ok: false,
      code: "NO_ATTENDANCE",
      message: "Absensi Anda untuk periode ini tidak ditemukan. Hubungi admin.",
    };
  }

  if (attempt.submittedAt) {
    return { ok: false, code: "ALREADY_SUBMITTED", message: "Ujian sudah pernah dikumpulkan." };
  }

  const durationMs = CONFIG.examDurationMinutes * 60_000;
  const graceMs = 5 * 60_000;
  if (Date.now() - attempt.startedAt.getTime() > durationMs + graceMs) {
    return { ok: false, code: "EXPIRED", message: "Waktu ujian telah habis." };
  }

  const finalizeRes = await finalizeExamAttempt({
    attempt,
    callerSource: "CANDIDATE",
    submittedAnswers: input.answers,
    ctx: options?.ctx,
    now: new Date(),
    passThreshold: attempt.period.passThreshold ?? CONFIG.kkm,
  });

  if (!finalizeRes.ok) {
    return {
      ok: false,
      code: finalizeRes.code,
      message: finalizeRes.message,
    };
  }

  return {
    ok: true,
    resultId: finalizeRes.resultId,
    score: finalizeRes.score,
    passed: finalizeRes.passed,
  };
}

// TASK 03L.2E.4.4 — Hasil terbaru MILIK user.
// Selalu terikat pada userId tepercaya (dari sesi server), bukan username dari
// klien. Filter soft-delete (ExamResult + ExamAttempt) agar hasil/attempt yang
// sudah dihapus admin tidak muncul. Urutan deterministik: submittedAt desc,
// lalu id desc sebagai tie-break.
export async function getLatestResult(userId: string) {
  return prisma.examResult.findFirst({
    where: {
      deletedAt: null,
      attempt: { userId, deletedAt: null },
    },
    include: {
      attempt: {
        include: {
          user: true,
          period: true,
        },
      },
    },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
  });
}
