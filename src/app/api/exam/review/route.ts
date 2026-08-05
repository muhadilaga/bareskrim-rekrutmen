import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/constants";

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const resultId = searchParams.get("resultId");

  if (!resultId) {
    return NextResponse.json({ ok: false, message: "resultId wajib diisi" }, { status: 400 });
  }

  try {
    const result = await prisma.examResult.findUnique({
      where: { id: resultId },
      include: {
        attempt: {
          include: {
            period: true,
            user: true,
          },
        },
      },
    });

    if (!result) {
      return NextResponse.json({ ok: false, message: "Hasil tidak ditemukan" }, { status: 404 });
    }

    // Cek ownership
    if (result.attempt.userId !== user.id) {
      return NextResponse.json({ ok: false, message: "Tidak diizinkan" }, { status: 403 });
    }

    const snapshot = result.attempt.questionsJson as unknown as Array<{
      id: string;
      type: "MCQ" | "ESSAY";
      prompt: string;
      options?: Array<{ key: string; text: string }>;
      correctKey?: string;
      keywords?: string[];
      points: number;
    }>;

    const answersMap = (result.answersJson as unknown as Array<{
      questionId: string;
      userAnswer: string;
      isCorrect?: boolean;
      earnedPoints?: number;
      type: "MCQ" | "ESSAY";
    }>).reduce((acc, a) => {
      acc[a.questionId] = a;
      return acc;
    }, {} as Record<string, { questionId: string; userAnswer: string; isCorrect?: boolean; earnedPoints?: number; type: "MCQ" | "ESSAY" }>);

    const reviewData = snapshot.map((q) => {
      const userAnswer = answersMap[q.id];
      const isCorrect = q.type === "MCQ" 
        ? userAnswer?.userAnswer === q.correctKey
        : userAnswer?.isCorrect ?? false;

      return {
        questionId: q.id,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        correctKey: q.correctKey,
        keywords: q.keywords,
        points: q.points,
        userAnswer: userAnswer?.userAnswer ?? "",
        isCorrect,
        earnedPoints: userAnswer?.earnedPoints ?? 0,
        maxPoints: q.points,
      };
    });

    return NextResponse.json({
      ok: true,
      review: reviewData,
      summary: {
        score: result.score,
        maxScore: result.maxScore,
        mcqScore: result.mcqScore,
        essayScore: result.essayScore,
        status: result.status,
        passed: result.passed,
        submittedAt: result.submittedAt.toISOString(),
        periodName: result.attempt.period.name,
      },
    });
  } catch (e) {
    console.error("Exam review error:", e);
    return NextResponse.json({ ok: false, message: "Gagal memuat review" }, { status: 500 });
  }
}