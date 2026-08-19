import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminKey } from "@/lib/constants";
import { getEffectiveSettings } from "@/lib/runtime-settings";

const DISCORD_API = "https://discord.com/api/v10";

type CheckResult = { ok: boolean; detail: string };

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

function botHeaders(token: string) {
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };
}

function maskWebhook(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length < 18) return trimmed;
  return `${trimmed.slice(0, 12)}...${trimmed.slice(-6)}`;
}

async function checkDiscordChannel(token: string, channelId: string, label: string): Promise<CheckResult> {
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
      headers: botHeaders(token),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, detail: `${label}: Discord API ${res.status}${err ? `: ${err.slice(0, 120)}` : ""}` };
    }
    const json = (await res.json().catch(() => null)) as { name?: string } | null;
    return {
      ok: true,
      detail: json?.name ? `${label}: akses OK ke #${json.name}` : `${label}: akses channel OK.`,
    };
  } catch (e) {
    return { ok: false, detail: `${label}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const settings = await getEffectiveSettings();
  const warnings: string[] = [];
  const checks: Record<string, CheckResult> = {};

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.database = { ok: true, detail: "Koneksi database OK." };
  } catch (e) {
    checks.database = { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }

  const token = settings.discordBotToken?.trim();
  const guildId = settings.discordGuildId?.trim();
  const reportChannelId = settings.discordChannelId?.trim();
  const blacklistPendidikanChannelId = settings.discordBlacklistPendidikanChannelId?.trim();
  const tahapAkademikRoleId = settings.tahapAkademikRoleId?.trim();
  const tahapInterviewRoleId = settings.tahapInterviewRoleId?.trim();
  const apiUrl = settings.discordBotApiUrl?.trim();
  const webhookUrl = settings.discordWebhookUrl?.trim();

  checks.discordToken = {
    ok: !!token,
    detail: token ? "DISCORD_BOT_TOKEN tersedia." : "DISCORD_BOT_TOKEN kosong.",
  };
  checks.discordGuild = {
    ok: !!guildId,
    detail: guildId ? `DISCORD_GUILD_ID: ${guildId}` : "DISCORD_GUILD_ID kosong.",
  };
  checks.discordReportChannel = {
    ok: !!reportChannelId,
    detail: reportChannelId ? `DISCORD_CHANNEL_ID laporan: ${reportChannelId}` : "DISCORD_CHANNEL_ID kosong.",
  };
  checks.discordBlacklistPendidikanChannel = {
    ok: !!blacklistPendidikanChannelId,
    detail: blacklistPendidikanChannelId
      ? `DISCORD_BLACKLIST_PENDIDIKAN_CHANNEL_ID: ${blacklistPendidikanChannelId}`
      : "DISCORD_BLACKLIST_PENDIDIKAN_CHANNEL_ID kosong.",
  };
  checks.tahapAkademikRole = {
    ok: !!tahapAkademikRoleId,
    detail: tahapAkademikRoleId ? `TAHAP_AKADEMIK_ROLE_ID: ${tahapAkademikRoleId}` : "TAHAP_AKADEMIK_ROLE_ID kosong.",
  };
  checks.tahapInterviewRole = {
    ok: !!tahapInterviewRoleId,
    detail: tahapInterviewRoleId ? `TAHAP_INTERVIEW_ROLE_ID: ${tahapInterviewRoleId}` : "TAHAP_INTERVIEW_ROLE_ID kosong.",
  };
  checks.discordWebhook = {
    ok: !!webhookUrl,
    detail: webhookUrl ? `Webhook laporan tersedia: ${maskWebhook(webhookUrl)}` : "DISCORD_WEBHOOK_URL kosong.",
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

  if (webhookUrl) {
    const looksDiscordWebhook = /^https:\/\/discord\.com\/api\/webhooks\//i.test(webhookUrl);
    if (!looksDiscordWebhook) {
      checks.discordWebhook = {
        ok: false,
        detail: `Format webhook tampak tidak standar: ${maskWebhook(webhookUrl)}`,
      };
      warnings.push("DISCORD_WEBHOOK_URL tidak memakai format webhook Discord standar.");
    }
  }

  if (token) {
    try {
      const meRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: botHeaders(token),
        signal: AbortSignal.timeout(8000),
      });
      if (meRes.ok) {
        const me = (await meRes.json().catch(() => null)) as { username?: string; id?: string } | null;
        checks.discordBotIdentity = {
          ok: true,
          detail: me?.username ? `Bot aktif: ${me.username} (${me.id ?? "unknown"})` : "Bot token valid.",
        };
      } else {
        const err = await meRes.text().catch(() => "");
        checks.discordBotIdentity = {
          ok: false,
          detail: `Validasi bot gagal: ${meRes.status}${err ? `: ${err.slice(0, 120)}` : ""}`,
        };
      }
    } catch (e) {
      checks.discordBotIdentity = {
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  } else {
    checks.discordBotIdentity = { ok: false, detail: "Lewati cek bot karena token kosong." };
  }

  if (token && guildId) {
    try {
      const guildRes = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
        headers: botHeaders(token),
        signal: AbortSignal.timeout(8000),
      });
      if (guildRes.ok) {
        const guild = (await guildRes.json().catch(() => null)) as { name?: string } | null;
        checks.discordGuildAccess = {
          ok: true,
          detail: guild?.name ? `Akses guild OK: ${guild.name}` : "Akses guild Discord OK.",
        };
      } else {
        const err = await guildRes.text().catch(() => "");
        checks.discordGuildAccess = {
          ok: false,
          detail: `Guild Discord gagal diakses: ${guildRes.status}${err ? `: ${err.slice(0, 120)}` : ""}`,
        };
      }
    } catch (e) {
      checks.discordGuildAccess = {
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      };
    }

    try {
      const rolesRes = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
        headers: botHeaders(token),
        signal: AbortSignal.timeout(8000),
      });
      if (rolesRes.ok) {
        const roles = (await rolesRes.json().catch(() => [])) as Array<{ id: string; name: string }>;
        const akademikRole = tahapAkademikRoleId ? roles.find((role) => role.id === tahapAkademikRoleId) : null;
        const interviewRole = tahapInterviewRoleId ? roles.find((role) => role.id === tahapInterviewRoleId) : null;
        checks.tahapAkademikRoleLookup = {
          ok: !!tahapAkademikRoleId && !!akademikRole,
          detail: tahapAkademikRoleId
            ? akademikRole
              ? `Role akademik ditemukan: ${akademikRole.name}`
              : "Role akademik tidak ditemukan di guild."
            : "Role akademik belum diisi.",
        };
        checks.tahapInterviewRoleLookup = {
          ok: !!tahapInterviewRoleId && !!interviewRole,
          detail: tahapInterviewRoleId
            ? interviewRole
              ? `Role interview ditemukan: ${interviewRole.name}`
              : "Role interview tidak ditemukan di guild."
            : "Role interview belum diisi.",
        };
      } else {
        const err = await rolesRes.text().catch(() => "");
        checks.tahapAkademikRoleLookup = {
          ok: false,
          detail: `Gagal membaca daftar role guild: ${rolesRes.status}${err ? `: ${err.slice(0, 120)}` : ""}`,
        };
        checks.tahapInterviewRoleLookup = {
          ok: false,
          detail: `Gagal membaca daftar role guild: ${rolesRes.status}${err ? `: ${err.slice(0, 120)}` : ""}`,
        };
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      checks.tahapAkademikRoleLookup = { ok: false, detail };
      checks.tahapInterviewRoleLookup = { ok: false, detail };
    }
  } else {
    checks.discordGuildAccess = { ok: false, detail: "Lewati cek guild karena token/guild ID belum lengkap." };
    checks.tahapAkademikRoleLookup = { ok: false, detail: "Lewati cek role akademik karena token/guild ID belum lengkap." };
    checks.tahapInterviewRoleLookup = { ok: false, detail: "Lewati cek role interview karena token/guild ID belum lengkap." };
  }

  if (token && reportChannelId) {
    checks.discordReportChannelAccess = await checkDiscordChannel(token, reportChannelId, "Channel laporan");
  } else {
    checks.discordReportChannelAccess = {
      ok: false,
      detail: "Lewati cek channel laporan karena token/channel belum lengkap.",
    };
  }

  if (token && blacklistPendidikanChannelId) {
    checks.discordBlacklistPendidikanAccess = await checkDiscordChannel(
      token,
      blacklistPendidikanChannelId,
      "Channel blacklist pendidikan"
    );
  } else {
    checks.discordBlacklistPendidikanAccess = {
      ok: false,
      detail: "Lewati cek channel blacklist pendidikan karena token/channel belum lengkap.",
    };
  }

  if (!reportChannelId) warnings.push("Channel laporan Discord belum diisi.");
  if (!blacklistPendidikanChannelId) warnings.push("Channel blacklist pendidikan belum diisi.");
  if (!tahapAkademikRoleId) warnings.push("Role Tahap Akademik belum diisi.");
  if (!tahapInterviewRoleId) warnings.push("Role Tahap Interview belum diisi.");
  if (!webhookUrl) warnings.push("Webhook laporan Discord belum diisi.");

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: true, healthy: allOk, warnings, checks });
}
