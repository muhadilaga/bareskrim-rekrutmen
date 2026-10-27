import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createVerifiedAdminSession,
  isAdminKeyValid,
  verifyAdminKeyAndDiscordStaff,
  verifyDiscordOAuthUser,
} from "@/lib/admin-auth";
import { CONFIG } from "@/lib/constants";
import { logAdminAction } from "@/lib/audit";
import { adminAuthLimiter, clientIp } from "@/lib/rate-limit";

const BodySchema = z
  .object({
    adminKey: z.string().trim().min(1, "Kunci admin wajib diisi."),
    checkKeyOnly: z.boolean().optional(),
    discordAccessToken: z.string().trim().optional(),
    code: z.string().trim().optional(),
    redirectUri: z.string().trim().optional(),
    discordUsername: z
      .string()
      .trim()
      .transform((v) => v.replace(/^@+/, ""))
      .pipe(z.string().min(2, "Username / ID Discord minimal 2 karakter.").max(40))
      .optional(),
  })
  .refine(
    (data) =>
      data.checkKeyOnly === true ||
      Boolean(data.discordAccessToken) ||
      Boolean(data.code) ||
      Boolean(data.discordUsername),
    {
      message: "Data verifikasi admin tidak valid.",
    }
  );

export async function GET() {
  return NextResponse.json({
    ok: true,
    clientId: CONFIG.discordClientId || "",
  });
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = adminAuthLimiter.check(ip);
  if (!limit.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `Terlalu banyak percobaan masuk admin. Akses dibatasi sementara selama ${Math.ceil(limit.retryAfterSeconds / 60)} menit.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Data verifikasi admin tidak valid." }, { status: 400 });
  }

  const { adminKey, checkKeyOnly, discordAccessToken, code, redirectUri, discordUsername } = parsed.data;

  if (!isAdminKeyValid(adminKey)) {
    await logAdminAction({
      action: "ADMIN_KEY_INVALID",
      target: discordUsername || "instruktur",
      detail: { reason: "Kunci admin salah." },
    }).catch(() => {});
    return NextResponse.json({ ok: false, message: "Kunci admin salah." }, { status: 401 });
  }

  // Tahap 1 saja (pengecekan kunci sebelum ke tahap Discord)
  if (checkKeyOnly) {
    return NextResponse.json({
      ok: true,
      message: "Kunci keamanan instruktur valid.",
      clientId: CONFIG.discordClientId || "",
    });
  }

  // Tahap 2: Otorisasi resmi via Discord OAuth2
  let result:
    | { ok: true; discordUserId: string; discordUsername: string }
    | { ok: false; message: string };

  if (discordAccessToken || code) {
    result = await verifyDiscordOAuthUser({
      accessToken: discordAccessToken,
      code,
      redirectUri,
    });
  } else if (discordUsername) {
    result = await verifyAdminKeyAndDiscordStaff(discordUsername);
  } else {
    return NextResponse.json({ ok: false, message: "Data verifikasi admin tidak valid." }, { status: 400 });
  }

  if (!result.ok) {
    await logAdminAction({
      action: "ADMIN_VERIFY_STAFF_DENIED",
      target: discordUsername || "discord_oauth",
      detail: { reason: result.message, staffRoleId: "1471794305499664426" },
    });
    return NextResponse.json({ ok: false, message: result.message }, { status: 403 });
  }

  await createVerifiedAdminSession(result.discordUserId, result.discordUsername);
  await logAdminAction({
    action: "ADMIN_VERIFY_STAFF_GRANTED",
    target: result.discordUsername,
    detail: { discordUserId: result.discordUserId, staffRoleId: "1471794305499664426" },
  });

  return NextResponse.json({
    ok: true,
    message: "Verifikasi admin berhasil.",
    verifiedAdmin: {
      discordUserId: result.discordUserId,
      discordUsername: result.discordUsername,
    },
  });
}
