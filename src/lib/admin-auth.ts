import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { CONFIG, getAdminKey, getJwtSecret } from "@/lib/constants";

const ADMIN_COOKIE = "brk_admin_verified";
const STAFF_ROLE_ID = "1471794305499664426";
const DISCORD_API = "https://discord.com/api/v10";

interface VerifiedAdminPayload extends JWTPayload {
  discordUserId: string;
  discordUsername: string;
  staffRoleId: string;
}

function adminSecret(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

function adminHeaders() {
  return {
    Authorization: `Bot ${CONFIG.discordBotToken}`,
    "Content-Type": "application/json",
  };
}

function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.split("; ").find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

export function isAdminKeyValid(adminKey: string | null): boolean {
  return !!adminKey && adminKey === getAdminKey();
}

export async function signVerifiedAdminSession(payload: VerifiedAdminPayload): Promise<string> {
  return new SignJWT({
    discordUserId: payload.discordUserId,
    discordUsername: payload.discordUsername,
    staffRoleId: payload.staffRoleId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(adminSecret());
}

export async function verifyVerifiedAdminToken(token: string): Promise<VerifiedAdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, adminSecret());
    if (typeof payload.discordUserId !== "string") return null;
    if (typeof payload.discordUsername !== "string") return null;
    if (payload.staffRoleId !== STAFF_ROLE_ID) return null;
    return payload as VerifiedAdminPayload;
  } catch {
    return null;
  }
}

export async function createVerifiedAdminSession(discordUserId: string, discordUsername: string): Promise<void> {
  const token = await signVerifiedAdminSession({
    discordUserId,
    discordUsername,
    staffRoleId: STAFF_ROLE_ID,
  });
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearVerifiedAdminSession(): void {
  cookies().set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getVerifiedAdminSessionFromRequest(req?: Request): Promise<VerifiedAdminPayload | null> {
  let token = cookies().get(ADMIN_COOKIE)?.value ?? null;
  if (!token && req) {
    token = parseCookieValue(req.headers.get("cookie"), ADMIN_COOKIE);
  }
  if (!token) return null;
  return verifyVerifiedAdminToken(token);
}

export async function assertVerifiedAdmin(req: Request): Promise<VerifiedAdminPayload | null> {
  if (!isAdminKeyValid(req.headers.get("x-admin-key"))) return null;
  return getVerifiedAdminSessionFromRequest(req);
}

type DiscordMemberSearchResult = {
  nick?: string | null;
  roles?: string[];
  user?: {
    id: string;
    username: string;
    discriminator?: string;
  };
};

export async function verifyAdminKeyAndDiscordStaff(discordUsername: string): Promise<
  | { ok: true; discordUserId: string; discordUsername: string }
  | { ok: false; message: string }
> {
  const guildId = CONFIG.discordGuildId?.trim();
  const botToken = CONFIG.discordBotToken?.trim();
  const query = discordUsername.trim();

  if (!botToken || !guildId) {
    return { ok: false, message: "Discord bot token atau guild ID belum dikonfigurasi." };
  }

  if (!query) {
    return { ok: false, message: "Username Discord wajib diisi." };
  }

  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/search?query=${encodeURIComponent(query)}&limit=10`,
    { headers: adminHeaders(), signal: AbortSignal.timeout(20_000) }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      message: `Gagal mencari member Discord: ${res.status}${body ? ` ${body.slice(0, 120)}` : ""}`,
    };
  }

  const members = (await res.json().catch(() => [])) as DiscordMemberSearchResult[];
  const lower = query.toLowerCase();
  const member =
    members.find((item) => item.user?.username?.toLowerCase() === lower) ??
    members.find((item) => item.nick?.toLowerCase() === lower) ??
    members[0];

  if (!member?.user?.id || !member.roles) {
    return { ok: false, message: `Member Discord "${discordUsername}" tidak ditemukan.` };
  }

  if (!member.roles.includes(STAFF_ROLE_ID)) {
    return {
      ok: false,
      message: `Akses ditolak. Username Discord ini tidak memegang role Personel Staff Pusdik (${STAFF_ROLE_ID}).`,
    };
  }

  return {
    ok: true,
    discordUserId: member.user.id,
    discordUsername: member.user.username,
  };
}

export { ADMIN_COOKIE, STAFF_ROLE_ID };