import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminKey } from "@/lib/constants";
import { deleteDiscordExamReport } from "@/lib/discord";
import { ensureSchema } from "@/lib/init-schema";
import { logAdminAction } from "@/lib/audit";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

// Rekap nilai casis: semua hasil ujian + user + periode.
// ?periodId= opsional untuk memfilter per periode.
export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const periodId = searchParams.get("periodId")?.trim() || null;

  try {
    await ensureSchema();
    const results = await prisma.examResult.findMany({
      where: periodId ? { attempt: { periodId } } : {},
      orderBy: { submittedAt: "desc" },
      include: {
        attempt: {
          include: {
            user: true,
            period: true,
          },
        },
      },
    });

    const rows = results.map((r) => ({
      id: r.id,
      username: r.attempt.user.username,
      displayName: r.attempt.user.displayName,
      robloxId: Number(r.attempt.user.robloxId),
      profileUrl: r.attempt.user.profileUrl,
      policeGroupRank: r.attempt.user.policeGroupRank,
      discordUsername: r.attempt.user.discordUsername ?? null,
      mcqScore: r.mcqScore,
      essayScore: r.essayScore,
      score: r.score,
      maxScore: r.maxScore,
      status: r.status,
      passed: r.passed,
      periodName: r.attempt.period.name,
      submittedAt: r.submittedAt,
      discordMessageId: r.discordMessageId ?? null,
      answersJson: r.answersJson ?? [],
    }));

    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json({ ok: true, rows: [] });
    }
    throw e;
  }
}

// Hapus rekap nilai (?id=). Menghapus attempt ujian beserta jawabannya
// (cascade) sehingga casis dapat mengikuti ujian kembali pada periode tersebut.
// Pesan laporan Discord (webhook) yang terkait ikut terhapus.
export async function DELETE(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, message: "ID tidak valid." }, { status: 400 });
  }

  try {
    await ensureSchema();
    const result = await prisma.examResult.findUnique({
      where: { id },
      include: { attempt: { include: { user: { select: { username: true } } } } },
    });
    if (!result) {
      return NextResponse.json({ ok: false, message: "Rekap nilai tidak ditemukan." }, { status: 404 });
    }
    const targetUsername = result.attempt?.user?.username ?? result.attemptId;

    // Hapus laporan Discord terkait (best-effort; kegagalan tidak membatalkan hapus DB).
    let discordNote = "Tanpa laporan Discord tersimpan (rekap lama).";
    if (result.discordMessageId) {
      const del = await deleteDiscordExamReport(result.discordMessageId);
      console.log(
        `[rekap-hapus] id=${id} discordMessageId=${result.discordMessageId} ok=${del.ok} status=${del.status ?? "-"}${del.note ? ` note=${del.note}` : ""}`
      );
      if (del.ok) {
        discordNote = "Laporan Discord dihapus.";
      } else {
        discordNote = `Laporan Discord GAGAL dihapus${del.status ? ` (status ${del.status})` : ""}.`;
      }
    } else {
      console.log(
        `[rekap-hapus] id=${id} tanpa discordMessageId -> laporan Discord tidak bisa dihapus (rekap lama / kirim gagal)`
      );
    }

    await prisma.examAttempt.delete({ where: { id: result.attemptId } });
    await logAdminAction({
      action: "HAPUS_REKAP",
      target: targetUsername,
      detail: { score: result.score, status: result.status },
    });
    return NextResponse.json({
      ok: true,
      message: `Rekap nilai dihapus. ${discordNote} Casis dapat mengikuti ujian kembali.`,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ ok: false, message: "Rekap nilai tidak ditemukan." }, { status: 404 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json({ ok: false, message: "Database belum diinisialisasi." }, { status: 409 });
    }
    throw e;
  }
}
