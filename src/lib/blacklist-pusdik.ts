import type { DiscordChannelMessage } from "@/lib/discord-api";

export interface PusdikBlacklistLookupResult {
  username: string;
  reason: string | null;
  duration: string | null;
  rawSnippet: string | null;
  sourceMessageId: string;
  sourceUrl: string | null;
  postedAt: string | null;
}

function normalizeName(input: string): string {
  return input
    .trim()
    .replace(/^@+/, "")
    .replace(/^<@!?/, "")
    .replace(/>$/, "")
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
  const explicitName = extractFieldValue(joined, ["nama", "username", "casis"]);

  const explicitMatch = explicitName && normalizeName(explicitName) === normalizedTarget;
  const looseMatch = textContainsUsername(joined, username);
  if (!explicitMatch && !looseMatch) return null;

  const reason = extractFieldValue(joined, ["alasan", "reason"]);
  const duration = extractFieldValue(joined, ["durasi blacklist", "durasi", "duration"]);

  return {
    username: explicitName?.trim() || username.trim(),
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
