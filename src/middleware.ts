import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getAdminKey, getJwtSecret } from "@/lib/constants";

const ADMIN_COOKIE = "brk_admin_verified";
const STAFF_ROLE_ID = "1471794305499664426";
const PROTECTED_PREFIXES = [
  "/api/admin/",
  "/api/attendance/list",
  "/api/cron/discord-retry",
  // TASK 03L.2E.4.10B-SEC — `auto-submit` menulis `ExamResult` untuk semua
  // attempt kedaluwarsa dan sebelumnya TIDAK ada di daftar ini, sehingga tidak
  // punya satu pun gerbang. Entry ini tidak melemahkan endpoint: gerbang
  // route-level `isAdmin(req)` juga ada di route tersebut, dan middleware
  // ikut menolak pemanggilan tanpa key.
  "/api/cron/auto-submit",
];

// TASK 03L.2E.4.10B-SEC-R2 — KEY-ONLY: daftar TERPISAH untuk path yang
// memanggil database dari scheduler non-interaktif.
//
// JANGAN TERTUKAR DENGAN EXEMPT_PATHS — keduanya berkebalikan:
//   EXEMPT_PATHS → path DILOLWARKAN tanpa cek apa pun (tanpa proteksi).
//   KEY_ONLY_*   → path tetap WAJIB lolos `x-admin-key`; hanya cookie sesi
//                  admin interaktif yang dilewati.
//
// Alasan: endpoint cron dipanggil scheduler yang wajar membawa header key
// tetapi TIDAK membawa cookie `brk_admin_verified` (cookie itu bukti interaksi
// manusia di browser). Tanpa daftar ini, middleware menolak scheduler di
// lapisan cookie sehingga gate route-level tidak pernah tereksekusi.
//
// DAFTAR INI SENGAJA TIDAK MEMAKAI WILDCARD. Hanya path yang disebut eksplisit
// yang boleh melewati pemeriksaan cookie. Route cron lain — termasuk
// `/api/cron/discord-retry` — tetap memerlukan cookie + JWT seperti sebelumnya.
const KEY_ONLY_PREFIXES = [
  "/api/cron/auto-submit",
];

const EXEMPT_PATHS = new Set([
  "/api/admin/auth/verify-staff",
  "/api/admin/auth/session",
  "/api/admin/init",
]);

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// TASK 03L.2E.4.10B-SEC-R3 — Batas segmen, bukan prefix mentah.
//
// Versi sebelumnya memakai `pathname.startsWith(prefix)` polos, yang membuat
// path saudara seperti `/api/cron/auto-submit-admin`, `/api/cron/auto-submitX`,
// atau `/api/cron/auto-submitted` ikut melewati pemeriksaan cookie. Route seperti
// itu tidak ada sekarang, tetapi akan otomatis mewarisi pengecualian bila
// ditambahkan di masa depan. Pola persis di bawah menutup celah itu.
//
// POLICY TRAILING SLASH (berdasarkan implementasi, bukan asumsi runtime):
// `/api/cron/auto-submit/` diawali `/api/cron/auto-submit/` sehingga DIANGGAP
// sub-path sah. Fungsi ini murni — ia tidak tahu apa pun soal normalisasi
// request. Bila runtime Next.js ternyata menormalkan trailing slash sehingga
// pathname menjadi sama persis, hasilnya tetap sama: diizinkan. Catatan: tes
// unit TIDAK membuktikan bagaimana runtime menormalkan path.
function isKeyOnly(pathname: string) {
  return KEY_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isExempt(pathname: string) {
  return EXEMPT_PATHS.has(pathname);
}

function getSecret() {
  return new TextEncoder().encode(getJwtSecret());
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isProtected(pathname) || isExempt(pathname)) {
    return NextResponse.next();
  }

  const adminKey = req.headers.get("x-admin-key");
  if (!adminKey || adminKey !== getAdminKey()) {
    return NextResponse.json({ ok: false, message: "Kunci admin salah." }, { status: 401 });
  }

  // TASK 03L.2E.4.10B-SEC-R2 — SETELAH key valid. Path yang terdaftar eksplisit
  // di KEY_ONLY_PREFIXES boleh lanjut tanpa cookie/JWT, karena pemanggilnya
  // scheduler dan bukan browser. Gate `x-admin-key` TIDAK dilewati.
  if (isKeyOnly(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false, message: "Verifikasi admin tahap kedua wajib dilakukan." }, { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.discordUserId !== "string" ||
      typeof payload.discordUsername !== "string" ||
      payload.staffRoleId !== STAFF_ROLE_ID
    ) {
      return NextResponse.json({ ok: false, message: "Sesi admin terverifikasi tidak valid." }, { status: 401 });
    }
    return NextResponse.next();
  } catch {
    return NextResponse.json({ ok: false, message: "Sesi admin terverifikasi sudah habis atau tidak valid." }, { status: 401 });
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
