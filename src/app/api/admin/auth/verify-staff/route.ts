import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createVerifiedAdminSession,
  isAdminKeyValid,
  verifyAdminKeyAndDiscordStaff,
} from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/audit";
import { adminAuthLimiter, clientIp } from "@/lib/rate-limit";

const BodySchema = z.object({
  adminKey: z.string().trim().min(1, "Kunci admin wajib diisi."),
  discordUsername: z.string().trim().transform(v => v.replace(/^@+/, "")).pipe(z.string().min(2, "Username / ID Discord minimal 2 karakter.").max(40)),
});

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

  const { adminKey, discordUsername } = parsed.data;
  if (!isAdminKeyValid(adminKey)) {
    await logAdminAction({
      action: "ADMIN_KEY_INVALID",
      target: discordUsername,
      detail: { reason: "Kunci admin salah." },
    }).catch(() => {});
    return NextResponse.json({ ok: false, message: "Kunci admin salah." }, { status: 401 });
  }

  const result = await verifyAdminKeyAndDiscordStaff(discordUsername);
  if (!result.ok) {
    await logAdminAction({
      action: "ADMIN_VERIFY_STAFF_DENIED",
      target: discordUsername,
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
