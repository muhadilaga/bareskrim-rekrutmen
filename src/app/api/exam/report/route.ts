import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/init-schema";
import { sendDiscordExamReport } from "@/lib/discord";
import { assignDiscordRoleById, removeDiscordRoleById, assignDiscordRoleAndNickname } from "@/lib/discord-api";
import { CONFIG } from "@/lib/constants";
import { clientIp, createRateLimiter, userSubmitLimiter } from "@/lib/rate-limit";
import type { GradedAnswerDetail } from "@/lib/grading";
import { serializeGradedDetails } from "@/lib/grading";
import {
  requireCurrentCandidateEligibility,
  assertEligibilityStillValid,
  type CandidateEligibilityContext,
} from "@/lib/candidate-guard";
import { candidateGuardErrorResponse } from "@/lib/guard-response";

const reportLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

const ReportSchema = z.object({
  resultId: z.string().min(1),
});

// Kirim laporan Discord secara terpisah dari submit ujian.
// Submit harus cepat (di bawah batas timeout fungsi), jadi Discord
// dikirim lewat request sendiri; klien memanggil endpoint ini setelah
// submit berhasil (best-effort). Idempoten: bila discordMessageId sudah
// terisi, tidak dikirim ulang.
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

   const limited = reportLimiter.check(clientIp(req));
   if (!limited.ok) {
     return NextResponse.json(
       { ok: false, message: "Terlalu banyak percobaan. Coba lagi nanti." },
       { status: 429 }
     );
   }

   // Rate limit per-user
   const userLimited = userSubmitLimiter.check(user.id);
   if (!userLimited.ok) {
     return NextResponse.json(
       { ok: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${userLimited.retryAfterSeconds} detik.` },
       { status: 429 }
     );
   }

   // TASK 03L.2E.4.2 — Candidate Guard: laporan Discord + assign role hanya
   // untuk calon DITERIMA. Dijalankan sebelum side effect Discord/DB apa pun.
   // TASK 03L.2E.4.6 — ctx disimpan untuk pemeriksaan final di batas side effect.
   let ctx: CandidateEligibilityContext;
   try {
     ctx = await requireCurrentCandidateEligibility(prisma, user);
   } catch (err) {
     const guardResponse = candidateGuardErrorResponse(err);
     if (guardResponse) return guardResponse;
     throw err;
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

    // TASK 03L.2E.4.6 — Pemeriksaan final sebelum side effect Discord. Bila
    // kelayakan berubah selama request, jangan kirim laporan / ubah role.
    try {
      await assertEligibilityStillValid(prisma, ctx);
    } catch (err) {
      const guardResponse = candidateGuardErrorResponse(err);
      if (guardResponse) return guardResponse;
      throw err;
    }

    if (result.discordMessageId) {
      // Laporan sudah terkirim, tapi coba assign/remove role jika belum
      const discordUsername = result.attempt.user.discordUsername;
      if (discordUsername) {
        if (CONFIG.tahapInterviewRoleId) {
          await assignDiscordRoleById(discordUsername, CONFIG.tahapInterviewRoleId);
        }
        if (CONFIG.tahapAkademikRoleId) {
          await removeDiscordRoleById(discordUsername, CONFIG.tahapAkademikRoleId);
        }
      }
      return NextResponse.json({ ok: true, message: "Laporan Discord sudah terkirim sebelumnya." });
    }

    const details = (result.answersJson ?? []) as unknown as GradedAnswerDetail[];
    console.log(`[ExamReport] Sending webhook for ${result.attempt.user.username}, status=${result.status}, score=${result.score}/${result.maxScore}`);
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
    console.log(`[ExamReport] Webhook result: messageId=${messageId}`);

    if (messageId) {
      await prisma.examResult.update({
        where: { id: result.id },
        data: { discordMessageId: messageId },
      });
      await prisma.pendingDiscordReport.deleteMany({ where: { resultId: result.id } });
    } else {
      const payload = buildRetryPayload(result, details);
      await prisma.pendingDiscordReport.upsert({
        where: { resultId: result.id },
        create: { resultId: result.id, payload },
        update: { payload, attempts: { increment: 1 } },
      });
    }

    // Role assignment & DM selalu dijalankan terlepas dari webhook
    let discordUsername = result.attempt.user.discordUsername;
    if (!discordUsername) {
      const att = await prisma.attendance.findFirst({
        where: { userId: result.attempt.user.id },
        select: { discordUserId: true },
      });
      const app = await prisma.application.findFirst({
        where: { userId: result.attempt.user.id },
        select: { discordId: true },
      });
      discordUsername = att?.discordUserId || app?.discordId || null;
    }

    console.log(`[ExamReport] discordUsername=${discordUsername}, passed=${result.passed}`);
    if (discordUsername) {
      const robloxName = result.attempt.user.username || "Casis";
      const nick = `[CASIS] ${robloxName}`;
      const roleResult = await assignDiscordRoleAndNickname(discordUsername, "Tahap Interview", nick);
      console.log(`[ExamReport] Assign interview role to ${discordUsername}: ok=${roleResult.ok} msg=${roleResult.message}`);
      if (CONFIG.tahapAkademikRoleId) {
        const removeResult = await removeDiscordRoleById(discordUsername, CONFIG.tahapAkademikRoleId);
        console.log(`[ExamReport] Remove tahap akademik role after exam from ${discordUsername}: ok=${removeResult.ok} msg=${removeResult.message}`);
      }
    } else {
      console.log(`[ExamReport] SKIP role/DM: discordUsername tidak ditemukan`);
    }

    return NextResponse.json({
      ok: true,
      message: messageId ? "Laporan Discord terkirim." : "Hasil tersimpan, laporan Discord gagal dikirim (queued).",
      queued: !messageId,
    });
  } catch (e) {
    console.error("exam report error", e);
    return NextResponse.json({ ok: false, message: "Terjadi kesalahan server." }, { status: 500 });
  }
}

import { Prisma } from "@prisma/client";

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
      user: { username: string; displayName: string; robloxId: bigint | number; avatarUrl: string | null; policeGroupRank: string | null };
      period: { name: string };
    };
  },
  details: GradedAnswerDetail[]
): Prisma.InputJsonValue {
  const payload = {
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
    details: serializeGradedDetails(details),
  };
  return payload as Prisma.InputJsonValue;
}
