import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/constants";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { discordUserId } = body;

    if (!discordUserId || typeof discordUserId !== "string") {
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

    // Cek apakah sudah absen
    const existing = await prisma.attendance.findUnique({
      where: {
        userId_periodId_tahap: {
          userId: user.id,
          periodId: activePeriod.id,
          tahap: "AKADEMIK",
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { ok: false, message: "Anda sudah melakukan absensi" },
        { status: 409 }
      );
    }

    // Simpan absensi
    const attendance = await prisma.attendance.create({
      data: {
        userId: user.id,
        periodId: activePeriod.id,
        tahap: "AKADEMIK",
        status: "HADIR",
        discordUserId: discordUserId.trim(),
      },
    });

    // Kirim request ke Discord Bot untuk assign role
    try {
      const botResponse = await fetch(`${CONFIG.discordBotApiUrl}/api/assign-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-secret": CONFIG.discordBotSecret,
        },
        body: JSON.stringify({
          userId: discordUserId.trim(),
          roleName: "Tahap Akademik",
        }),
      });

      const botResult = await botResponse.json();
      console.log("Bot role assignment result:", botResult);
    } catch (botError) {
      console.error("Failed to assign role via bot:", botError);
      // Tidak gagalkan absensi jika bot error, admin bisa assign manual
    }

    return NextResponse.json({
      ok: true,
      message: "Absensi berhasil! Role Tahap Akademik akan diberikan.",
      attendance: {
        id: attendance.id,
        status: attendance.status,
        createdAt: attendance.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Attendance submit error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal menyimpan absensi" },
      { status: 500 }
    );
  }
}
