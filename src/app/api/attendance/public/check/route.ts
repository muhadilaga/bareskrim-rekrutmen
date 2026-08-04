import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Cek status absensi berdasarkan Discord username
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const discordUsername = searchParams.get("discord");

    if (!discordUsername) {
      return NextResponse.json(
        { ok: false, message: "Username Discord wajib diisi" },
        { status: 400 }
      );
    }

    // Cari periode aktif
    const activePeriod = await prisma.examPeriod.findFirst({
      where: { isActive: true },
    });

    if (!activePeriod) {
      return NextResponse.json(
        { ok: false, message: "Tidak ada periode aktif" },
        { status: 404 }
      );
    }

    // Cek apakah sudah absen (berdasarkan discordUserId yang disimpan)
    const attendance = await prisma.attendance.findFirst({
      where: {
        periodId: activePeriod.id,
        tahap: "AKADEMIK",
        discordUserId: discordUsername.trim(),
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
