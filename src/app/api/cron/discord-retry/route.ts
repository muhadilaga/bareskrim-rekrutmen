import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSchema } from "@/lib/init-schema";
import { sendDiscordExamReport, type ExamReportInput } from "@/lib/discord";

// Endpoint cron job untuk retry laporan Discord yang gagal.
// Dapat dipanggil oleh Netlify Scheduled Functions tanpa perlu autentikasi
// karena URL endpoint-nya sudah aman dan tidak diekspos ke publik secara langsung.
export async function GET() {
  try {
    await ensureSchema();

    const pending = await prisma.pendingDiscordReport.findMany({
      where: { attempts: { lt: 3 } },
      orderBy: { createdAt: "asc" },
      take: 10,
      include: { result: true },
    });

    if (pending.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Tidak ada laporan yang perlu di-retry.",
        processed: 0,
      });
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of pending) {
      const payload = item.payload as unknown as {
        username: string;
        displayName: string;
        robloxId: number;
        avatarUrl: string | null;
        policeRank: string | null;
        score: number;
        maxScore: number;
        mcqScore: number;
        essayScore: number;
        status: string;
        periodName: string;
        details: ExamReportInput["details"];
      };

      const report: ExamReportInput = {
        username: payload.username,
        displayName: payload.displayName,
        robloxId: payload.robloxId,
        avatarUrl: payload.avatarUrl,
        policeRank: payload.policeRank,
        score: payload.score,
        maxScore: payload.maxScore,
        mcqScore: payload.mcqScore,
        essayScore: payload.essayScore,
        status: payload.status,
        periodName: payload.periodName,
        details: payload.details,
      };

      try {
        const messageId = await sendDiscordExamReport(report);

        if (messageId) {
          await prisma.examResult.update({
            where: { id: item.resultId },
            data: { discordMessageId: messageId },
          });
          await prisma.pendingDiscordReport.delete({ where: { id: item.id } });
          sent++;
          console.log(`[cron-retry] Berhasil retry resultId=${item.resultId} messageId=${messageId}`);
        } else {
          await prisma.pendingDiscordReport.update({
            where: { id: item.id },
            data: {
              attempts: { increment: 1 },
              lastError: `gagal kirim Discord (attempt ${item.attempts + 1})`,
              updatedAt: new Date(),
            },
          });
          failed++;
          errors.push(`resultId=${item.resultId} gagal dikirim`);
        }
      } catch (e) {
        await prisma.pendingDiscordReport.update({
          where: { id: item.id },
          data: {
            attempts: { increment: 1 },
            lastError: e instanceof Error ? e.message : String(e),
            updatedAt: new Date(),
          },
        });
        failed++;
        errors.push(`resultId=${item.resultId} error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.log(
      `[cron-retry] Selesai. Terkirim: ${sent}, Gagal: ${failed}, Total diproses: ${sent + failed}`
    );

    return NextResponse.json({
      ok: true,
      processed: sent + failed,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("Cron Discord retry error:", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
