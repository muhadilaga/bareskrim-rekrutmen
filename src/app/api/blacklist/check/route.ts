import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveSettings } from "@/lib/runtime-settings";
import {
  getCachedPusdikBlacklistMessages,
  findLatestPusdikBlacklistMatch,
} from "@/lib/blacklist-pusdik";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

const blacklistLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function GET(req: Request) {
  const ip = clientIp(req);
  const limit = blacklistLimiter.check(ip);
  if (!limit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `Terlalu banyak permintaan. Silakan tunggu ${limit.retryAfterSeconds} detik.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawUsername = searchParams.get("username") ?? "";
  const username = rawUsername.trim().replace(/^@+/, "");

  if (!username || username.length < 2 || username.length > 40) {
    return NextResponse.json(
      { ok: false, message: "Username harus antara 2 hingga 40 karakter." },
      { status: 400 }
    );
  }

  // Sanitasi karakter dasar username Roblox (alfanumerik dan underscore)
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json(
      { ok: false, message: "Username hanya boleh memuat huruf, angka, dan garis bawah (_)." },
      { status: 400 }
    );
  }

  try {
    // 1. Cek database internal (Blacklist & Verdict)
    const [dbBlacklist, dbVerdict] = await Promise.all([
      prisma.blacklistEntry.findFirst({
        where: { username: { equals: username, mode: "insensitive" } },
      }),
      prisma.verdictEntry.findFirst({
        where: { username: { equals: username, mode: "insensitive" } },
      }),
    ]);

    if (dbBlacklist) {
      return NextResponse.json({
        ok: true,
        found: true,
        source: "DATABASE",
        category: dbBlacklist.category,
        message: `Nama terdaftar dalam ${
          dbBlacklist.category === "PENDIDIKAN" ? "Blacklist Pendidikan" : "Blacklist Polri"
        }.`,
        entry: {
          username: dbBlacklist.username,
          reason: dbBlacklist.reason || "Terdata di daftar hitam internal",
          duration: "Permanen / Sesuai Ketetapan",
          postedAt: dbBlacklist.createdAt.toISOString(),
        },
      });
    }

    if (dbVerdict && dbVerdict.status === "TIDAK_LULUS") {
      return NextResponse.json({
        ok: true,
        found: true,
        source: "VERDICT",
        message: "Nama memiliki catatan TIDAK LULUS pada Sidang Pusdik/Polri.",
        entry: {
          username: dbVerdict.username,
          reason: dbVerdict.note || "Hasil sidang menyatakan tidak lulus",
          duration: "Tersidang Tidak Lulus",
          postedAt: dbVerdict.createdAt.toISOString(),
        },
      });
    }

    // 2. Cek channel Discord Blacklist Pusdik jika dikonfigurasi
    const settings = await getEffectiveSettings();
    const channelId = settings.discordBlacklistPendidikanChannelId?.trim();
    const guildId = settings.discordGuildId?.trim();

    if (channelId && guildId) {
      const fetched = await getCachedPusdikBlacklistMessages(channelId);
      if (fetched.ok && fetched.messages.length > 0) {
        const pusdikMatch = findLatestPusdikBlacklistMatch(
          fetched.messages,
          username,
          guildId,
          channelId
        );

        if (pusdikMatch) {
          return NextResponse.json({
            ok: true,
            found: true,
            source: "DISCORD_PUSDIK",
            message: "Nama ditemukan dalam arsip channel Blacklist Pendidikan Pusdik.",
            entry: {
              username: pusdikMatch.username,
              reason: pusdikMatch.reason || "Tercatat di channel blacklist Pusdik",
              duration: pusdikMatch.duration || "Sesuai catatan instruktur",
              rawSnippet: pusdikMatch.rawSnippet,
              postedAt: pusdikMatch.postedAt,
            },
          });
        }
      }
    }

    // Bebas dari catatan blacklist
    return NextResponse.json({
      ok: true,
      found: false,
      message: "Nama bebas dari catatan blacklist maupun sidang Pusdik Reserse Bareskrim Polri.",
      checkedUsername: username,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[blacklist/check] error:", error);
    return NextResponse.json(
      { ok: false, message: "Terjadi kesalahan saat memeriksa blacklist." },
      { status: 500 }
    );
  }
}
