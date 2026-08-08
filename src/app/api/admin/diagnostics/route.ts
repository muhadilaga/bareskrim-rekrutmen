import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminKey } from "@/lib/constants";
import { getEffectiveSettings } from "@/lib/runtime-settings";

const DISCORD_API = "https://discord.com/api/v10";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const settings = await getEffectiveSettings();
  const warnings: string[] = [];
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.database = { ok: true, detail: "Koneksi database OK." };
  } catch (e) {
    checks.database = { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }

  const token = settings.discordBotToken?.trim();
  const guildId = settings.discordGuildId?.trim();
  const channelId = settings.discordChannelId?.trim();
  const tahapAkademikRoleId = settings.tahapAkademikRoleId?.trim();
  const apiUrl = settings.discordBotApiUrl?.trim();

  checks.discordToken = {
    ok: !!token,
    detail: token ? "DISCORD_BOT_TOKEN tersedia." : "DISCORD_BOT_TOKEN kosong.",
  };
  checks.discordGuild = {
    ok: !!guildId,
    detail: guildId ? `DISCORD_GUILD_ID: ${guildId}` : "DISCORD_GUILD_ID kosong.",
  };
  checks.discordChannel = {
    ok: !!channelId,
    detail: channelId ? `DISCORD_CHANNEL_ID: ${channelId}` : "DISCORD_CHANNEL_ID kosong.",
  };
  checks.tahapAkademikRole = {
    ok: !!tahapAkademikRoleId,
    detail: tahapAkademikRoleId ? `TAHAP_AKADEMIK_ROLE_ID: ${tahapAkademikRoleId}` : "TAHAP_AKADEMIK_ROLE_ID kosong.",
  };

  if (apiUrl) {
    const localhostLike = /localhost|127\.0\.0\.1/i.test(apiUrl);
    checks.discordBotApiUrl = {
      ok: !localhostLike,
      detail: localhostLike ? `URL bot masih lokal: ${apiUrl}` : `URL bot: ${apiUrl}`,
    };
    if (localhostLike) warnings.push("discordBotApiUrl masih localhost. Ganti ke URL publik atau kosongkan jika tidak dipakai.");
  } else {
    checks.discordBotApiUrl = { ok: true, detail: "discordBotApiUrl kosong / tidak dipakai." };
  }

  if (token && channelId) {
    try {
      const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = await res.json().catch(() => null) as { name?: string; type?: number } | null;
        checks.discordChannelAccess = {
          ok: true,
          detail: json?.name ? `Akses channel OK: ${json.name}` : "Akses channel Discord OK.",
        };
      } else {
        const err = await res.text().catch(() => "");
        checks.discordChannelAccess = {
          ok: false,
          detail: `Discord API ${res.status}${err ? `: ${err.slice(0, 120)}` : ""}`,
        };
      }
    } catch (e) {
      checks.discordChannelAccess = {
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  } else {
    checks.discordChannelAccess = {
      ok: false,
      detail: "Lewati cek akses channel karena token/channel belum lengkap.",
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: true, healthy: allOk, warnings, checks });
}
