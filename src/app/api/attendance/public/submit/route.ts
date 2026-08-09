import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Endpoint absensi public lama sudah dinonaktifkan. Gunakan alur verifikasi Roblox di halaman /absen.",
    },
    { status: 410 }
  );
}
