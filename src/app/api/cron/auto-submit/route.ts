import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONFIG, getAdminKey } from "@/lib/constants";
import { finalizeExamAttempt } from "@/lib/exam-service";

export const dynamic = "force-dynamic";

/**
 * TASK 03L.2E.4.10B — Pengamanan cron auto-submit & shared finalizer recovery.
 *
 * Menggunakan finalizeExamAttempt bersama jalur submit peserta:
 *  - Evaluasi Candidate Guard (User aktif, non-matraBlocked, Application DITERIMA)
 *  - Grading deterministik
 *  - Rekonsiliasi ExamResult dan ExamAnswer (mencegah penimpaan diam-diam)
 *  - Conditional update pada submittedAt (hanya jika null, timestamp lama tidak tertimpa)
 *  - Recovery attempt gagal parsial tanpa membuat result duplikat
 */

// Ukuran satu batch pemrosesan. Mencegah `findMany` tanpa batas yang
// memuat SELURUH attempt kedaluwarsa beserta relasinya ke memori.
const AUTO_SUBMIT_BATCH_SIZE = 50;

// Plafon jumlah batch per pemanggilan. Menjamin forward progress: walau
// semua attempt gagal diproses, loop pasti berhenti.
const MAX_AUTO_SUBMIT_BATCHES = 20;

/**
 * Pemeriksaan autentikasi tingkat route — pola identik dengan yang sudah
 * dipakai `src/app/api/cron/discord-retry/route.ts`. Nilai key TIDAK pernah
 * dicatat, dibandingkan dengan logging, maupun diekspos ke respons.
 */
function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

export async function GET(req: Request) {
  // TASK 03L.2E.4.10B-SEC — Gerbang auth SEBELUM query/mutasi DB apa pun.
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const graceMs = 5 * 60_000;
  // Cutoff dihitung SATU KALI di luar loop: kalau dihitung ulang per batch,
  // attempt bisa masuk/keluar result set di tengah paginasi dan cursor
  // kehilangan posisi (baris terlewat atau diproses dua kali).
  const cutoff = new Date(now.getTime() - CONFIG.examDurationMinutes * 60_000 - graceMs);

  let processed = 0;
  let failed = 0;
  let cursor: string | undefined;

  for (let batch = 0; batch < MAX_AUTO_SUBMIT_BATCHES; batch++) {
    let expiredAttempts: Array<{
      id: string;
      questionsJson: unknown;
      period: { passThreshold: number | null };
      answers: Array<{ questionId: string; answer: string | null }>;
    }>;

    try {
      expiredAttempts = await prisma.examAttempt.findMany({
        where: {
          submittedAt: null,
          startedAt: { lt: cutoff },
          // TASK 03L.2E.4.10B-SEC (E) — filter soft-delete sesuai relasi
          // Prisma yang sebenarnya. `ExamAttempt.deletedAt` (prisma/schema.prisma:151)
          // dan `ExamPeriod.deletedAt` (:101) keduanya ada dan ter-indeks.
          //
          // SENGAJA TIDAK memfilter `period.isActive` / `isExamOpen` /
          // `recruitmentPeriodId` — itu keputusan kebijakan bisnis historis
          // (10A Q3–Q6) dan TIDAK boleh diasumsikan di task ini.
          deletedAt: null,
          period: { deletedAt: null },
          // TASK 03L.2E.4.10B — Mitigasi taktis anti-starvation: kecualikan
          // kandidat yang akunnya soft-deleted atau diblokir matra.
          // CATATAN: `BlacklistEntry` tidak memiliki relasi foreign-key ke `User`
          // di prisma/schema.prisma, sehingga tidak dapat disaring via relasi ini.
          // Relasi Application juga sengaja TIDAK disaring parsial karena korelasi
          // recruitmentPeriodId tidak didukung secara aman oleh Prisma findMany.
          user: {
            deletedAt: null,
            matraBlocked: false,
          },
        },
        // TASK 03L.2E.4.10B-SEC (D) — `user` dihapus: tidak pernah dibaca
        // oleh grading maupun response di route ini. `period` dipakai untuk
        // `passThreshold`, `answers` untuk rekonstruksi jawaban.
        include: { period: true, answers: true },
        // Paginasi kursor pada `id` (primary key) memberi urutan deterministik.
        // Cursor SELALU maju melewati attempt yang gagal diproses, sehingga
        // attempt yang sama tidak diambil berulang dalam satu pemanggilan dan
        // loop tidak pernah tanpa kemajuan.
        orderBy: { id: "asc" },
        take: AUTO_SUBMIT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    } catch (e) {
      // Cursor bisa hilang bila attempt terakhir dihapus admin di antara batch.
      // Hentikan pemrosesan dengan rapi daripada gagalkan seluruh pemanggilan.
      console.error("Auto-submit: gagal mengambil batch attempt:", e);
      break;
    }

    if (expiredAttempts.length === 0) break;

    for (const attempt of expiredAttempts) {
      try {
        const finalizeRes = await finalizeExamAttempt({
          attempt: attempt as never,
          callerSource: "CRON",
          now,
          passThreshold: attempt.period?.passThreshold ?? CONFIG.kkm,
          checkCandidateEligibility: true,
        });

        if (finalizeRes.ok) {
          processed++;
          if (finalizeRes.status === "ALREADY_COMPLETED_ELSEWHERE") {
            console.log(
              `Auto-submit: attempt ${attempt.id} already completed elsewhere and verified consistent.`,
            );
          }
        } else {
          failed++;
          console.error(
            `Auto-submit failed for attempt ${attempt.id} [${finalizeRes.code}]: ${finalizeRes.message}`,
          );
        }
      } catch (e) {
        failed++;
        console.error(`Auto-submit failed for attempt ${attempt.id}:`, e);
      }
    }

    cursor = expiredAttempts[expiredAttempts.length - 1]!.id;

    if (expiredAttempts.length < AUTO_SUBMIT_BATCH_SIZE) break;
  }

  return NextResponse.json({
    ok: true,
    message: `Auto-submit selesai. ${processed} attempt diproses, ${failed} gagal.`,
    processed,
    failed,
  });
}