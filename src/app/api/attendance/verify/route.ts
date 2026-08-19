import { NextResponse } from "next/server";
import { z } from "zod";
import { BlacklistCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureSchema } from "@/lib/init-schema";
import { CONFIG } from "@/lib/constants";
import { verifyLimiter, clientIp } from "@/lib/rate-limit";
import { assignDiscordRoleAndNickname } from "@/lib/discord-api";
import { evaluateMotivation } from "@/lib/motivation-evaluator";
import {
  resolveUserByUsername,
  getUserGroups,
  getAvatarHeadshot,
  type RobloxGroupRole,
} from "@/lib/roblox";

const VerifySchema = z.object({
  robloxUsername: z.string().trim().min(2).max(40),
  discordUsername: z.string().trim().min(2).max(40),
  motivation: z.string().trim().min(8).max(500),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!verifyLimiter.check(ip)) {
    return NextResponse.json(
      { ok: false, message: "Terlalu banyak percobaan verifikasi. Coba lagi dalam 1 menit." },
      { status: 429 }
    );
  }

  try {
    await ensureSchema();
    const body = await req.json();
    const parsed = VerifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: "Username tidak valid." },
        { status: 400 }
      );
    }

    const { robloxUsername, discordUsername, motivation } = parsed.data;

    // Cari periode aktif
    const activePeriod = await prisma.examPeriod.findFirst({
      where: { isActive: true },
    });

    if (!activePeriod) {
      return NextResponse.json(
        { ok: false, message: "Tidak ada periode aktif. Hubungi admin." },
        { status: 404 }
      );
    }

    // Cek apakah sudah absen. Jika motivasi sebelumnya gagal/review, izinkan apply ulang maksimal 2x.
    const existingRows = await prisma.$queryRaw<Array<{
      id: string;
      "roleEligible": boolean | null;
      "motivationAttemptCount": number | null;
    }>>(Prisma.sql`
      SELECT "id", "roleEligible", COALESCE("motivationAttemptCount", 1) AS "motivationAttemptCount"
      FROM "Attendance"
      WHERE "periodId" = ${activePeriod.id}
        AND "tahap" = 'AKADEMIK'
        AND "discordUserId" = ${discordUsername.trim()}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `);
    const existing = existingRows[0] ?? null;

    const canRetryMotivation = !!existing && !existing.roleEligible && (existing.motivationAttemptCount ?? 1) < 2;

    if (existing && !canRetryMotivation) {
      return NextResponse.json(
        { ok: false, message: existing.roleEligible ? "Anda sudah melakukan absensi untuk periode ini." : "Kesempatan perbaikan alasan/motivasi sudah habis (maksimal 2x)." },
        { status: 409 }
      );
    }

    // 1) Resolve Roblox username
    const userInfo = await resolveUserByUsername(robloxUsername);
    if (!userInfo) {
      return NextResponse.json(
        { ok: false, message: "User Roblox tidak ditemukan." },
        { status: 404 }
      );
    }

    // 2) Cek blacklist
    try {
      const blacklisted = await prisma.blacklistEntry.findFirst({
        where: {
          category: { in: [BlacklistCategory.POLRI, BlacklistCategory.PENDIDIKAN] },
          username: { equals: userInfo.name, mode: "insensitive" },
        },
      });
      if (blacklisted) {
        const label = blacklisted.category === "PENDIDIKAN" ? "blacklist pendidikan" : "blacklist Polri";
        return NextResponse.json(
          {
            ok: false,
            message: `Akses ditolak: nama Anda terdaftar dalam ${label}.`,
          },
          { status: 403 }
        );
      }
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021")) {
        throw e;
      }
    }

    // 2b) Cek putusan sidang: TIDAK_LULUS memblokir absensi.
    try {
      const verdict = await prisma.verdictEntry.findFirst({
        where: {
          username: { equals: userInfo.name, mode: "insensitive" },
          status: "TIDAK_LULUS",
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      });
      if (verdict) {
        return NextResponse.json(
          {
            ok: false,
            message: "Akses ditolak: nama Anda tercatat pada putusan sidang dengan status TIDAK LULUS.",
          },
          { status: 403 }
        );
      }
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021")) {
        throw e;
      }
    }

     // 3) Ambil keanggotaan grup + avatar
     const [groups, avatarUrl] = await Promise.all([
       getUserGroups(userInfo.id),
       getAvatarHeadshot(userInfo.id),
     ]);
     console.log(`[ATTENDANCE_VERIFY] userId=${userInfo.id}, avatarUrl=${avatarUrl}`);

    const isIn = (gid: number) => groups.some((g) => g.groupId === gid);

    // 4) Cek grup wajib
    if (!isIn(CONFIG.requiredGroupId)) {
      return NextResponse.json(
        {
          ok: false,
          message: `Anda belum terdaftar di grup wajib "${CONFIG.requiredGroupName}". Silakan join grup terlebih dahulu.`,
        },
        { status: 403 }
      );
    }

    // 5) Cek matra (TNI AD/AL)
    const bannedFound = CONFIG.bannedGroupIds.filter(isIn);
    if (bannedFound.length > 0) {
      const bannedNames = CONFIG.bannedGroupNames.length
        ? CONFIG.bannedGroupNames.join(", ")
        : "matra lain (AD/AL)";
      return NextResponse.json(
        {
          ok: false,
          message: `Akses ditolak: Anda terdaftar sebagai anggota matra lain (${bannedNames}).`,
        },
        { status: 403 }
      );
    }

    // 6) Cek pangkat di grup Kepolisian
    const policeRole: RobloxGroupRole | undefined = groups.find(
      (g) => g.groupId === CONFIG.policeGroupId
    );

    if (!policeRole || (policeRole.roleRank ?? 0) < CONFIG.minPoliceRank) {
      const detected = policeRole?.roleName ?? "tidak terdeteksi";
      return NextResponse.json(
        {
          ok: false,
          message: `Pangkat Anda di grup Kepolisian masih di bawah persyaratan minimal (${CONFIG.minPoliceRankName}). Pangkat terdeteksi: ${detected}. Silakan ajukan kenaikan pangkat terlebih dahulu.`,
        },
        { status: 403 }
      );
    }

    // 7) Semua check lolos → simpan absensi + assign role
    // Upsert user
    const user = await prisma.user.upsert({
      where: { robloxId: BigInt(userInfo.id) },
      update: {
        displayName: userInfo.displayName,
        discordUsername: discordUsername.trim(),
        avatarUrl,
        policeGroupRankId: BigInt(policeRole.roleId),
        policeGroupRank: policeRole.roleName,
        policeGroupRankNumber: policeRole.roleRank,
        matraBlocked: false,
      },
      create: {
        robloxId: BigInt(userInfo.id),
        username: userInfo.name,
        displayName: userInfo.displayName,
        discordUsername: discordUsername.trim(),
        avatarUrl,
        profileUrl: `https://www.roblox.com/users/${userInfo.id}/profile`,
        policeGroupRankId: BigInt(policeRole.roleId),
        policeGroupRank: policeRole.roleName,
        policeGroupRankNumber: policeRole.roleRank,
        requiredGroupId: BigInt(CONFIG.requiredGroupId),
        bannedGroupIds: [],
        matraBlocked: false,
      },
    });

    // Simpan absensi
    const motivationResult = evaluateMotivation(motivation);

    const attendance = existing && canRetryMotivation
      ? await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            userId: user.id,
            status: "HADIR",
            discordUserId: discordUsername.trim(),
          },
        })
      : await prisma.attendance.create({
          data: {
            userId: user.id,
            periodId: activePeriod.id,
            tahap: "AKADEMIK",
            status: "HADIR",
            discordUserId: discordUsername.trim(),
          },
        });

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Attendance"
      SET
        "motivation" = ${motivation.trim()},
        "motivationStatus" = ${motivationResult.status},
        "motivationReason" = ${motivationResult.reason},
        "motivationAttemptCount" = ${canRetryMotivation ? (existing?.motivationAttemptCount ?? 1) + 1 : 1},
        "roleEligible" = ${motivationResult.eligible}
      WHERE "id" = ${attendance.id}
    `);

    // Assign role via Discord hanya bila motivasi lolos.
    let roleAssigned = false;
    let roleError: string | null = null;

    try {
      if (!motivationResult.eligible) {
        roleError = motivationResult.reason;
      } else if (CONFIG.discordBotToken && CONFIG.discordGuildId) {
        const result = await assignDiscordRoleAndNickname(
          discordUsername.trim(),
          "Tahap Akademik",
          `[CASIS] ${userInfo.name}`
        );
        roleAssigned = result.ok;
        roleError = result.ok
          ? result.nicknameOk
            ? null
            : `Role berhasil, tapi nickname gagal diubah: ${result.nicknameMessage}`
          : result.message;
      }
    } catch (e) {
      console.error("Failed to assign role:", e);
    }

    const successMessage = roleAssigned
      ? roleError
        ? `Absensi berhasil! Role Tahap Akademik sudah diberikan, tetapi nickname Discord belum berubah otomatis: ${roleError}`
        : "Absensi berhasil! Role Tahap Akademik sudah diberikan dan nickname Discord sudah diperbarui. Silakan tunggu jadwal ujian dari instruktur."
      : roleError
        ? `Absensi berhasil, tapi role belum diberikan: ${roleError}. Hubungi admin bila ingin peninjauan manual.`
        : "Absensi berhasil! Silakan tunggu jadwal ujian dari instruktur.";

    return NextResponse.json({
      ok: true,
      message: successMessage,
      roleAssigned,
      roleError,
      motivationStatus: motivationResult.status,
      motivationReason: motivationResult.reason,
      motivationAttemptCount: canRetryMotivation ? (existing?.motivationAttemptCount ?? 1) + 1 : 1,
      retried: canRetryMotivation,
      user: {
        username: user.username,
        displayName: user.displayName,
        robloxId: Number(user.robloxId),
        avatarUrl: user.avatarUrl,
        policeGroupRank: user.policeGroupRank,
      },
      attendance: {
        id: attendance.id,
        status: attendance.status,
        createdAt: attendance.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Attendance verify error:", error);
    const raw = error instanceof Error ? error.message : String(error);
    let message = "Terjadi kesalahan server. Coba lagi.";

    if (raw.includes("Roblox API unreachable") || raw.includes("fetch")) {
      message = "Gagal menghubungi API Roblox. Coba lagi nanti.";
    } else if (raw.includes("429") || raw.includes("rate")) {
      message = "API Roblox sedang membatasi permintaan. Coba lagi nanti.";
    }

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
