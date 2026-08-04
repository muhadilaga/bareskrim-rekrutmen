// ============================================================
// Discord REST API Helper - Assign & Check Role langsung
// dari Vercel tanpa bot server terpisah.
// ============================================================

import { CONFIG } from "@/lib/constants";

const DISCORD_API = "https://discord.com/api/v10";

function botHeaders() {
  return {
    Authorization: `Bot ${CONFIG.discordBotToken}`,
    "Content-Type": "application/json",
  };
}

// Resolve Discord user ID dari username
async function resolveDiscordUser(
  username: string
): Promise<{ id: string; username: string } | null> {
  try {
    const res = await fetch(
      `${DISCORD_API}/guilds/${CONFIG.discordGuildId}/members/search?query=${encodeURIComponent(username)}&limit=5`,
      { headers: botHeaders(), signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const members: Array<{ user: { id: string; username: string } }> =
      await res.json();
    // Cari exact match
    const match = members.find(
      (m) =>
        m.user.username.toLowerCase() === username.toLowerCase()
    );
    return match?.user ?? members[0]?.user ?? null;
  } catch (e) {
    console.error("resolveDiscordUser error:", e);
    return null;
  }
}

// Assign role ke user Discord
export async function assignDiscordRole(
  username: string,
  roleName: string
): Promise<{ ok: boolean; message: string }> {
  const token = CONFIG.discordBotToken;
  const guildId = CONFIG.discordGuildId;
  const roleId = CONFIG.tahapAkademikRoleId;

  if (!token || !guildId || !roleId) {
    return {
      ok: false,
      message: "Discord bot belum dikonfigurasi (DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, TAHAP_AKADEMIK_ROLE_ID).",
    };
  }

  const user = await resolveDiscordUser(username);
  if (!user) {
    return { ok: false, message: "User Discord tidak ditemukan." };
  }

  try {
    const res = await fetch(
      `${DISCORD_API}/guilds/${guildId}/members/${user.id}/roles/${roleId}`,
      {
        method: "PUT",
        headers: botHeaders(),
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (res.ok || res.status === 204) {
      return { ok: true, message: "Role berhasil diberikan." };
    }

    const body = await res.json().catch(() => ({}));
    return {
      ok: false,
      message: `Gagal assign role: ${res.status} ${JSON.stringify(body)}`,
    };
  } catch (e) {
    console.error("assignDiscordRole error:", e);
    return {
      ok: false,
      message: `Error assign role: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// Cek apakah user punya role tertentu
export async function checkDiscordRole(
  username: string,
  roleName: string
): Promise<{ ok: boolean; hasRole: boolean }> {
  const token = CONFIG.discordBotToken;
  const guildId = CONFIG.discordGuildId;
  const roleId = CONFIG.tahapAkademikRoleId;

  if (!token || !guildId || !roleId) {
    // Bot belum dikonfigurasi, skip check (jangan blokir user)
    return { ok: false, hasRole: false };
  }

  const user = await resolveDiscordUser(username);
  if (!user) return { ok: false, hasRole: false };

  try {
    const res = await fetch(
      `${DISCORD_API}/guilds/${guildId}/members/${user.id}`,
      { headers: botHeaders(), signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) return { ok: false, hasRole: false };

    const member: { roles?: string[] } = await res.json();
    const hasRole = member.roles?.includes(roleId) ?? false;
    return { ok: true, hasRole };
  } catch (e) {
    console.error("checkDiscordRole error:", e);
    return { ok: false, hasRole: false };
  }
}
