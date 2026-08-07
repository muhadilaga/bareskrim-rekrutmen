import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/constants";
import { logStudentAction } from "@/lib/audit";
import { clientIp, createRateLimiter, userSubmitLimiter } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/auth";
import { assignDiscordRole } from "@/lib/discord-api";

const ipLimiter = createRateLimiter({ windowMs: 60_000, max: 3 });

export async function POST(req: Request) {
  const limited = ipLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, message: "Terlalu banyak percobaan. Coba lagi nanti." },
      { status: 429 }
    );
  }

  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const userLimited = userSubmitLimiter.check(user.id);
    if (!userLimited.ok) {
      return NextResponse.json(
        { ok: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${userLimited.retryAfterSeconds} detik.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { discordUserId } = body;

    if (!discordUserId || typeof discordUserId !== "string") {
      return NextResponse.json(
        { ok: false, message: "Username Discord wajib diisi" },
        { status: 400 }
      );
    }

    const activePeriod = await prisma.examPeriod.findFirst({
      where: { isActive: true },
    });

    if (!activePeriod) {
      return NextResponse.json(
        { ok: false, message: "Tidak ada periode aktif" },
        { status: 404 }
      );
    }

    if (!activePeriod.isAttendanceOpen) {
      return NextResponse.json(
        { ok: false, message: "Absen belum dibuka" },
        { status: 403 }
      );
    }

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

    const attendance = await prisma.attendance.create({
      data: {
        userId: user.id,
        periodId: activePeriod.id,
        tahap: "AKADEMIK",
        status: "HADIR",
        discordUserId: discordUserId.trim(),
      },
    });

    let roleAssigned = false;
    let roleError: string | null = null;

    if (CONFIG.discordBotToken && CONFIG.discordGuildId) {
      const result = await assignDiscordRole(discordUserId.trim(), "Tahap Akademik");
      roleAssigned = result.ok;
      roleError = result.ok ? null : result.message;
    } else {
      roleError = "DISCORD_BOT_TOKEN / DISCORD_GUILD_ID belum dikonfigurasi.";
    }

    await logStudentAction({
      userId: user.id,
      action: "ATTENDANCE",
      periodId: activePeriod.id,
      detail: { discordUserId: discordUserId.trim() },
    });

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
