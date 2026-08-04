import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { CONFIG } from "@/lib/constants";

const DISCORD_API = "https://discord.com/api/v10";

function botHeaders() {
  return {
    Authorization: `Bot ${CONFIG.discordBotToken}`,
    "Content-Type": "application/json",
  };
}

function isAdmin(req: Request): boolean {
  const key = req.headers.get("x-admin-key");
  return !!key && key === getAdminKey();
}

interface DiscordMessage {
  id: string;
  content: string;
  author: { id: string; username: string; bot?: boolean };
  webhook_id?: string;
  timestamp: string;
  embeds: Array<{ title?: string; description?: string }>;
}

// GET: Fetch recent messages from channel
export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const channelId = CONFIG.discordChannelId;
  if (!channelId) {
    return NextResponse.json({ ok: false, message: "DISCORD_CHANNEL_ID belum dikonfigurasi." }, { status: 400 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);

  try {
    const res = await fetch(
      `${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`,
      { headers: botHeaders(), signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: false, message: `Discord API error: ${res.status}`, detail: err }, { status: 502 });
    }

    const messages: DiscordMessage[] = await res.json();

    // Filter hanya bot/webhook messages
    const botMessages = messages.filter(
      (m) => m.author.bot || m.webhook_id
    );

    return NextResponse.json({
      ok: true,
      messages: botMessages.map((m) => ({
        id: m.id,
        content: m.content,
        author: m.author.username,
        embedTitle: m.embeds[0]?.title ?? null,
        embedDescription: m.embeds[0]?.description ?? null,
        timestamp: m.timestamp,
      })),
      total: botMessages.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `Gagal mengambil pesan: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

// DELETE: Delete a single message or bulk delete
export async function DELETE(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const channelId = CONFIG.discordChannelId;
  if (!channelId) {
    return NextResponse.json({ ok: false, message: "DISCORD_CHANNEL_ID belum dikonfigurasi." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const { messageIds, deleteAll } = body ?? {};

  try {
    if (deleteAll) {
      // Fetch all bot messages first, then bulk delete
      const res = await fetch(
        `${DISCORD_API}/channels/${channelId}/messages?limit=100`,
        { headers: botHeaders(), signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) {
        return NextResponse.json({ ok: false, message: `Gagal fetch pesan: ${res.status}` }, { status: 502 });
      }
      const messages: DiscordMessage[] = await res.json();
      const botIds = messages.filter((m) => m.author.bot || m.webhook_id).map((m) => m.id);

      if (botIds.length === 0) {
        return NextResponse.json({ ok: true, message: "Tidak ada pesan bot untuk dihapus.", deleted: 0 });
      }

      // Bulk delete (max 100, max age 14 days)
      // Discord bulk delete gagal kalau ada pesan >14 hari atau <2 pesan.
      // Fallback ke delete satu-satu bila bulk gagal.
      const bulkRes = await fetch(
        `${DISCORD_API}/channels/${channelId}/messages/bulk-delete`,
        {
          method: "POST",
          headers: botHeaders(),
          body: JSON.stringify({ messages: botIds.slice(0, 100) }),
          signal: AbortSignal.timeout(15_000),
        }
      );

      if (bulkRes.ok || bulkRes.status === 204) {
        return NextResponse.json({ ok: true, message: `${botIds.length} pesan bot berhasil dihapus.`, deleted: botIds.length });
      }

      // Bulk gagal (biasanya pesan >14 hari) → fallback hapus satu-satu
      let deleted = 0;
      for (const id of botIds.slice(0, 100)) {
        const delRes = await fetch(
          `${DISCORD_API}/channels/${channelId}/messages/${id}`,
          { method: "DELETE", headers: botHeaders(), signal: AbortSignal.timeout(5_000) }
        );
        if (delRes.ok || delRes.status === 204) deleted++;
        // Delay antar hapus agar tidak kena rate limit
        await new Promise((r) => setTimeout(r, 500));
      }

      return NextResponse.json({ ok: true, message: `${deleted} pesan bot berhasil dihapus (fallback individual).`, deleted });
    }

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ ok: false, message: "messageIds wajib berisi array ID pesan." }, { status: 400 });
    }

    // Delete individually (Discord doesn't support bulk delete via webhook for >1 message easily)
    let deleted = 0;
    for (const id of messageIds.slice(0, 100)) {
      const res = await fetch(
        `${DISCORD_API}/channels/${channelId}/messages/${id}`,
        { method: "DELETE", headers: botHeaders(), signal: AbortSignal.timeout(5_000) }
      );
      if (res.ok || res.status === 204) deleted++;
    }

    return NextResponse.json({ ok: true, message: `${deleted} pesan berhasil dihapus.`, deleted });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `Gagal hapus pesan: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}
