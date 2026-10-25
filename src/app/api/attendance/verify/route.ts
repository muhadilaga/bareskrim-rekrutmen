import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      code: "LEGACY_ATTENDANCE_DISABLED",
      message: "Fitur verifikasi absensi legacy telah dinonaktifkan. Silakan gunakan portal absensi resmi.",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
