import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { ensureSchema } from "@/lib/init-schema";
import { getLatestResult } from "@/lib/exam-service";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

const hasilLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

// Data personal: jangan pernah di-cache publik.
const NO_STORE_HEADERS: Record<string, string> = { "Cache-Control": "private, no-store" };

// TASK 03L.2E.4.4 — Hasil individual HANYA untuk kandidat dengan sesi Roblox
// terverifikasi yang MEMILIKI hasil tersebut.
//
// - Identitas diambil dari sesi server (getSessionUser), BUKAN dari body.
// - Body (username/resultId/attemptId/userId apa pun) diabaikan sepenuhnya.
// - Ownership ditegakkan dengan mengikat query ke userId tepercaya.
// - Tidak ada jalur fallback publik yang mengembalikan hasil individual.
export async function POST(req: Request) {
  const limited = hasilLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `Terlalu banyak permintaan. Coba lagi dalam ${limited.retryAfterSeconds} detik.`,
      },
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }

  try {
    await ensureSchema();

    // Autentikasi wajib: hanya sesi Roblox terverifikasi (trusted v2).
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          code: "UNAUTHORIZED",
          message: "Silakan login dengan akun Roblox Anda untuk melihat hasil ujian.",
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // TASK 03L.2E.4.5 — Fail closed untuk user yang sudah di-soft-delete.
    // JWT yang masih valid TIDAK boleh memberi akses setelah akun dihapus/di-blokir.
    // Enforcement ditempatkan di sini (bukan di getSessionUser global) agar tidak
    // mengubah perilaku autentikasi endpoint lain. Tidak ada query hasil dijalankan.
    if (user.deletedAt) {
      return NextResponse.json(
        {
          ok: false,
          code: "ACCOUNT_DISABLED",
          message: "Akun Anda tidak aktif. Hubungi instruktur.",
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // Ownership: terikat pada userId dari SESI TERVERIFIKASI. Username/ID yang
    // dikirim klien tidak pernah dipakai untuk menentukan pemilik hasil.
    const result = await getLatestResult(user.id);
    if (!result) {
      // Pesan generik: tidak membedakan "user tidak ada" vs "belum ada hasil",
      // sehingga tidak menjadi oracle keberadaan user/hasil lain.
      return NextResponse.json(
        {
          ok: false,
          code: "NO_RESULT",
          message: "Belum ada hasil ujian untuk akun Anda.",
        },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        result: {
          id: result.id,
          score: result.score,
          maxScore: result.maxScore,
          mcqScore: result.mcqScore,
          essayScore: result.essayScore,
          status: result.status,
          passed: result.passed,
          kkm: result.attempt.period.passThreshold ?? 75,
          submittedAt: result.submittedAt.toISOString(),
          // TIDAK pernah membocorkan jawaban/kunci lewat endpoint ini.
          answersJson: [],
          // Minimalkan data: cukup field yang dipakai ResultCard. Tidak ada PII
          // (displayName/username/robloxId/avatarUrl) atau ID internal attempt.
          attempt: {
            user: { policeGroupRank: result.attempt.user.policeGroupRank },
            period: { name: result.attempt.period.name },
          },
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json(
        {
          ok: false,
          code: "DB_NOT_READY",
          message: "Database belum diinisialisasi. Hubungi instruktur.",
        },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    console.error("hasil error", e);
    return NextResponse.json(
      { ok: false, message: "Terjadi kesalahan server. Coba lagi." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
