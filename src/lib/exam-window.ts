export type ExamSessionAction =
  | { action: "resume" }
  | { action: "create" }
  | { action: "block"; code: "EXAM_NOT_OPEN"; message: string };

export function decideExamSessionAction(opts: {
  now: Date;
  isExamOpen: boolean;
  examStartTime: Date | null;
  examEndTime: Date | null;
  hasUnsubmittedAttempt: boolean;
}): ExamSessionAction {
  if (!opts.isExamOpen) {
    return {
      action: "block",
      code: "EXAM_NOT_OPEN",
      message: "Sesi ujian belum dibuka oleh instruktur. Silakan tunggu pengumuman jadwal ujian.",
    };
  }

  if (opts.hasUnsubmittedAttempt) {
    return { action: "resume" };
  }

  if (opts.examStartTime && opts.now < opts.examStartTime) {
    return {
      action: "block",
      code: "EXAM_NOT_OPEN",
      message: `Ujian belum dimulai. Jadwal mulai: ${opts.examStartTime.toLocaleString("id-ID")}.`,
    };
  }

  if (opts.examEndTime && opts.now > opts.examEndTime) {
    return {
      action: "block",
      code: "EXAM_NOT_OPEN",
      message: "Sesi ujian sudah ditutup oleh instruktur. Tidak bisa mengakses soal lagi.",
    };
  }

  return { action: "create" };
}

export function isAttemptSubmittable(
  nowMs: number,
  startedAt: Date | string,
  durationMinutes: number,
  graceMinutes = 5
): boolean {
  const elapsed = nowMs - new Date(startedAt).getTime();
  return elapsed <= durationMinutes * 60_000 + graceMinutes * 60_000;
}
