import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { submitExam, type SubmitExamResult } from "@/lib/exam-service";
import { prisma } from "@/lib/prisma";
import { clientIp, submitLimiter, userSubmitLimiter } from "@/lib/rate-limit";
import { logStudentAction } from "@/lib/audit";
import { assignDiscordRoleAndNickname } from "@/lib/discord-api";
import { CONFIG } from "@/lib/constants";
import {
  requireCurrentCandidateEligibility,
  assertEligibilityStillValid,
  type CandidateEligibilityContext,
} from "@/lib/candidate-guard";
import { candidateGuardErrorResponse } from "@/lib/guard-response";

const SubmitSchema = z.object({
  attemptId: z.string().min(1),
  answers: z.array(z.object({ questionId: z.string().min(1), answer: z.string() })).max(50),
});

export async function POST(req: Request) {
  const limited = submitLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID",
        message: `Terlalu banyak percobaan submit. Coba lagi dalam ${limited.retryAfterSeconds} detik.`,
      },
      { status: 429 }
    );
  }

   const user = await getSessionUser(req);
   if (!user) {
     return NextResponse.json(
       { ok: false, code: "UNAUTHORIZED", message: "Silakan login terlebih dahulu." },
       { status: 401 }
     );
   }

   // Rate limit per-user (berbeda dari IP-based)
   const userLimited = userSubmitLimiter.check(user.id);
   if (!userLimited.ok) {
     return NextResponse.json(
       {
         ok: false,
         code: "INVALID",
         message: `Terlalu banyak percobaan submit. Coba lagi dalam ${userLimited.retryAfterSeconds} detik.`,
       },
       { status: 429 }
     );
   }

  if (user.matraBlocked) {
    return NextResponse.json(
      { ok: false, code: "INVALID", message: "Akses ujian ditolak." },
      { status: 403 }
    );
  }

  // TASK 03L.2E.4.2 — Candidate Guard: submit hanya untuk calon DITERIMA.
  // Dijalankan sebelum submitExam membuat ExamResult/mengubah ExamAttempt.
  // TASK 03L.2E.4.6 — ctx disimpan untuk pemeriksaan final di batas penulisan.
  let ctx: CandidateEligibilityContext;
  try {
    ctx = await requireCurrentCandidateEligibility(prisma, user);
  } catch (err) {
    const guardResponse = candidateGuardErrorResponse(err);
    if (guardResponse) return guardResponse;
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID", message: "Payload tidak valid." },
      { status: 400 }
    );
  }

  // TASK 03L.2E.4.6 — Pemeriksaan final sebelum submitExam menulis ExamResult.
  try {
    await assertEligibilityStillValid(prisma, ctx);
  } catch (err) {
    const guardResponse = candidateGuardErrorResponse(err);
    if (guardResponse) return guardResponse;
    throw err;
  }

  let result: SubmitExamResult;
  try {
    result = await submitExam(user, parsed.data, { ctx });
  } catch (err) {
    const guardResponse = candidateGuardErrorResponse(err);
    if (guardResponse) return guardResponse;
    throw err;
  }
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "ALREADY_SUBMITTED"
          ? 409
          : result.code === "EXPIRED"
            ? 410
            : result.code === "NO_ATTENDANCE"
              ? 403
              : result.code === "PAYLOAD_CONFLICT"
                ? 409
                : result.code === "CONCURRENCY_RETRY_REQUIRED"
                  ? 409
                  : result.code === "INVALID_STATE"
                    ? 500
                    : result.code === "ELIGIBILITY_VIOLATION"
                      ? 403
                      : 400;
    return NextResponse.json({ ok: false, code: result.code, message: result.message }, { status });
  }

   // Catat aksi siswa (best-effort, tidak mengganggu respons)
   const attempt = await prisma.examAttempt.findUnique({
     where: { id: parsed.data.attemptId },
     select: { periodId: true, userId: true },
   });
   void logStudentAction({
     userId: user.id,
     action: "EXAM_SUBMIT",
     periodId: attempt?.periodId ?? "",
     attemptId: parsed.data.attemptId,
     detail: { resultId: result.resultId },
   });

   // Otomatis pasang role "Tahap Interview" bagi casis yang menyelesaikan tahap akademik
   if (CONFIG.discordBotToken && CONFIG.discordGuildId) {
     void (async () => {
       try {
         const discordTarget =
           user.discordUsername ||
           (await prisma.attendance.findFirst({
             where: { userId: user.id },
             select: { discordUserId: true },
           }))?.discordUserId ||
           (await prisma.application.findFirst({
             where: { userId: user.id },
             select: { discordId: true },
           }))?.discordId;

         if (discordTarget) {
           const robloxName = user.username || "Casis";
           const nick = `[CASIS] ${robloxName}`;
           const roleRes = await assignDiscordRoleAndNickname(
             discordTarget.trim(),
             "Tahap Interview",
             nick
           );
           if (!roleRes.ok) {
             console.warn("[ExamSubmit] Gagal pasang role Tahap Interview:", roleRes.message);
           } else {
             console.log(`[ExamSubmit] Berhasil pasang role Tahap Interview untuk ${discordTarget}`);
           }
         }
       } catch (roleErr) {
         console.error("[ExamSubmit] Error assign role Tahap Interview:", roleErr);
       }
     })();
   }

   return NextResponse.json({ ok: true, resultId: result.resultId });
  }
