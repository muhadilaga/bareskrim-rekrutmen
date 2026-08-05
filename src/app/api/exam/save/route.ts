import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, saveLimiter } from "@/lib/rate-limit";

const SaveSchema = z.object({
  attemptId: z.string().min(1),
  answers: z.record(z.string(), z.string()).optional(),
  flaggedQuestions: z.array(z.string()).optional(),
  bookmarkedQuestions: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const limited = saveLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, message: "Terlalu banyak permintaan save." },
      { status: 429 }
    );
  }

  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Payload tidak valid." },
      { status: 400 }
    );
  }

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: parsed.data.attemptId },
  });

  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json(
      { ok: false, message: "Sesi ujian tidak ditemukan." },
      { status: 404 }
    );
  }

  if (attempt.submittedAt) {
    return NextResponse.json(
      { ok: false, message: "Ujian sudah dikumpulkan." },
      { status: 409 }
    );
  }

  // Batasi ukuran: maks 50 pasang jawaban, max 4000 char per jawaban
  const entries = Object.entries(parsed.data.answers ?? {}).slice(0, 50);
  const sanitized: Record<string, string> = {};
  for (const [k, v] of entries) {
    sanitized[k] = String(v).slice(0, 4000);
  }

  const updateData: {
    savedAnswers: Record<string, string>;
    flaggedQuestions?: string[];
    bookmarkedQuestions?: string[];
  } = { savedAnswers: sanitized };

  if (parsed.data.flaggedQuestions) {
    updateData.flaggedQuestions = parsed.data.flaggedQuestions;
  }
  if (parsed.data.bookmarkedQuestions) {
    updateData.bookmarkedQuestions = parsed.data.bookmarkedQuestions;
  }

  await prisma.examAttempt.update({
    where: { id: attempt.id },
    data: updateData,
  });

  return NextResponse.json({ ok: true });
}
