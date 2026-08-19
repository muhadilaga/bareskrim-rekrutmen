import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createVerifiedAdminSession,
  isAdminKeyValid,
  verifyAdminKeyAndDiscordStaff,
} from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/audit";

const BodySchema = z.object({
  adminKey: z.string().trim().min(1),
  discordUsername: z.string().trim().min(2).max(40),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Data verifikasi admin tidak valid." }, { status: 400 });
  }

  const { adminKey, discordUsername } = parsed.data;
  if (!isAdminKeyValid(adminKey)) {
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
