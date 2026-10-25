import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { getSiteContent, updateSiteContent } from "@/lib/site-content";
import { logAdminAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function isAdmin(req: Request): Promise<boolean> {
  if (req.headers.get("x-admin-key") !== getAdminKey()) return false;
  const { assertVerifiedAdmin } = await import("@/lib/admin-auth");
  return !!(await assertVerifiedAdmin(req));
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  try {
    const content = await getSiteContent();
    return NextResponse.json({ ok: true, content });
  } catch (error) {
    console.error("GET /api/admin/content-settings error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal mengambil pengaturan konten." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, message: "Payload tidak valid." }, { status: 400 });
    }

    const updated = await updateSiteContent(body);

    const { assertVerifiedAdmin } = await import("@/lib/admin-auth");
    const verified = await assertVerifiedAdmin(req);
    await logAdminAction({
      action: "UPDATE_SITE_CONTENT",
      target: "RuntimeSetting:site_content",
      detail: {
        staff: verified?.discordUsername ?? "unknown",
        keysUpdated: Object.keys(body),
      },
    });

    return NextResponse.json({ ok: true, content: updated });
  } catch (error) {
    console.error("POST /api/admin/content-settings error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal menyimpan pengaturan konten." },
      { status: 500 }
    );
  }
}
