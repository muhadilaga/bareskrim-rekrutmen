import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/constants";
import { gradeExam } from "@/lib/grading";

export async function GET() {
  const now = new Date();
  const graceMs = 5 * 60_000;

  const expiredAttempts = await prisma.examAttempt.findMany({
    where: {
      submittedAt: null,
      startedAt: {
        lt: new Date(now.getTime() - CONFIG.examDurationMinutes * 60_000 - graceMs),
      },
    },
    include: {
      period: true,
      user: true,
      answers: true,
    },
  });

  let processed = 0;

  for (const attempt of expiredAttempts) {
    try {
      const snapshot = attempt.questionsJson as unknown as Array<{
        id: string;
        type: "MCQ" | "ESSAY";
        prompt: string;
        correctKey?: string;
        keywords?: string[];
        points: number;
        options?: Array<{ key: string; text: string }> | undefined;
      }>;

      const validIds = new Set(snapshot.map((q) => q.id));
      const answersMap: Record<string, string> = {};

      for (const answer of attempt.answers) {
        if (!validIds.has(answer.questionId)) continue;
        answersMap[answer.questionId] = (answer.answer || "").slice(0, 4000);
      }

      const graded = gradeExam(snapshot, answersMap, attempt.period.passThreshold ?? CONFIG.kkm);

      await prisma.examResult.create({
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

      await prisma.examAttempt.update({
        where: { id: attempt.id },
        data: { submittedAt: now },
      });

      processed++;
    } catch (e) {
      console.error(`Auto-submit failed for attempt ${attempt.id}:`, e);
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Auto-submit selesai. ${processed} attempt diproses.`,
    processed,
  });
}