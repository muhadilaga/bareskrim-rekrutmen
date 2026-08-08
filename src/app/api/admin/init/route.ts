import { NextResponse } from "next/server";
import { initSchema, schemaExists } from "@/lib/init-schema";
import { getAdminKey } from "@/lib/constants";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

// Cek status database (apakah tabel sudah dibuat)
export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }
  const initialized = await schemaExists();
  return NextResponse.json({ ok: true, initialized });
}

// Inisialisasi / perbaiki schema database (idempoten)
export async function POST(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }
  try {
    await initSchema();
    const initialized = await schemaExists();
    return NextResponse.json({
      ok: true,
      initialized,
      message: initialized
        ? "Database berhasil diinisialisasi. Sekarang tambahkan soal & buka periode."
        : "Masih ada masalah koneksi ke database. Periksa DATABASE_URL.",
    });
  } catch (e) {
    console.error("init schema error", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Gagal inisialisasi database. Periksa log." },
      { status: 500 }
    );
  }
}
