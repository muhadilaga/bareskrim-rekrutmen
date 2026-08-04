import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// GET: Statistik ringkasan untuk dashboard admin.
// ?periodId= opsional; default periode aktif (atau semua bila tidak ada aktif).
export async function GET(req: Request) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== getAdminKey()) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const periodIdParam = searchParams.get("periodId")?.trim() || null;

    let periodId = periodIdParam;
    if (!periodId) {
      const active = await prisma.examPeriod.findFirst({ where: { isActive: true } });
      periodId = active?.id ?? null;
    }

    // Total casis yang terdaftar
    const totalUsers = await prisma.user.count();

    // Absen di periode target (termasuk orphan dengan discordUserId)
    const absenWhere = periodId ? { periodId } : {};
    const totalAttendance = await prisma.attendance.count({ where: absenWhere });

    // Ujian di periode target
    const attemptWhere = periodId ? { periodId } : {};
    const totalAttempts = await prisma.examAttempt.count({ where: attemptWhere });

    // Hasil lulus
    const resultWhere = periodId ? { attempt: { periodId } } : {};
    const totalResults = await prisma.examResult.count({ where: resultWhere });
    const passedResults = await prisma.examResult.count({
      where: { ...resultWhere, passed: true },
    });

    // Sedang mengerjakan = attempt tanpa submittedAt
    const inProgress = await prisma.examAttempt.count({
      where: { ...attemptWhere, submittedAt: null },
    });

    // Bank soal
    const mcqCount = await prisma.question.count({ where: { type: "MCQ", isActive: true } });
    const essayCount = await prisma.question.count({ where: { type: "ESSAY", isActive: true } });

    return NextResponse.json({
      ok: true,
      stats: {
        totalUsers,
        totalAttendance,
        totalAttempts,
        totalResults,
        passedResults,
        failedResults: totalResults - passedResults,
        inProgress,
        passRate: totalResults > 0 ? Math.round((passedResults / totalResults) * 100) : 0,
        mcqCount,
        essayCount,
        periodId: periodId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json({ ok: true, stats: null });
    }
    console.error("Admin stats error:", e);
    return NextResponse.json({ ok: false, message: "Gagal memuat statistik." }, { status: 500 });
  }
}
