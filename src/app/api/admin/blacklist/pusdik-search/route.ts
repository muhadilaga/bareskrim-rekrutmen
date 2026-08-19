import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminKey } from "@/lib/constants";
import { getEffectiveSettings } from "@/lib/runtime-settings";
import { fetchDiscordChannelMessages } from "@/lib/discord-api";
import { findLatestPusdikBlacklistMatch } from "@/lib/blacklist-pusdik";
import type { DiscordChannelMessage } from "@/lib/discord-api";
import { logAdminAction } from "@/lib/audit";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

const SearchSchema = z.object({
  username: z.string().trim().min(1).max(40),
});

const CACHE_TTL_MS = 60_000;
type CachedFetchResult =
  | { ok: true; messages: DiscordChannelMessage[]; fetchedAt: string; cached: boolean }
  | { ok: false; message?: string; messages: DiscordChannelMessage[] };

let cache:
  | {
      channelId: string;
      messages: DiscordChannelMessage[];
      expiresAt: number;
      fetchedAt: string;
    }
  | null = null;

async function getCachedBlacklistMessages(channelId: string): Promise<CachedFetchResult> {
  const now = Date.now();
  if (cache && cache.channelId === channelId && cache.expiresAt > now) {
    return {
      ok: true,
      messages: cache.messages,
      fetchedAt: cache.fetchedAt,
      cached: true,
    };
  }

  const fetched = await fetchDiscordChannelMessages(channelId, 100);
  if (!fetched.ok) {
    return {
      ok: false,
      message: fetched.message,
      messages: fetched.messages,
    };
  }

  cache = {
    channelId,
    messages: fetched.messages,
    expiresAt: now + CACHE_TTL_MS,
    fetchedAt: new Date(now).toISOString(),
  };

  return {
    ok: true,
    messages: fetched.messages,
    fetchedAt: cache.fetchedAt,
    cached: false,
  };
}

export async function POST(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Username tidak valid." }, { status: 400 });
  }

  const settings = await getEffectiveSettings();
  const channelId = settings.discordBlacklistPendidikanChannelId?.trim();
  const guildId = settings.discordGuildId?.trim();
  if (!channelId) {
    return NextResponse.json(
      { ok: false, message: "Channel blacklist pendidikan belum dikonfigurasi." },
      { status: 409 }
    );
  }
  if (!guildId) {
    return NextResponse.json(
      { ok: false, message: "Discord guild ID belum dikonfigurasi." },
      { status: 409 }
    );
  }

  const fetched = await getCachedBlacklistMessages(channelId);
  if (fetched.ok === false) {
    return NextResponse.json(
      { ok: false, message: fetched.message ?? "Gagal membaca channel blacklist pendidikan." },
      { status: 502 }
    );
  }

  const entry = findLatestPusdikBlacklistMatch(
    fetched.messages,
    parsed.data.username,
    guildId,
    channelId
  );

  if (!entry) {
    await logAdminAction({
      action: "BLACKLIST_PUSDIK_LOOKUP",
      target: parsed.data.username,
      detail: { found: false, scanned: fetched.messages.length, cached: fetched.cached, fetchedAt: fetched.fetchedAt },
    });

    return NextResponse.json({
      ok: true,
      found: false,
      message: "nama bebas dari blacklist",
      scanned: fetched.messages.length,
      cached: fetched.cached,
      fetchedAt: fetched.fetchedAt,
      cacheTtlMs: CACHE_TTL_MS,
    });
  }

  await logAdminAction({
    action: "BLACKLIST_PUSDIK_LOOKUP",
    target: parsed.data.username,
    detail: {
      found: true,
      scanned: fetched.messages.length,
      cached: fetched.cached,
      fetchedAt: fetched.fetchedAt,
      sourceMessageId: entry.sourceMessageId,
      sourceUrl: entry.sourceUrl,
    },
  });

  return NextResponse.json({
    ok: true,
    found: true,
    message: "Nama ditemukan dalam blacklist pendidikan.",
    entry,
    scanned: fetched.messages.length,
    cached: fetched.cached,
    fetchedAt: fetched.fetchedAt,
    cacheTtlMs: CACHE_TTL_MS,
  });
}
