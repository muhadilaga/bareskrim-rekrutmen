// ============================================================
// Exam Service - logika inti (dipakai halaman server & API route)
// ============================================================

import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/constants";
import { Prisma } from "@prisma/client";
import {
  buildQuestionSet,
  gradeExam,
  hashString,
  sanitizeForClient,
  type ClientQuestion,
  type SnapshotQuestion,
} from "@/lib/grading";
import { ensureSchema } from "@/lib/init-schema";
import type { User } from "@prisma/client";

export type ExamSessionResult =
  | { ok: true; attemptId: string; questions: ClientQuestion[]; remainingSeconds: number; period: { name: string; description: string | null } }
  | { ok: false; code: "NO_ACTIVE_PERIOD" | "ALREADY_SUBMITTED" | "RANK_BLOCKED"; message: string };

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

  const period = await prisma.examPeriod.findFirst({
    where: { isActive: true },
    orderBy: { openedAt: "desc" },
  });

  if (!period) {
    return {
      ok: false,
      code: "NO_ACTIVE_PERIOD",
      message: "Periode rekrutmen belum dibuka oleh instruktur.",
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

  // Lanjutkan percobaan yang belum selesai (misal halaman ter-refresh).
  // Waktu sisa dihitung dari server (attempt.startedAt) agar refresh
  // tidak bisa me-reset timer.
  if (existing) {
    const durationMs = CONFIG.examDurationMinutes * 60_000;
    const elapsed = Date.now() - existing.startedAt.getTime();
    const remainingSeconds = Math.max(0, Math.floor((durationMs - elapsed) / 1000));
    return {
      ok: true,
      attemptId: existing.id,
      questions: sanitizeForClient(existing.questionsJson as unknown as SnapshotQuestion[]),
      remainingSeconds,
      period: { name: period.name, description: period.description },
    };
  }

  const [mcqs, essays] = await Promise.all([
    prisma.question.findMany({ where: { type: "MCQ", isActive: true } }),
    prisma.question.findMany({ where: { type: "ESSAY", isActive: true } }),
  ]);

  if (mcqs.length < CONFIG.mcqCount || essays.length < CONFIG.essayCount) {
    return {
      ok: false,
      code: "NO_ACTIVE_PERIOD",
      message: "Bank soal belum mencukupi untuk periode ini. Hubungi instruktur.",
    };
  }

  // Subset soal dipilih oleh seed periode (sama utk semua casis), tetapi
  // urutan soal & posisi opsi diacak per username agar tiap casis berbeda.
  const userSeed = hashString(`${period.id}:${user.id}`);
  const snapshot = buildQuestionSet(mcqs, essays, period.seed, userSeed);

  const attempt = await prisma.examAttempt.create({
    data: {
      periodId: period.id,
      userId: user.id,
      attemptKey: `${period.id}_${user.id}`,
      questionsJson: snapshot as unknown as object,
    },
  });

  return {
    ok: true,
    attemptId: attempt.id,
    questions: sanitizeForClient(snapshot),
    remainingSeconds: CONFIG.examDurationMinutes * 60,
    period: { name: period.name, description: period.description },
  };
}

export interface SubmitExamInput {
  attemptId: string;
  answers: Array<{ questionId: string; answer: string }>;
}

export type SubmitExamResult =
  | { ok: true; resultId: string }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_SUBMITTED" | "EXPIRED" | "INVALID"; message: string };

// Submit & auto-grade secara server-side (laporan Discord dikirim
// terpisah lewat /api/exam/report agar submit tidak kena timeout).
export async function submitExam(
  user: User,
  input: SubmitExamInput
): Promise<SubmitExamResult> {
  await ensureSchema();
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: input.attemptId },
  });

  if (!attempt || attempt.userId !== user.id) {
    return { ok: false, code: "NOT_FOUND", message: "Sesi ujian tidak ditemukan." };
  }

  if (attempt.submittedAt) {
    return { ok: false, code: "ALREADY_SUBMITTED", message: "Ujian sudah pernah dikumpulkan." };
  }

  const durationMs = CONFIG.examDurationMinutes * 60_000;
  const graceMs = 5 * 60_000;
  if (Date.now() - attempt.startedAt.getTime() > durationMs + graceMs) {
    return { ok: false, code: "EXPIRED", message: "Waktu ujian telah habis." };
  }

  const snapshot = attempt.questionsJson as unknown as SnapshotQuestion[];
  const validIds = new Set(snapshot.map((q) => q.id));

  // Validasi: hanya terima jawaban untuk soal dari snapshot periode ini
  const answersMap: Record<string, string> = {};
  for (const a of input.answers) {
    if (!validIds.has(a.questionId)) continue;
    if (typeof a.answer !== "string") continue;
    answersMap[a.questionId] = a.answer.slice(0, 4000);
  }

  const graded = gradeExam(snapshot, answersMap);

  // CATATAN: jangan pakai $transaction(async ...) interaktif di sini.
  // Dengan Supabase pooler (pgbouncer=true) di lingkungan serverless,
  // transaksi multi-perintah sering gagal P2028 "Transaction not found"
  // karena koneksi di-recycle di tengah transaksi. Operasi dibuat
  // berurutan; bila gagal parsial, auto-heal membiarkan casis mencoba lagi.
  let result: { id: string };
  try {
    result = await prisma.examResult.create({
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
  } catch (e) {
    // Retry setelah kegagalan parsial: hasil sudah pernah dibuat
    // (ExamResult.attemptId unik) -> cukup kembalikan hasil yang ada.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.examResult.findUnique({ where: { attemptId: attempt.id } });
      if (existing) {
        if (!attempt.submittedAt) {
          await prisma.examAttempt.update({
            where: { id: attempt.id },
            data: { submittedAt: new Date() },
          });
        }
        return { ok: true, resultId: existing.id };
      }
    }
    throw e;
  }

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

  if (answerData.length > 0) {
    await prisma.examAnswer.createMany({ data: answerData });
  }

  await prisma.examAttempt.update({
    where: { id: attempt.id },
    data: { submittedAt: new Date() },
  });

  // Laporan Discord TIDAK dikirim di sini (bisa melewati batas timeout
  // fungsi di platform serverless). Klien memanggil /api/exam/report
  // setelah submit berhasil; endpoint itu yang mengirim laporan.
  return { ok: true, resultId: result.id };
}

export async function getLatestResult(userId: string) {
  return prisma.examResult.findFirst({
    where: { attempt: { userId } },
    include: {
      attempt: {
        include: {
          user: true,
          period: true,
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });
}
