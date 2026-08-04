import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { listAdminLogs, clearAdminLogs } from "@/lib/audit";

// GET: Ambil daftar audit log admin (terbaru dulu)
export async function GET(req: Request) {
  const adminKey = req.headers.get("x-admin-key");
  if (!adminKey || adminKey !== getAdminKey()) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 50);

  const logs = await listAdminLogs(limit);
  return NextResponse.json({ ok: true, logs });
}

// DELETE: Hapus seluruh audit log (bulk)
export async function DELETE(req: Request) {
  const adminKey = req.headers.get("x-admin-key");
  if (!adminKey || adminKey !== getAdminKey()) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { count } = await clearAdminLogs();
  return NextResponse.json({ ok: true, message: `Berhasil menghapus ${count} log.` });
}
