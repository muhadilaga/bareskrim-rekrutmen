import { NextResponse } from "next/server";
import {
  clearVerifiedAdminSession,
  getVerifiedAdminSessionFromRequest,
  isAdminKeyValid,
} from "@/lib/admin-auth";

export async function GET(req: Request) {
  if (!isAdminKeyValid(req.headers.get("x-admin-key"))) {
    return NextResponse.json({ ok: false, verified: false, message: "Kunci admin salah." }, { status: 401 });
  }

  const session = await getVerifiedAdminSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: true, verified: false });
  }

  return NextResponse.json({
    ok: true,
    verified: true,
    verifiedAdmin: {
      discordUserId: session.discordUserId,
      discordUsername: session.discordUsername,
      staffRoleId: session.staffRoleId,
    },
  });
}

export async function DELETE() {
  clearVerifiedAdminSession();
  return NextResponse.json({ ok: true, message: "Sesi admin terverifikasi dibersihkan." });
}
