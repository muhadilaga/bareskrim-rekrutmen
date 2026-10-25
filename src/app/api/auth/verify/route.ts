import { NextResponse } from "next/server";

// POST /api/auth/verify — JALUR LEGACY DINONAKTIFKAN (TASK 03L.2B.1).
// Endpoint ini sebelumnya menerbitkan cookie sesi JWT berdasarkan public
// Roblox username lookup TANPA bukti kepemilikan akun (siapa pun bisa
// mengambil sesi untuk username orang lain). Seluruh penerbitan sesi kini
// HANYA melalui Roblox OAuth 2.0/OIDC:
//   GET /api/auth/roblox/start  ->  GET /api/auth/roblox/callback
// Route ini dikonversi menjadi tombstone eksplisit tanpa:
// - penerbitan cookie/JWT apa pun
// - panggilan API Roblox
// - pembacaan/penulisan database
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      code: "LEGACY_LOGIN_DISABLED",
      message:
        "Login legacy berbasis username sudah tidak didukung. Silakan gunakan Login Roblox OAuth.",
    },
    { status: 410 }
  );
}
