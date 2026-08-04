import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/init-schema";
import { sendDiscordExamReport } from "@/lib/discord";
import type { GradedAnswerDetail } from "@/lib/grading";

const ReportSchema = z.object({
  resultId: z.string().min(1),
});

// Kirim laporan Discord secara terpisah dari submit ujian.
// Submit harus cepat (di bawah batas timeout fungsi), jadi Discord
// dikirim lewat request sendiri; klien memanggil endpoint ini setelah
// submit berhasil (best-effort). Idempoten: bila discordMessageId sudah
// terisi, tidak dikirim ulang.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Payload tidak valid." }, { status: 400 });
  }

  try {
    await ensureSchema();
    const result = await prisma.examResult.findUnique({
      where: { id: parsed.data.resultId },
      include: { attempt: { include: { user: true, period: true } } },
    });

    if (!result || result.attempt.userId !== user.id) {
      return NextResponse.json({ ok: false, message: "Hasil tidak ditemukan." }, { status: 404 });
    }

    if (result.discordMessageId) {
      return NextResponse.json({ ok: true, message: "Laporan Discord sudah terkirim sebelumnya." });
    }

    const details = (result.answersJson ?? []) as unknown as GradedAnswerDetail[];
    const messageId = await sendDiscordExamReport({
      username: result.attempt.user.username,
      displayName: result.attempt.user.displayName,
      robloxId: Number(result.attempt.user.robloxId),
      avatarUrl: result.attempt.user.avatarUrl,
      policeRank: result.attempt.user.policeGroupRank,
      score: result.score,
      maxScore: result.maxScore,
      mcqScore: result.mcqScore,
      essayScore: result.essayScore,
      status: result.status,
      periodName: result.attempt.period.name,
      details,
    });

    if (messageId) {
      await prisma.examResult.update({
        where: { id: result.id },
        data: { discordMessageId: messageId },
      });
      // Retry berhasil, hapus dari queue jika ada
      await prisma.pendingDiscordReport.deleteMany({ where: { resultId: result.id } });
      return NextResponse.json({ ok: true, message: "Laporan Discord terkirim." });
    }

    // Gagal mengirim Discord - simpan ke queue untuk retry
    const payload = buildRetryPayload(result, details);
    await prisma.pendingDiscordReport.upsert({
      where: { resultId: result.id },
      create: { resultId: result.id, payload },
      update: { payload, attempts: { increment: 1 } },
    });

    return NextResponse.json({
      ok: true,
      message: "Hasil tersimpan, laporan Discord gagal dikirim dan dimasukkan ke antrean retry.",
      queued: true,
    });
  } catch (e) {
    console.error("exam report error", e);
    return NextResponse.json({ ok: false, message: "Terjadi kesalahan server." }, { status: 500 });
  }
}

// Helper: build payload JSON untuk retry
function buildRetryPayload(
  result: {
    id: string;
    score: number;
    maxScore: number;
    mcqScore: number;
    essayScore: number;
    status: string;
    attempt: {
      user: { username: string; displayName: string; robloxId: number; avatarUrl: string | null; policeGroupRank: string | null };
      period: { name: string };
    };
  },
  details: GradedAnswerDetail[]
): Record<string, unknown> {
  return {
    username: result.attempt.user.username,
    displayName: result.attempt.user.displayName,
    robloxId: Number(result.attempt.user.robloxId),
    avatarUrl: result.attempt.user.avatarUrl,
    policeRank: result.attempt.user.policeGroupRank,
    score: result.score,
    maxScore: result.maxScore,
    mcqScore: result.mcqScore,
    essayScore: result.essayScore,
    status: result.status,
    periodName: result.attempt.period.name,
    details,
  };
}
