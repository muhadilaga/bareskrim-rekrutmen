import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/constants";

// POST: Submit absensi tanpa login (hanya Discord username)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { discordUsername } = body;

    if (!discordUsername || typeof discordUsername !== "string") {
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

    const discord = discordUsername.trim();

    // Cek apakah sudah absen (berdasarkan discordUserId)
    const existing = await prisma.attendance.findFirst({
      where: {
        periodId: activePeriod.id,
        tahap: "AKADEMIK",
        discordUserId: discord,
      },
    });

    if (existing) {
      return NextResponse.json(
        { ok: false, message: "Anda sudah melakukan absensi" },
        { status: 409 }
      );
    }

    // Simpan absensi dengan userId: null (akan diupdate saat login Roblox)
    const attendance = await prisma.attendance.create({
      data: {
        userId: null,
        periodId: activePeriod.id,
        tahap: "AKADEMIK",
        status: "HADIR",
        discordUserId: discord,
      },
    });

    // Kirim request ke Discord Bot untuk assign role
    let roleAssigned = false;
    let roleError: string | null = null;
    try {
      const botResponse = await fetch(`${CONFIG.discordBotApiUrl}/api/assign-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-secret": CONFIG.discordBotSecret,
        },
        body: JSON.stringify({
          userId: discord,
          roleName: "Tahap Akademik",
        }),
      });

      const botResult = await botResponse.json();
      console.log("Bot role assignment result:", JSON.stringify(botResult));

      if (botResult.ok) {
        roleAssigned = true;
      } else {
        roleError = botResult.message || "Gagal assign role";
      }
    } catch (botError) {
      console.error("Failed to assign role via bot:", botError);
      roleError = "Bot tidak bisa dijangkau. Pastikan bot berjalan di port 3001.";
    }

    const successMessage = roleAssigned
      ? "Absensi berhasil! Role Tahap Akademik sudah diberikan."
      : roleError
        ? `Absensi berhasil, tapi role gagal diberikan: ${roleError}. Hubungi admin untuk assign manual.`
        : "Absensi berhasil! Role Tahap Akademik akan diberikan oleh admin.";

    return NextResponse.json({
      ok: true,
      message: successMessage,
      roleAssigned,
      roleError,
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
