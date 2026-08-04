// ============================================================
// Roblox API Client (public endpoints, tanpa auth token)
// ============================================================

export interface RobloxUserInfo {
  id: number;
  name: string;
  displayName: string;
  description?: string;
}

export interface RobloxGroupRole {
  groupId: number;
  groupName: string;
  roleId: number;
  roleName: string;
  roleRank: number;
  isPrimary: boolean;
}

const ROBLOX_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "BareskrimRekrutmen/1.0 (roleplay-community)",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch dengan retry untuk rate-limit (429): Roblox sering membatasi permintaan
// saat banyak login/uji coba dalam waktu singkat.
async function robloxFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: { ...ROBLOX_HEADERS, ...(init?.headers ?? {}) },
      });
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const retryAfter = Math.min(Number(res.headers.get("retry-after") ?? "10") || 10, 30);
        console.warn(`Roblox 429, retry ${attempt}/${MAX_ATTEMPTS} in ${retryAfter}s: ${url}`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`Roblox API error ${res.status} for ${url}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Roblox API unreachable");
}

// Cache resolusi username -> Roblox ID (TTL 10 mnt). Endpoint
// users.roblox.com paling agresif di-rate-limit; cache ini mencegah
// percobaan login berulang di username yang sama memanggil API lagi.
const RESOLVE_CACHE_TTL_MS = 10 * 60_000;
const resolveCache = new Map<string, { at: number; value: RobloxUserInfo | null }>();

// Resolve username -> user info (id, name, displayName)
export async function resolveUserByUsername(
  username: string
): Promise<RobloxUserInfo | null> {
  const key = username.trim().toLowerCase();
  const hit = resolveCache.get(key);
  if (hit && Date.now() - hit.at < RESOLVE_CACHE_TTL_MS) {
    return hit.value;
  }
  const value = await doResolve(key);
  if (resolveCache.size > 1000) resolveCache.clear();
  resolveCache.set(key, { at: Date.now(), value });
  return value;
}

async function doResolve(key: string): Promise<RobloxUserInfo | null> {
  const body = { usernames: [key], excludeBannedUsers: true };
  const json = await robloxFetch<{
    data: Array<{
      requestedUsername: string;
      hasVerifiedBadge: boolean;
      id: number;
      name: string;
      displayName: string;
    }>;
  }>("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const hit = json.data.find((u) => u.requestedUsername.toLowerCase() === key);
  if (!hit) return null;
  return { id: hit.id, name: hit.name, displayName: hit.displayName };
}

// Ambil avatar headshot terbaru
export async function getAvatarHeadshot(userId: number): Promise<string | null> {
  const hit = headshotCache.get(userId);
  if (hit && Date.now() - hit.at < HEADSHOT_CACHE_TTL_MS) return hit.value;
  const value = await doGetAvatarHeadshot(userId);
  if (headshotCache.size > 1000) headshotCache.clear();
  headshotCache.set(userId, { at: Date.now(), value });
  return value;
}

async function doGetAvatarHeadshot(userId: number): Promise<string | null> {
  try {
    const json = await robloxFetch<{
      data: Array<{ targetId: number; state: string; imageUrl: string }>;
    }>(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=720x720&format=Png&isCircular=false`
    );
    const item = json.data?.[0];
    if (item && item.state === "Completed" && item.imageUrl) return item.imageUrl;
    return null;
  } catch {
    return null;
  }
}

const HEADSHOT_CACHE_TTL_MS = 30 * 60_000;
const headshotCache = new Map<number, { at: number; value: string | null }>();

// Ambil seluruh keanggotaan grup user
export async function getUserGroups(userId: number): Promise<RobloxGroupRole[]> {
  const hit = groupCache.get(userId);
  if (hit && Date.now() - hit.at < GROUP_CACHE_TTL_MS) return hit.value;
  const value = await doGetUserGroups(userId);
  if (groupCache.size > 1000) groupCache.clear();
  groupCache.set(userId, { at: Date.now(), value });
  return value;
}

async function doGetUserGroups(userId: number): Promise<RobloxGroupRole[]> {
  const json = await robloxFetch<{
    data: Array<{
      group: { id: number; name: string };
      role: { id: number; name: string; rank: number };
      isPrimaryGroup: boolean;
    }>;
  }>(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);

  return json.data.map((g) => ({
    groupId: g.group.id,
    groupName: g.group.name,
    roleId: g.role.id,
    roleName: g.role.name,
    roleRank: g.role.rank,
    isPrimary: g.isPrimaryGroup,
  }));
}

const GROUP_CACHE_TTL_MS = 5 * 60_000;
const groupCache = new Map<number, { at: number; value: RobloxGroupRole[] }>();

export function profileUrl(userId: number): string {
  return `https://www.roblox.com/users/${userId}/profile`;
}
