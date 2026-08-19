import { NextResponse } from "next/server";
import { CONFIG, getAdminKey } from "@/lib/constants";

const DISCORD_API = "https://discord.com/api/v10";

function botHeaders() {
  return {
    Authorization: `Bot ${CONFIG.discordBotToken}`,
    "Content-Type": "application/json",
  };
}

async function findMember(identifier: string) {
  const guildId = CONFIG.discordGuildId?.trim();
  if (!CONFIG.discordBotToken || !guildId) {
    return { ok: false as const, message: "Discord bot atau guild belum dikonfigurasi." };
  }

  const query = identifier.trim();
  const searchRes = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/search?query=${encodeURIComponent(query)}&limit=10`,
    {
      headers: botHeaders(),
      signal: AbortSignal.timeout(20_000),
    }
  );

  if (!searchRes.ok) {
    const err = await searchRes.text().catch(() => "");
    return {
      ok: false as const,
      message: `Gagal mencari member Discord: ${searchRes.status}${err ? `: ${err.slice(0, 120)}` : ""}`,
    };
  }

  const members = (await searchRes.json().catch(() => [])) as Array<{
    nick?: string | null;
    user?: { id: string; username: string; discriminator?: string };
  }>;

  const lower = query.toLowerCase();
  const match =
    members.find((m) => m.user?.username?.toLowerCase() === lower) ??
    members.find((m) => m.nick?.toLowerCase() === lower) ??
    members[0];

  if (!match?.user?.id) {
    return { ok: false as const, message: `Member "${identifier}" tidak ditemukan di server pusdik.` };
  }

  return {
    ok: true as const,
    guildId,
    userId: match.user.id,
    username: match.user.discriminator && match.user.discriminator !== "0"
      ? `${match.user.username}#${match.user.discriminator}`
      : match.user.username,
  };
}

export async function GET(req: Request) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== getAdminKey()) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json(
        { ok: false, message: "username wajib diisi" },
        { status: 400 }
      );
    }

    const member = await findMember(username);
    if (!member.ok) {
      return NextResponse.json({ ok: false, message: member.message }, { status: 400 });
    }

    const guildRes = await fetch(`${DISCORD_API}/guilds/${member.guildId}`, {
      headers: botHeaders(),
      signal: AbortSignal.timeout(20_000),
    });

    if (!guildRes.ok) {
      const err = await guildRes.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          message: `Gagal membaca server Discord: ${guildRes.status}${err ? `: ${err.slice(0, 120)}` : ""}`,
        },
        { status: 502 }
      );
    }

    const guild = (await guildRes.json().catch(() => null)) as { id?: string; name?: string } | null;

    return NextResponse.json({
      ok: true,
      username: member.username,
      userId: member.userId,
      guilds: guild?.id
        ? [
            {
              guildId: guild.id,
              guildName: guild.name ?? "Server Pusdik",
              memberCount: null,
              isPrimary: true,
            },
          ]
        : [],
    });
  } catch (error) {
    console.error("Admin discord groups error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Gagal memuat server Discord." },
      { status: 500 }
    );
  }
}
