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

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const token = CONFIG.discordBotToken;
  if (!token || token.startsWith("••••") || token === "") {
    return NextResponse.json(
      {
        ok: false,
        message: "DISCORD_BOT_TOKEN tidak dikonfigurasi atau menggunakan placeholder",
        detail: "Set DISCORD_BOT_TOKEN di environment variables",
      },
      { status: 500 }
    );
  }

  const channelId = CONFIG.discordChannelId;
  if (!channelId) {
    return NextResponse.json({ ok: false, message: "DISCORD_CHANNEL_ID belum dikonfigurasi." }, { status: 400 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`, {
      headers: botHeaders(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[DISCORD_MSGS] Failed to fetch messages: ${res.status}`, err);

      return NextResponse.json(
        {
          ok: false,
          message: `Discord API error: ${res.status}`,
          detail: err,
          hint:
            res.status === 401
              ? "Token bot tidak valid/expired. Cek DISCORD_BOT_TOKEN."
              : res.status === 403
                ? "Bot tidak punya izin Read Message History/View Channel."
                : res.status === 404
                  ? "Channel ID salah atau bot tidak ada di server."
                  : undefined,
        },
        { status: 502 }
      );
    }

    const messages: DiscordMessage[] = await res.json();
    const botMessages = messages.filter((m) => m.author.bot || m.webhook_id);

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
    console.error("[DISCORD_MSGS] Exception:", e);
    return NextResponse.json(
      { ok: false, message: `Gagal mengambil pesan: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

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

  async function deleteOne(id: string): Promise<{ ok: boolean; status: number; detail?: unknown }> {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${id}`, {
      method: "DELETE",
      headers: botHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    const detail = await res.json().catch(() => null);
    return { ok: res.ok || res.status === 204, status: res.status, detail };
  }

  async function deleteIds(ids: string[]) {
    let deleted = 0;
    let lastError: { status: number; detail?: unknown } | null = null;

    for (const id of ids) {
      const result = await deleteOne(id);
      if (result.ok) deleted++;
      else lastError = { status: result.status, detail: result.detail };
      await new Promise((r) => setTimeout(r, 1200));
    }

    return { deleted, lastError };
  }

  try {
    if (deleteAll) {
      const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages?limit=100`, {
        headers: botHeaders(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return NextResponse.json({ ok: false, message: `Gagal fetch pesan: ${res.status}` }, { status: 502 });
      }

      const messages: DiscordMessage[] = await res.json();
      const botIds = messages.filter((m) => m.author.bot || m.webhook_id).map((m) => m.id);

      if (botIds.length === 0) {
        return NextResponse.json({ ok: true, message: "Tidak ada pesan bot untuk dihapus.", deleted: 0 });
      }

      const bulkIds = botIds.slice(0, 100);
      const bulkRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages/bulk-delete`, {
        method: "POST",
        headers: botHeaders(),
        body: JSON.stringify({ messages: bulkIds }),
        signal: AbortSignal.timeout(15_000),
      });

      if (bulkRes.ok || bulkRes.status === 204) {
        return NextResponse.json({ ok: true, message: `${bulkIds.length} pesan bot berhasil dihapus.`, deleted: bulkIds.length });
      }

      const { deleted, lastError } = await deleteIds(bulkIds);
      if (deleted === 0) {
        return NextResponse.json(
          {
            ok: false,
            message: "Gagal hapus pesan bot.",
            hint:
              lastError?.status === 403
                ? "Bot butuh permission Manage Messages + Read Message History + View Channel."
                : lastError?.status === 404
                  ? "Channel ID salah atau pesan sudah tidak ada."
                  : "Coba cek permission bot dan pastikan target pesan masih ada.",
            detail: lastError?.detail ?? null,
            deleted: 0,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        message: deleted === bulkIds.length
          ? `${deleted} pesan bot berhasil dihapus (fallback individual).`
          : `${deleted}/${bulkIds.length} pesan bot berhasil dihapus (fallback individual).`,
        deleted,
        warning:
          deleted < bulkIds.length
            ? lastError?.status === 403
              ? "Sebagian pesan gagal dihapus karena permission bot kurang."
              : "Sebagian pesan gagal dihapus."
            : undefined,
      });
    }

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ ok: false, message: "messageIds wajib berisi array ID pesan." }, { status: 400 });
    }

    const ids = Array.from(new Set(messageIds.map(String))).slice(0, 100);
    const { deleted, lastError } = await deleteIds(ids);

    if (deleted === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Gagal hapus pesan terpilih.",
          hint:
            lastError?.status === 403
              ? "Bot butuh permission Manage Messages + Read Message History + View Channel."
              : lastError?.status === 404
                ? "Pesan sudah tidak ada atau ID salah."
                : "Coba cek permission bot dan pastikan target pesan masih ada.",
          detail: lastError?.detail ?? null,
          deleted: 0,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: deleted === ids.length
        ? `${deleted} pesan berhasil dihapus.`
        : `${deleted}/${ids.length} pesan berhasil dihapus.`,
      deleted,
      warning:
        deleted < ids.length
          ? lastError?.status === 403
            ? "Sebagian pesan gagal dihapus karena permission bot kurang."
            : "Sebagian pesan gagal dihapus."
          : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `Gagal hapus pesan: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}
