import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRobloxUserSummary } from "@/lib/roblox";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sessionUser = await getSessionUser(req);
    const { searchParams } = new URL(req.url);
    const queryUsername =
      searchParams.get("username")?.trim() ||
      searchParams.get("robloxUsername")?.trim();

    if (!sessionUser && !queryUsername) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    // Cari periode aktif
    const activePeriod = await prisma.examPeriod.findFirst({
      where: { isActive: true, deletedAt: null },
    });

    if (!activePeriod) {
      return NextResponse.json({ ok: false, message: "Tidak ada periode aktif" }, { status: 404 });
    }

    let targetUser = sessionUser;
    if (!targetUser && queryUsername) {
      const dbUser = await prisma.user.findFirst({
        where: {
          username: { equals: queryUsername, mode: "insensitive" },
          deletedAt: null,
        },
      });
      if (dbUser) {
        targetUser = dbUser;
      } else {
        // Cek apakah ada di Application whitelist
        const app = await prisma.application.findFirst({
          where: {
            robloxUsername: { equals: queryUsername, mode: "insensitive" },
            deletedAt: null,
          },
        });
        if (!app) {
          return NextResponse.json({
            ok: true,
            registered: false,
            attended: false,
            message: "Username belum terdaftar di whitelist calon siswa.",
            period: { id: activePeriod.id, name: activePeriod.name },
          });
        }
      }
    }

    // Cek apakah absen sudah dibuka
    if (!activePeriod.isAttendanceOpen) {
      return NextResponse.json({
        ok: true,
        registered: true,
        attended: false,
        attendanceOpen: false,
        attendance: null,
        period: {
          id: activePeriod.id,
          name: activePeriod.name,
        },
      });
    }

    if (!targetUser) {
      return NextResponse.json({
        ok: true,
        registered: true,
        attended: false,
        attendanceOpen: true,
        attendance: null,
        period: {
          id: activePeriod.id,
          name: activePeriod.name,
        },
      });
    }

    // Cek apakah sudah absen
    const attendance = await prisma.attendance.findUnique({
      where: {
        userId_periodId_tahap: {
          userId: targetUser.id,
          periodId: activePeriod.id,
          tahap: "AKADEMIK",
        },
      },
    });

    let userAvatar = targetUser.avatarUrl;
    let userRank = targetUser.policeGroupRank;
    try {
      const summary = await getRobloxUserSummary(targetUser.username);
      if (summary) {
        if (summary.avatarUrl) userAvatar = summary.avatarUrl;
        if (summary.policeGroupRank) userRank = summary.policeGroupRank;
        await prisma.user
          .update({
            where: { id: targetUser.id },
            data: {
              ...(userAvatar ? { avatarUrl: userAvatar } : {}),
              ...(userRank ? { policeGroupRank: userRank } : {}),
              ...(summary.displayName ? { displayName: summary.displayName } : {}),
              ...(targetUser.robloxId ? {} : { robloxId: BigInt(summary.id) }),
            },
          })
          .catch(() => null);
      }
    } catch {
      // non-blocking
    }

    const res = NextResponse.json({
      ok: true,
      registered: true,
      attended: !!attendance,
      attendanceOpen: true,
      attendance: attendance
        ? {
            id: attendance.id,
            status: attendance.status,
            motivation: attendance.motivation,
            motivationStatus: attendance.motivationStatus,
            motivationReason: attendance.motivationReason,
            motivationAttemptCount: attendance.motivationAttemptCount,
            roleEligible: attendance.roleEligible,
            createdAt: attendance.createdAt.toISOString(),
          }
        : null,
      period: {
        id: activePeriod.id,
        name: activePeriod.name,
        isExamOpen: activePeriod.isExamOpen,
        examStartTime: activePeriod.examStartTime?.toISOString() ?? null,
        examEndTime: activePeriod.examEndTime?.toISOString() ?? null,
      },
      user: {
        id: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName,
        discordUsername: targetUser.discordUsername,
        avatarUrl: userAvatar || targetUser.avatarUrl || null,
        policeGroupRank: userRank || targetUser.policeGroupRank || "CASIS",
      },
    });

    return res;
  } catch (error) {
    console.error("Attendance check error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal memeriksa absensi" },
      { status: 500 }
    );
  }
}
