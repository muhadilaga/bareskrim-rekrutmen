import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRobloxUserSummary } from "@/lib/roblox";
import { ensureSchema } from "@/lib/init-schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureSchema().catch(() => null);

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

    let targetUser: any = sessionUser;
    let applicationData: any = null;

    if (!targetUser && queryUsername) {
      const lowerKey = queryUsername.toLowerCase().trim();

      // A. Cek tabel User (database casis yang sudah ada)
      try {
        const dbUser = await prisma.user.findFirst({
          where: {
            OR: [
              { username: { equals: queryUsername, mode: "insensitive" } },
              { displayName: { equals: queryUsername, mode: "insensitive" } },
              { discordUsername: { equals: queryUsername, mode: "insensitive" } },
            ],
            deletedAt: null,
          },
        });
        if (dbUser) {
          targetUser = dbUser;
        }
      } catch (err: any) {
        console.warn("[attendance/check] User query warning:", err?.message);
      }

      // B. Cek tabel Application (casis pendaftar baru)
      try {
        applicationData = await prisma.application.findFirst({
          where: {
            OR: [
              { robloxUsernameKey: lowerKey },
              { robloxUsername: { equals: queryUsername, mode: "insensitive" } },
              { discordId: { equals: queryUsername, mode: "insensitive" } },
            ],
            deletedAt: null,
          },
          orderBy: { createdAt: "desc" },
        });
      } catch (err: any) {
        if (err?.code !== "P2021" && err?.code !== "P2022") {
          console.warn("[attendance/check] Application query warning:", err?.message);
        }
      }

      // Jika ada Application tapi belum punya User
      if (!targetUser && applicationData) {
        if (applicationData.userId) {
          try {
            targetUser = await prisma.user.findUnique({
              where: { id: applicationData.userId },
            });
          } catch {}
        }

        if (!targetUser) {
          targetUser = {
            id: applicationData.id,
            username: applicationData.robloxUsername,
            displayName: applicationData.fullName || applicationData.robloxUsername,
            avatarUrl: null,
            discordUsername: applicationData.discordId,
            policeGroupRank: "CASIS",
          };
        }
      }

      // Tidak ditemukan di User maupun Application
      if (!targetUser) {
        return NextResponse.json({
          ok: true,
          registered: false,
          attended: false,
          attendanceOpen: activePeriod.isAttendanceOpen,
          message: "Username belum terdaftar di whitelist calon siswa.",
          period: { id: activePeriod.id, name: activePeriod.name },
        });
      }
    }

    // Cek apakah sudah absen
    let attendance = null;
    const lookupIds: string[] = [];
    if (targetUser?.id) lookupIds.push(targetUser.id);
    if (applicationData?.userId && !lookupIds.includes(applicationData.userId)) {
      lookupIds.push(applicationData.userId);
    }

    try {
      attendance = await prisma.attendance.findFirst({
        where: {
          periodId: activePeriod.id,
          tahap: "AKADEMIK",
          OR: [
            ...lookupIds.map((uid) => ({ userId: uid })),
            ...(targetUser?.discordUsername
              ? [{ discordUserId: targetUser.discordUsername }]
              : []),
          ],
        },
        orderBy: { createdAt: "desc" },
      });
    } catch (err: any) {
      console.warn("[attendance/check] Attendance query warning:", err?.message);
    }

    let userAvatar = targetUser?.avatarUrl || null;
    let userRank = targetUser?.policeGroupRank || "CASIS";
    try {
      if (targetUser?.username) {
        const summary = await getRobloxUserSummary(targetUser.username);
        if (summary) {
          if (summary.avatarUrl) userAvatar = summary.avatarUrl;
          if (summary.policeGroupRank) userRank = summary.policeGroupRank;
          if (targetUser.id && targetUser.robloxId !== undefined) {
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
        }
      }
    } catch {
      // non-blocking
    }

    const res = NextResponse.json({
      ok: true,
      registered: true,
      attended: !!attendance,
      attendanceOpen: activePeriod.isAttendanceOpen,
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
      user: targetUser
        ? {
            id: targetUser.id,
            username: targetUser.username,
            displayName: targetUser.displayName,
            discordUsername: targetUser.discordUsername,
            avatarUrl: userAvatar || targetUser.avatarUrl || null,
            policeGroupRank: userRank || targetUser.policeGroupRank || "CASIS",
          }
        : null,
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
