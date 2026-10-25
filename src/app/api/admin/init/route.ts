import { NextResponse } from "next/server";
import { checkSchemaStatus } from "@/lib/init-schema";
import { getAdminKey } from "@/lib/constants";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

// ============================================================
// /api/admin/init — DIAGNOSTIC READ-ONLY (TASK 03G).
// Endpoint ini TIDAK menjalankan SQL inisialisasi legacy.
// Skema dikelola Prisma Migrate (docs/v2/11).
// GET  : status kesiapan schema (read-only).
// POST : dinonaktifkan — 410 Gone + status saat ini.
// Respons hanya berisi nama objek yang hilang (cukup untuk
// diagnosa admin) — bukan struktur database sensitif.
// ============================================================

// Cek status database (read-only, tanpa DDL)
export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }
  const status = await checkSchemaStatus();
  return NextResponse.json({
    ok: true,
    initialized: status.ready,
    missing: status.missing,
  });
}

// Inisialisasi legacy DINONAKTIFKAN (TASK 03G) — tidak ada DDL.
export async function POST(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }
  const status = await checkSchemaStatus();
  return NextResponse.json(
    {
      ok: false,
      initialized: status.ready,
      missing: status.missing,
      message: status.ready
        ? "Database sudah siap (Prisma Migrate). Inisialisasi SQL legacy dinonaktifkan di V2."
        : "Database belum lengkap. Jalankan Prisma Migrate (prisma migrate deploy). " +
          "Inisialisasi SQL legacy dinonaktifkan di V2.",
    },
    { status: 410 }
  );
}
