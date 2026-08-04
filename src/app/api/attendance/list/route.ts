import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== getAdminKey()) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const periodId = searchParams.get("periodId");

    // Cari periode
    const where: Record<string, unknown> = {};
    if (periodId) {
      where.periodId = periodId;
    } else {
      const activePeriod = await prisma.examPeriod.findFirst({
        where: { isActive: true },
      });
      if (activePeriod) {
        where.periodId = activePeriod.id;
      }
    }

    // Ambil semua absensi
    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            discordUsername: true,
          },
        },
        period: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Hitung statistik
    const stats = {
      total: attendances.length,
      hadir: attendances.filter((a) => a.status === "HADIR").length,
      tidakHadir: attendances.filter((a) => a.status === "TIDAK_HADIR").length,
      linked: attendances.filter((a) => a.userId !== null).length,
      unlinked: attendances.filter((a) => a.userId === null).length,
    };

    return NextResponse.json({
      ok: true,
      attendances: attendances.map((a) => ({
        id: a.id,
        user: a.user ?? null,
        period: a.period,
        tahap: a.tahap,
        status: a.status,
        discordUserId: a.discordUserId,
        linked: a.userId !== null,
        createdAt: a.createdAt.toISOString(),
      })),
      stats,
    });
  } catch (error) {
    console.error("Attendance list error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal memuat data absensi" },
      { status: 500 }
    );
  }
}
