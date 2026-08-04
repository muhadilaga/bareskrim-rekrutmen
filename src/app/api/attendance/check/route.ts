import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    // Cari periode aktif
    const activePeriod = await prisma.examPeriod.findFirst({
      where: { isActive: true },
    });

    if (!activePeriod) {
      return NextResponse.json({ ok: false, message: "Tidak ada periode aktif" }, { status: 404 });
    }

    // Cek apakah sudah absen
    const attendance = await prisma.attendance.findUnique({
      where: {
        userId_periodId_tahap: {
          userId: user.id,
          periodId: activePeriod.id,
          tahap: "AKADEMIK",
        },
      },
    });

    return NextResponse.json({
      ok: true,
      attended: !!attendance,
      attendance: attendance
        ? {
            status: attendance.status,
            createdAt: attendance.createdAt.toISOString(),
          }
        : null,
      period: {
        id: activePeriod.id,
        name: activePeriod.name,
      },
    });
  } catch (error) {
    console.error("Attendance check error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal memeriksa absensi" },
      { status: 500 }
    );
  }
}
