import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";
import { ensureSchema } from "@/lib/init-schema";

// GET: List semua casis + status absensi + status ujian
export async function GET(req: Request) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== getAdminKey()) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    await ensureSchema();

    const { searchParams } = new URL(req.url);
    const periodId = searchParams.get("periodId");

    // Tanpa periodId -> tampilkan SEMUA user (termasuk yang belum absen).
    // Dengan periodId -> hanya user yang punya data di periode tersebut.
    const users = await prisma.user.findMany({
      where: periodId
        ? {
            OR: [
              { attendances: { some: { periodId } } },
              { attempts: { some: { periodId } } },
            ],
          }
        : {},
      include: {
        attendances: {
          where: periodId ? { periodId } : {},
          select: { id: true, tahap: true, status: true, discordUserId: true, createdAt: true },
        },
        attempts: {
          where: periodId ? { periodId } : {},
          select: { id: true, startedAt: true, submittedAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    } as any);

    const attendanceIds = (users as any[])
      .map((u) => u.attendances?.[0]?.id)
      .filter(Boolean);
    const attendanceExtraRows = attendanceIds.length
      ? await prisma.$queryRaw<Array<{
          id: string;
          motivation: string | null;
          motivationStatus: string | null;
          motivationReason: string | null;
          motivationAttemptCount: number | null;
          roleEligible: boolean | null;
        }>>(Prisma.sql`
          SELECT "id", "motivation", "motivationStatus", "motivationReason",
                 COALESCE("motivationAttemptCount", 1) AS "motivationAttemptCount",
                 COALESCE("roleEligible", false) AS "roleEligible"
          FROM "Attendance"
          WHERE "id" IN (${Prisma.join(attendanceIds)})
        `)
      : [];
    const attendanceExtras = new Map(attendanceExtraRows.map((row) => [row.id, row]));

    const result = (users as any[]).map((u) => {
      const attendance = u.attendances[0] ?? null;
      const attendanceExtra = attendance ? (attendanceExtras.get(attendance.id) as any) : null;
      const attempt = u.attempts[0] ?? null;

      let status: string;
      if (!attendance) {
        status = "belum_absen";
      } else if (!attempt) {
        status = "sudah_absen";
      } else if (!attempt.submittedAt) {
        status = "sedang_mengerjakan";
      } else {
        status = "selesai";
      }

      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        robloxId: Number(u.robloxId),
        avatarUrl: u.avatarUrl,
        discordUsername: u.discordUsername,
        policeGroupRank: u.policeGroupRank,
        attendance: attendance
          ? { id: attendance.id, discordUserId: attendance.discordUserId, createdAt: attendance.createdAt.toISOString(), motivation: attendanceExtra?.motivation ?? null, motivationStatus: attendanceExtra?.motivationStatus ?? null, motivationReason: attendanceExtra?.motivationReason ?? null, motivationAttemptCount: attendanceExtra?.motivationAttemptCount ?? 1, roleEligible: attendanceExtra?.roleEligible ?? false }
          : null,
        attempt: attempt
          ? { id: attempt.id, startedAt: attempt.startedAt.toISOString(), submittedAt: attempt.submittedAt?.toISOString() ?? null }
          : null,
        status,
      };
    });

    return NextResponse.json({ ok: true, users: result });
  } catch (error) {
    console.error("Admin list users error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal memuat data casis" },
      { status: 500 }
    );
  }
}

// DELETE: Hapus data casis (user + attendance + attempt + result)
export async function DELETE(req: Request) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== getAdminKey()) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const periodId = searchParams.get("periodId");
    const all = searchParams.get("all");

    if (all === "1") {
      // Hapus SEMUA data casis: absensi (termasuk orphan) + user.
      // Attempt, jawaban, dan hasil ikut terhapus lewat cascade.
      const delAttendance = await prisma.attendance.deleteMany({});
      const delUsers = await prisma.user.deleteMany({});
      await logAdminAction({
        action: "HAPUS_SEMUA_CASIS",
        target: "Semua casis",
        detail: { deletedUsers: delUsers.count, deletedAttendance: delAttendance.count },
      });
      return NextResponse.json({
        ok: true,
        message: `Semua data casis dihapus (${delUsers.count} user, ${delAttendance.count} absensi).`,
      });
    }

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "userId wajib diisi" },
        { status: 400 }
      );
    }

    console.log(`[DELETE USER] Starting deletion for userId: ${userId}${periodId ? ` periodId: ${periodId}` : ""}`);

    // 0. Ambil user dulu untuk tahu discordUsername (untuk hapus absensi orphan)
    const targetUser = await prisma.user
      .findUnique({ where: { id: userId }, select: { id: true, username: true, discordUsername: true } })
      .catch(() => null);

    // 1. Hapus attendance (untuk periode tertentu jika diberikan, selain itu semua)
    const attendanceWhere: Record<string, unknown> = { userId };
    if (periodId) attendanceWhere.periodId = periodId;
    const delAttendance = await prisma.attendance.deleteMany({ where: attendanceWhere });
    console.log(`[DELETE USER] Deleted ${delAttendance.count} attendance records`);

    // 1b. Hapus absensi orphan (userId null) yang cocok dengan discord username user ini
    if (targetUser?.discordUsername) {
      const orphanWhere: Record<string, unknown> = { userId: null, discordUserId: targetUser.discordUsername };
      if (periodId) orphanWhere.periodId = periodId;
      const delOrphan = await prisma.attendance.deleteMany({ where: orphanWhere });
      console.log(`[DELETE USER] Deleted ${delOrphan.count} orphan attendance records`);
    }

    // 2. Cari & hapus attempt + answers + results
    const attemptWhere: Record<string, unknown> = { userId };
    if (periodId) attemptWhere.periodId = periodId;
    const attempts = await prisma.examAttempt.findMany({
      where: attemptWhere,
      select: { id: true },
    });
    const attemptIds = attempts.map((a) => a.id);
    console.log(`[DELETE USER] Found ${attemptIds.length} attempts`);

    if (attemptIds.length > 0) {
      const delAnswers = await prisma.examAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      console.log(`[DELETE USER] Deleted ${delAnswers.count} answers`);
      const delResults = await prisma.examResult.deleteMany({ where: { attemptId: { in: attemptIds } } });
      console.log(`[DELETE USER] Deleted ${delResults.count} results`);
    }

    const delAttempts = await prisma.examAttempt.deleteMany({ where: attemptWhere });
    console.log(`[DELETE USER] Deleted ${delAttempts.count} attempts`);

    // 3. Hapus user HANYA jika tanpa periodId (hapus data periode saja jika ada periodId)
    let deletedUser = null;
    if (!periodId) {
      deletedUser = await prisma.user.delete({ where: { id: userId } }).catch((e) => {
        console.error("[DELETE USER] Failed to delete user:", e);
        return null;
      });
    }

    console.log(`[DELETE USER] Completed. User deleted: ${!!deletedUser}`);

    await logAdminAction({
      action: periodId ? "HAPUS_DATA_PERIODE" : "HAPUS_CASIS",
      target: targetUser?.username ?? userId,
      detail: { periodId: periodId ?? null },
    });

    return NextResponse.json({
      ok: true,
      message: periodId
        ? `Berhasil hapus data "${targetUser?.username ?? userId}" pada periode ini.`
        : `Berhasil hapus user ${deletedUser?.username ?? userId} dan semua data terkait.`,
    });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return NextResponse.json(
      { ok: false, message: `Gagal menghapus: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
