import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, BlacklistCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/constants";
import {
  resolveUserByUsername,
  getUserGroups,
  getAvatarHeadshot,
  profileUrl,
  type RobloxGroupRole,
} from "@/lib/roblox";
import { createSessionCookie } from "@/lib/auth";
import { ensureSchema } from "@/lib/init-schema";
import { clientIp, verifyLimiter } from "@/lib/rate-limit";

const VerifySchema = z.object({
  username: z.string().trim().min(2).max(40),
  discordUsername: z.string().trim().min(2).max(40),
});

function rankBlockedResponse(rankName: string | null) {
  const detected = rankName ? ` Pangkat terdeteksi: ${rankName}.` : "";
  return NextResponse.json(
    {
      success: false,
      code: "RANK_BLOCKED",
      message:
        `Akses ditolak: pangkat Anda di grup "${CONFIG.policeGroupName}" masih di bawah persyaratan minimal ` +
        `(${CONFIG.minPoliceRankName}) untuk mengikuti ujian rekrutmen.${detected} ` +
        "Silakan ajukan kenaikan pangkat terlebih dahulu, lalu coba lagi.",
    },
    { status: 403 }
  );
}

export async function POST(req: Request) {
  const limited = verifyLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL",
        message: `Terlalu banyak percobaan verifikasi. Coba lagi dalam ${limited.retryAfterSeconds} detik.`,
      },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, code: "USER_NOT_FOUND", message: "Username tidak valid." },
      { status: 400 }
    );
  }

  const username = parsed.data.username;

  try {
    // 1) Cache verifikasi: user yang baru diverifikasi tidak perlu memanggil API
    //    Roblox lagi (mencegah 429 rate-limit saat banyak login/akses berulang).
    await ensureSchema();
    const cached = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    });
    const CACHE_TTL_MS = 15 * 60_000;
    if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
      // Blokir pangkat dari snapshot (tanpa memanggil API Roblox lagi).
      if (
        cached.policeGroupRankNumber != null &&
        cached.policeGroupRankNumber < CONFIG.minPoliceRank
      ) {
        return rankBlockedResponse(cached.policeGroupRank);
      }
      if (!cached.matraBlocked && cached.policeGroupRankNumber != null) {
        await prisma.user.update({
          where: { id: cached.id },
          data: { discordUsername: parsed.data.discordUsername },
        });
        await createSessionCookie(cached.id, Number(cached.robloxId));
        return NextResponse.json({
          success: true,
          user: {
            robloxId: Number(cached.robloxId),
            username: cached.username,
            displayName: cached.displayName,
            discordUsername: parsed.data.discordUsername,
            avatarUrl: cached.avatarUrl,
            policeGroupRank: cached.policeGroupRank,
          },
        });
      }
      // rankNumber null (user lama) / matraBlocked -> lanjut verifikasi penuh.
    }

    // 2) Resolve username -> Roblox ID + info
    const userInfo = await resolveUserByUsername(username);
    if (!userInfo) {
      return NextResponse.json(
        { success: false, code: "USER_NOT_FOUND", message: "User Roblox tidak ditemukan." },
        { status: 404 }
      );
    }

    // 3) Auto-block blacklist (Polri & Pendidikan): tolak sebelum menyentuh
    //     API Roblox lebih jauh. Bila tabel belum dibuat, lewati (tidak ada data).
    try {
      const blacklisted = await prisma.blacklistEntry.findFirst({
        where: {
          category: { in: [BlacklistCategory.POLRI, BlacklistCategory.PENDIDIKAN] },
          username: { equals: userInfo.name, mode: "insensitive" },
        },
      });
      if (blacklisted) {
        return NextResponse.json(
          {
            success: false,
            code: "BLACKLISTED",
            message:
              "Akses ditolak: nama Anda terdaftar dalam daftar hitam (blacklist). " +
              "Hubungi instruktur untuk keterangan lebih lanjut.",
          },
          { status: 403 }
        );
      }
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021")) {
        throw e;
      }
    }

    // 4) Ambil keanggotaan grup + avatar
    const [groups, avatarUrl] = await Promise.all([
      getUserGroups(userInfo.id),
      getAvatarHeadshot(userInfo.id),
    ]);

    const isIn = (gid: number) => groups.some((g) => g.groupId === gid);

    // 5) Cek grup wajib [RI] Republic Indonesia
    if (!isIn(CONFIG.requiredGroupId)) {
      const detected = groups
        .slice(0, 30)
        .map((g) => `${g.groupName} (${g.groupId})`)
        .join(", ");
      return NextResponse.json(
        {
          success: false,
          code: "NOT_IN_REQUIRED_GROUP",
          message:
            `Anda belum terdaftar di grup wajib "${CONFIG.requiredGroupName}" (ID: ${CONFIG.requiredGroupId}). ` +
            `Total ${groups.length} grup terdeteksi oleh Roblox: ${detected || "tidak ada / kosong"}. ` +
            `Jika grup Anda ada di daftar itu, periksa REQUIRED_GROUP_ID di Netlify.`,
        },
        { status: 403 }
      );
    }

    // 6) Cross-Group / Matra Check: tolak bila anggota grup matra lain (AD/AL)
    const bannedFound = CONFIG.bannedGroupIds.filter(isIn);
    if (bannedFound.length > 0) {
      const bannedNames = CONFIG.bannedGroupNames.length
        ? CONFIG.bannedGroupNames.join(", ")
        : "matra lain (AD/AL)";
      return NextResponse.json(
        {
          success: false,
          code: "MATRA_BLOCKED",
          message: `Mohon maaf, Anda tidak dapat mengakses soal ujian rekrutmen Bareskrim Polri karena terdaftar sebagai anggota matra lain (${bannedNames}).`,
        },
        { status: 403 }
      );
    }

    // 7) Pangkat di grup Kepolisian
    const policeRole: RobloxGroupRole | undefined = groups.find(
      (g) => g.groupId === CONFIG.policeGroupId
    );

    // 8) Upsert user + simpan snapshot keanggotaan
    await ensureSchema();
    const user = await prisma.user.upsert({
      where: { robloxId: BigInt(userInfo.id) },
      update: {
        displayName: userInfo.displayName,
        discordUsername: parsed.data.discordUsername,
        avatarUrl,
        profileUrl: profileUrl(userInfo.id),
        policeGroupRankId: policeRole ? BigInt(policeRole.roleId) : null,
        policeGroupRank: policeRole?.roleName ?? null,
        policeGroupRankNumber: policeRole?.roleRank ?? null,
        requiredGroupId: BigInt(CONFIG.requiredGroupId),
        bannedGroupIds: bannedFound,
        matraBlocked: bannedFound.length > 0,
      },
      create: {
        robloxId: BigInt(userInfo.id),
        username: userInfo.name,
        displayName: userInfo.displayName,
        discordUsername: parsed.data.discordUsername,
        avatarUrl,
        profileUrl: profileUrl(userInfo.id),
        policeGroupRankId: policeRole ? BigInt(policeRole.roleId) : null,
        policeGroupRank: policeRole?.roleName ?? null,
        policeGroupRankNumber: policeRole?.roleRank ?? null,
        requiredGroupId: BigInt(CONFIG.requiredGroupId),
        bannedGroupIds: bannedFound,
        matraBlocked: bannedFound.length > 0,
      },
    });

    // 9) Blokir pangkat: di bawah minimal (Bhayangkara Kepala) => tidak bisa
    //     mengikuti ujian. User tetap di-upsert agar blokir dilayani dari cache.
    if (!policeRole || (policeRole.roleRank ?? 0) < CONFIG.minPoliceRank) {
      return rankBlockedResponse(policeRole?.roleName ?? null);
    }

    await createSessionCookie(user.id, Number(user.robloxId));

    return NextResponse.json({
      success: true,
      user: {
        robloxId: Number(user.robloxId),
        username: user.username,
        displayName: user.displayName,
        discordUsername: user.discordUsername,
        avatarUrl: user.avatarUrl,
        policeGroupRank: user.policeGroupRank,
      },
    });
  } catch (e) {
    console.error("verify error", e);
    const raw = e instanceof Error ? e.message : String(e);
    const sanitized = sanitizeError(raw);
    let hint = "";
    const m = raw;
    if (m.includes("JWT_SECRET")) {
      hint = " JWT_SECRET belum diatur/terbaca di environment Vercel (min 32 karakter).";
    } else if (m.includes("DATABASE_URL")) {
      hint = " DATABASE_URL belum diisi.";
    } else if (m.includes("P2021")) {
      hint = " Tabel database belum dibuat (auto-init gagal).";
    } else if (m.includes("P1010") || m.includes("28P01") || /password|authentication/i.test(m)) {
      hint = " Password database ditolak oleh Supabase.";
    } else if (
      m.includes("P1001") ||
      m.includes("P1000") ||
      m.includes("P1002") ||
      m.includes("P1017") ||
      m.includes("ECONNREFUSED") ||
      m.includes("ETIMEDOUT") ||
      m.includes("getaddrinfo")
    ) {
      hint = " Tidak bisa terhubung ke database Supabase.";
    } else if (m.includes("P1012")) {
      hint = " Kesalahan konfigurasi database.";
    } else if (m.includes("Roblox API unreachable")) {
      hint = " Gagal menjangkau API Roblox dari server (kemungkinan IP Vercel diblokir/di-rate-limit oleh Roblox).";
    } else if (m.includes("429") || m.includes("Roblox API error")) {
      hint = " API Roblox sedang membatasi permintaan. Coba lagi nanti.";
    } else if (m.includes("P2002")) {
      hint = " Data duplikat di database.";
    } else {
      hint = " Detail: " + sanitized;
    }
    // Detail teknis HANYA dicatat di log server, tidak dikirim ke client.
    console.error("verify detail", sanitized);
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL",
        build: "v5",
        message: `Terjadi kesalahan server. Coba lagi.${hint}`,
      },
      { status: 500 }
    );
  }
}

function sanitizeError(msg: string): string {
  return msg
    .replace(/postgres(ql)?:\/\/[^@\s]+@/g, "postgresql://***:***@")
    .slice(0, 500);
}
