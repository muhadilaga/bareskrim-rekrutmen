import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { ensureSchema } from "@/lib/init-schema";
import { sendDiscordExamReport, type ExamReportInput } from "@/lib/discord";

// GET: Cek status antrean retry Discord
export async function GET(req: Request) {
  const adminKey = req.headers.get("x-admin-key");
  if (!adminKey || adminKey !== getAdminKey()) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const pending = await prisma.pendingDiscordReport.findMany({
      where: { attempts: { lt: 3 } },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    return NextResponse.json({ ok: true, pending: pending.length, items: pending });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Gagal memuat antrean." },
      { status: 500 }
    );
  }
}

// POST: Proses ulang laporan Discord yang gagal (worker)
// Endpoint ini bisa dipanggil oleh cron atau manual.
export async function POST(req: Request) {
  const adminKey = req.headers.get("x-admin-key");
  if (!adminKey || adminKey !== getAdminKey()) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const pending = await prisma.pendingDiscordReport.findMany({
      where: { attempts: { lt: 3 } },
      orderBy: { createdAt: "asc" },
      take: 10,
    });

    if (pending.length === 0) {
      return NextResponse.json({ ok: true, message: "Tidak ada laporan yang perlu di-retry.", processed: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const item of pending) {
      const payload = item.payload as unknown as Omit<ExamReportInput, "details"> & {
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

      const messageId = await sendDiscordExamReport(report);

      if (messageId) {
        // Berhasil - update examResult + hapus dari queue
        await prisma.examResult.update({
          where: { id: item.resultId },
          data: { discordMessageId: messageId },
        });
        await prisma.pendingDiscordReport.delete({ where: { id: item.id } });
        sent++;
      } else {
        // Gagal - increment attempts
        await prisma.pendingDiscordReport.update({
          where: { id: item.id },
          data: {
            attempts: { increment: 1 },
            lastError: new Date().toISOString(),
          },
        });
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Retry selesai. ${sent} berhasil, ${failed} gagal.`,
      processed: sent + failed,
    });
  } catch (e) {
    console.error("Discord retry worker error:", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Gagal memproses retry." },
      { status: 500 }
    );
  }
}
