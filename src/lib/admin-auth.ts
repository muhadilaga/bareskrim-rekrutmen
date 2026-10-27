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
    "User-Agent": "DiscordBot (https://rekrutmen-bareskrim.com, v10)",
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
  const clean = discordUsername.trim().replace(/^@+/, "");

  if (!botToken || !guildId) {
    return { ok: false, message: "Discord bot token atau guild ID belum dikonfigurasi." };
  }

  if (!clean) {
    return { ok: false, message: "Username Discord wajib diisi." };
  }

  // Jika berupa ID Snowflake (angka 17-20 digit), langsung panggil endpoint get member by ID
  if (/^\d{17,20}$/.test(clean)) {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${clean}`, {
      headers: adminHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const member = (await res.json().catch(() => null)) as DiscordMemberSearchResult;
      if (member?.user?.id && member.roles) {
        if (!member.roles.includes(STAFF_ROLE_ID)) {
          return {
            ok: false,
            message: `Akses ditolak. Username Discord ini tidak memegang role Personel Staff Pusdik (${STAFF_ROLE_ID}).`,
          };
        }
        return {
          ok: true,
          discordUserId: member.user.id,
          discordUsername: member.user.username || clean,
        };
      }
    }
  }

  const res = await fetch(
    `${DISCORD_API}/guilds/${guildId}/members/search?query=${encodeURIComponent(clean)}&limit=10`,
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
  const lower = clean.toLowerCase();
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

export async function verifyDiscordOAuthUser(params: {
  code?: string;
  redirectUri?: string;
  accessToken?: string;
}): Promise<
  | { ok: true; discordUserId: string; discordUsername: string }
  | { ok: false; message: string }
> {
  let token = params.accessToken?.trim();

  // Jika menerima authorization code, lakukan penukaran code ke access token
  if (!token && params.code?.trim()) {
    const clientId = CONFIG.discordClientId;
    const clientSecret = CONFIG.discordClientSecret;
    const redirectUri =
      params.redirectUri?.trim() ||
      CONFIG.discordRedirectUri ||
      "https://bareskrimrbx-recruitment.my.id/admin";

    if (!clientId || !clientSecret) {
      return {
        ok: false,
        message: "Discord OAuth2 Client ID atau Client Secret belum dikonfigurasi di environment.",
      };
    }

    try {
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code: params.code.trim(),
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text().catch(() => "");
        return {
          ok: false,
          message: `Penukaran kode Discord OAuth gagal (${tokenRes.status}): ${errBody.slice(0, 100)}`,
        };
      }

      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      token = tokenJson.access_token;
    } catch (e) {
      return { ok: false, message: `Gagal menghubungi server Discord OAuth: ${String(e)}` };
    }
  }

  if (!token) {
    return { ok: false, message: "Token otorisasi Discord tidak ditemukan." };
  }

  // Ambil profil pengguna Discord resmi via /users/@me
  try {
    const meRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!meRes.ok) {
      return { ok: false, message: "Gagal memverifikasi identitas pengguna dari Discord." };
    }

    const meJson = (await meRes.json()) as { id?: string; username?: string; global_name?: string };
    if (!meJson?.id) {
      return { ok: false, message: "ID akun Discord tidak ditemukan dari respon otorisasi." };
    }

    // Verifikasi keanggotaan dan role Staf Pusdik di guild Pusdik
    return verifyAdminKeyAndDiscordStaff(meJson.id);
  } catch (e) {
    return { ok: false, message: `Gagal memverifikasi akun Discord: ${String(e)}` };
  }
}

export { ADMIN_COOKIE, STAFF_ROLE_ID };