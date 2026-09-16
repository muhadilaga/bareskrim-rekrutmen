import {
  fetchDiscordChannelMessages,
  fetchDiscordGuildMemberNames,
  type DiscordChannelMessage,
} from "@/lib/discord-api";

export interface PusdikBlacklistLookupResult {
  username: string;
  reason: string | null;
  duration: string | null;
  rawSnippet: string | null;
  sourceMessageId: string;
  sourceUrl: string | null;
  postedAt: string | null;
}

export interface CachedPusdikBlacklistMessages {
  ok: boolean;
  messages: DiscordChannelMessage[];
  message?: string;
  fetchedAt: string;
  cached: boolean;
}

const DEFAULT_BLACKLIST_CACHE_TTL_MS = 15 * 60_000;

type PusdikCacheStore = {
  channelId: string;
  messages: DiscordChannelMessage[];
  fetchedAt: string;
  expiresAt: number;
} | null;

const globalPusdikCache = globalThis as typeof globalThis & {
  __bareskrimPusdikBlacklistCache?: PusdikCacheStore;
  __bareskrimPusdikBlacklistPromise?: Promise<CachedPusdikBlacklistMessages> | null;
};

export async function getCachedPusdikBlacklistMessages(
  channelId: string,
  ttlMs = DEFAULT_BLACKLIST_CACHE_TTL_MS
): Promise<CachedPusdikBlacklistMessages> {
  const now = Date.now();
  const existing = globalPusdikCache.__bareskrimPusdikBlacklistCache;
  if (existing && existing.channelId === channelId && existing.expiresAt > now) {
    return { ok: true, messages: existing.messages, fetchedAt: existing.fetchedAt, cached: true };
  }

  if (globalPusdikCache.__bareskrimPusdikBlacklistPromise) {
    return globalPusdikCache.__bareskrimPusdikBlacklistPromise;
  }

  globalPusdikCache.__bareskrimPusdikBlacklistPromise = (async () => {
    const fetched = await fetchDiscordChannelMessages(channelId, 500);
    if (!fetched.ok) {
      return {
        ok: false,
        messages: [],
        message: fetched.message,
        fetchedAt: new Date(now).toISOString(),
        cached: false,
      };
    }

    const messages = await withResolvedMentionNames(fetched.messages, fetchDiscordGuildMemberNames);
    const fetchedAt = new Date(now).toISOString();
    globalPusdikCache.__bareskrimPusdikBlacklistCache = {
      channelId,
      messages,
      fetchedAt,
      expiresAt: now + ttlMs,
    };
    return { ok: true, messages, fetchedAt, cached: false };
  })().finally(() => {
    globalPusdikCache.__bareskrimPusdikBlacklistPromise = null;
  });

  return globalPusdikCache.__bareskrimPusdikBlacklistPromise;
}

function normalizeName(input: string): string {
  return input
    .trim()
    .replace(/^@+/, "")
    .replace(/^<@!?/, "")
    .replace(/>$/, "")
    .replace(/[_\s]+/g, "")
    .toLowerCase();
}

function clip(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFieldValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const rx = new RegExp(`(?:^|\\n)\\s*${label}\\s*[:=-]\\s*(.+?)(?=\\n\\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,30}\\s*[:=-]|$)`, "i");
    const m = text.match(rx);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function buildSourceUrl(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function pushEmbedBlocks(blocks: string[], embeds: DiscordChannelMessage["embeds"]) {
  for (const embed of embeds ?? []) {
    if (embed.title?.trim()) blocks.push(embed.title.trim());
    if (embed.description?.trim()) blocks.push(embed.description.trim());
    for (const field of embed.fields ?? []) {
      const name = field.name?.trim();
      const value = field.value?.trim();
      if (name && value) blocks.push(`${name}: ${value}`);
      else if (value) blocks.push(value);
    }
  }
}

function extractTextBlocks(message: DiscordChannelMessage): string[] {
  const blocks: string[] = [];
  if (message.content?.trim()) blocks.push(message.content.trim());
  pushEmbedBlocks(blocks, message.embeds ?? []);
  for (const snapshot of message.message_snapshots ?? []) {
    if (snapshot.message?.content?.trim()) blocks.push(snapshot.message.content.trim());
    pushEmbedBlocks(blocks, snapshot.message?.embeds ?? []);
  }
  return blocks;
}

function mentionIdsFromText(text: string): string[] {
  return Array.from(text.matchAll(/<@!?(\d+)>/g), (match) => match[1]);
}

export async function withResolvedMentionNames(
  messages: DiscordChannelMessage[],
  resolveNames: (userId: string) => Promise<string[]>
): Promise<DiscordChannelMessage[]> {
  const nameCache = new Map<string, string[]>();

  async function namesFor(userId: string): Promise<string[]> {
    if (!nameCache.has(userId)) nameCache.set(userId, await resolveNames(userId));
    return nameCache.get(userId) ?? [];
  }

  const result: DiscordChannelMessage[] = [];
  for (const message of messages) {
    const blocks = extractTextBlocks(message);
    const mentionIds = Array.from(new Set(blocks.flatMap(mentionIdsFromText)));
    
    // Add names directly available in the message's `mentions` array (works even if user left guild)
    const inlineMentionNames = (message.mentions || [])
      .flatMap(m => [m.username, m.global_name])
      .filter((n): n is string => Boolean(n) && typeof n === "string");

    if (mentionIds.length === 0 && inlineMentionNames.length === 0) {
      result.push(message);
      continue;
    }

    const resolvedNames: string[] = [...inlineMentionNames];
    for (const id of mentionIds) {
      resolvedNames.push(...(await namesFor(id)));
    }
    
    // Deduplicate
    const uniqueResolved = Array.from(new Set(resolvedNames.map(n => n.trim()))).filter(n => n.length >= 2);

    if (uniqueResolved.length === 0) {
      result.push(message);
      continue;
    }

    result.push({
      ...message,
      content: `${message.content ?? ""}\nResolved mentions: ${uniqueResolved.join(", ")}`.trim(),
    });
  }
  return result;
}

/**
 * Extract all usernames from the "Nama" field value.
 * Handles formats like:
 *   - "LaapXDs"
 *   - "<@1465024804967940340>"  (Discord mention - skipped)
 *   - "@ruzzxz47/shinzouusasageyoo"  (multi-username separated by /)
 *   - "ItsMeutabb/thamaanicholl"
 *   - "@Dimasclip (Mrsyh16)"  (username + alias in parens)
 *   - "@narut077885/wildan4033"
 */
function extractNamesFromField(raw: string): string[] {
  const names: string[] = [];

  // Remove Discord mentions <@123456> or <@!123456>
  const cleaned = raw.replace(/<@!?\d+>/g, "").trim();
  if (!cleaned) return names;

  // Split by / to handle multi-username
  const parts = cleaned.split(/\s*\/\s*/);

  for (const part of parts) {
    // Extract username from parentheses: "@Dimasclip (Mrsyh16)" -> ["Dimasclip", "Mrsyh16"]
    const parenMatch = part.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const inside = parenMatch[1].trim().replace(/^@+/, "");
      if (inside && !/^\d{17,}$/.test(inside)) names.push(inside);
      // Also extract the part before parens
      const before = part.replace(/\([^)]*\)/, "").trim().replace(/^@+/, "");
      if (before && !/^\d{17,}$/.test(before)) names.push(before);
    } else {
      const name = part.trim().replace(/^@+/, "").replace(/\*+/g, "");
      if (name && !/^\d{17,}$/.test(name)) names.push(name);
    }
  }

  return names.filter(n => n.length >= 2);
}

function textContainsUsername(text: string, username: string): boolean {
  const escaped = escapeRegExp(username.trim());
  if (!escaped) return false;
  const exact = new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, "i");
  return exact.test(text);
}

function parseMessage(
  message: DiscordChannelMessage,
  username: string,
  guildId: string,
  channelId: string
): PusdikBlacklistLookupResult | null {
  const blocks = extractTextBlocks(message);
  if (blocks.length === 0) return null;

  const joined = blocks.join("\n");
  const normalizedTarget = normalizeName(username);
  const namaField = extractFieldValue(joined, ["nama", "username", "casis"]);

  // 1. Check explicit "Nama" field - extract all names and compare
  let explicitMatch = false;
  let matchedName: string | null = null;

  const resolvedMentionNames = extractFieldValue(joined, ["resolved mentions"])
    ?.split(/\s*,\s*/)
    .filter(Boolean) ?? [];

  if (namaField) {
    const extractedNames = [...extractNamesFromField(namaField), ...resolvedMentionNames];
    for (const name of extractedNames) {
      if (normalizeName(name) === normalizedTarget) {
        explicitMatch = true;
        matchedName = name;
        break;
      }
    }
  }

  // 2. Loose match: username appears anywhere in message text.
  // Also try normalized target so admin input like @Farlean26 matches resolved mention name Farlean26.
  const looseMatch = textContainsUsername(joined, username)
    || textContainsUsername(joined, normalizedTarget)
    || normalizeName(joined).includes(normalizedTarget);

  if (!explicitMatch && !looseMatch) return null;

  const reason = extractFieldValue(joined, ["alasan", "reason"]);
  const duration = extractFieldValue(joined, ["durasi blacklist", "durasi", "duration", "durasi bl"]);

  return {
    username: matchedName || namaField?.trim() || username.trim(),
    reason: reason || null,
    duration: duration || null,
    rawSnippet: clip(joined),
    sourceMessageId: message.id,
    sourceUrl: buildSourceUrl(guildId, channelId, message.id),
    postedAt: message.timestamp ?? null,
  };
}

export function findLatestPusdikBlacklistMatch(
  messages: DiscordChannelMessage[],
  username: string,
  guildId: string,
  channelId: string
): PusdikBlacklistLookupResult | null {
  const hits = messages
    .map((message) => parseMessage(message, username, guildId, channelId))
    .filter((item): item is PusdikBlacklistLookupResult => item !== null)
    .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

  return hits[0] ?? null;
}
