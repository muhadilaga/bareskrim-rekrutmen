// ============================================================
// Discord REST API Helper - Assign & Check Role langsung
// dari server tanpa bot server terpisah.
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
    const url = `${DISCORD_API}/guilds/${CONFIG.discordGuildId}/members/search?query=${encodeURIComponent(username)}&limit=5`;
    const res = await fetch(url, {
      headers: botHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return null;
    }
    const members: Array<{ user: { id: string; username: string } }> =
      await res.json();
    const match = members.find(
      (m) =>
        m.user.username.toLowerCase() === username.toLowerCase()
    );
    return match?.user ?? members[0]?.user ?? null;
  } catch (e) {
    console.error("[Discord] resolveDiscordUser error:", e);
    return null;
  }
}

function roleIdFromConfig(roleName: string): string | null {
  if (roleName === "Tahap Akademik" && CONFIG.tahapAkademikRoleId) return CONFIG.tahapAkademikRoleId;
  if (roleName === "Tahap Interview" && CONFIG.tahapInterviewRoleId) return CONFIG.tahapInterviewRoleId;
  return null;
}

async function resolveRoleId(guildId: string, roleName: string): Promise<string | null> {
  const configured = roleIdFromConfig(roleName);
  if (configured) return configured;

  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
    headers: botHeaders(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;

  const roles: Array<{ id: string; name: string }> = await res.json();
  const found = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
  return found?.id ?? null;
}

// Assign role ke user Discord
export async function assignDiscordRole(
  username: string,
  roleName: string
): Promise<{ ok: boolean; message: string }> {
  const token = CONFIG.discordBotToken;
  const guildId = CONFIG.discordGuildId;

  if (!token || !guildId) {
    return {
      ok: false,
      message: "Discord bot belum dikonfigurasi (DISCORD_BOT_TOKEN, DISCORD_GUILD_ID).",
    };
  }

  const roleId = await resolveRoleId(guildId, roleName);
  if (!roleId) {
    return {
      ok: false,
      message: `Role "${roleName}" tidak ditemukan. Isi TAHAP_AKADEMIK_ROLE_ID/TAHAP_INTERVIEW_ROLE_ID atau pastikan nama role di Discord sama persis.`,
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
        signal: AbortSignal.timeout(20_000),
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

// Assign role ke user Discord (by role ID)
export async function assignDiscordRoleById(
  username: string,
  roleId: string
): Promise<{ ok: boolean; message: string }> {
  const token = CONFIG.discordBotToken;
  const guildId = CONFIG.discordGuildId;

  if (!token || !guildId || !roleId) {
    return {
      ok: false,
      message: "Discord bot belum dikonfigurasi atau roleId kosong.",
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
        signal: AbortSignal.timeout(20_000),
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
    console.error("assignDiscordRoleById error:", e);
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
      { headers: botHeaders(), signal: AbortSignal.timeout(20_000) }
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

// Hapus role dari user Discord (by role ID)
export async function removeDiscordRoleById(
  username: string,
  roleId: string
): Promise<{ ok: boolean; message: string }> {
  const token = CONFIG.discordBotToken;
  const guildId = CONFIG.discordGuildId;

  if (!token || !guildId || !roleId) {
    return { ok: false, message: "Discord bot belum dikonfigurasi atau roleId kosong." };
  }

  const user = await resolveDiscordUser(username);
  if (!user) {
    return { ok: false, message: "User Discord tidak ditemukan." };
  }

  try {
    const res = await fetch(
      `${DISCORD_API}/guilds/${guildId}/members/${user.id}/roles/${roleId}`,
      {
        method: "DELETE",
        headers: botHeaders(),
        signal: AbortSignal.timeout(20_000),
      }
    );

    if (res.ok || res.status === 204) {
      return { ok: true, message: "Role berhasil dilepas." };
    }

    const body = await res.json().catch(() => ({}));
    return {
      ok: false,
      message: `Gagal melepas role: ${res.status} ${JSON.stringify(body)}`,
    };
  } catch (e) {
    console.error("removeDiscordRoleById error:", e);
    return {
      ok: false,
      message: `Error melepas role: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// Kirim DM ke user Discord
export async function sendDiscordDM(
  username: string,
  content: string
): Promise<{ ok: boolean; message: string }> {
  const token = CONFIG.discordBotToken;

  if (!token) {
    return { ok: false, message: "Discord bot belum dikonfigurasi." };
  }

  const user = await resolveDiscordUser(username);
  if (!user) {
    return { ok: false, message: "User Discord tidak ditemukan." };
  }

  try {
    // 1. Buat DM channel
    const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers: botHeaders(),
      body: JSON.stringify({ recipient_id: user.id }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!dmRes.ok) {
      const body = await dmRes.json().catch(() => ({}));
      return {
        ok: false,
        message: `Gagal buat DM channel: ${dmRes.status} ${JSON.stringify(body)}`,
      };
    }

    const dmChannel: { id: string } = await dmRes.json();

    // 2. Kirim pesan ke DM channel
    const msgRes = await fetch(
      `${DISCORD_API}/channels/${dmChannel.id}/messages`,
      {
        method: "POST",
        headers: botHeaders(),
        body: JSON.stringify({ content }),
        signal: AbortSignal.timeout(20_000),
      }
    );

    if (msgRes.ok) {
      return { ok: true, message: "DM berhasil dikirim." };
    }

    const body = await msgRes.json().catch(() => ({}));
    return {
      ok: false,
      message: `Gagal kirim DM: ${msgRes.status} ${JSON.stringify(body)}`,
    };
  } catch (e) {
    console.error("sendDiscordDM error:", e);
    return {
      ok: false,
      message: `Error kirim DM: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
