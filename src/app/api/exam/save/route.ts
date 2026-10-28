import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, saveLimiter } from "@/lib/rate-limit";
import {
  requireCurrentCandidateEligibility,
  assertEligibilityStillValid,
  type CandidateEligibilityContext,
} from "@/lib/candidate-guard";
import { candidateGuardErrorResponse } from "@/lib/guard-response";

const SaveSchema = z.object({
  attemptId: z.string().min(1),
  answers: z.record(z.string(), z.string()).optional(),
  flaggedQuestions: z.array(z.string()).optional(),
  bookmarkedQuestions: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  // Rate limit berbasis user.id (fallback IP) agar banyak casis di satu Wi-Fi tidak saling blokir
  const rateLimitKey = user?.id ? `user:${user.id}` : clientIp(req);
  const limited = saveLimiter.check(rateLimitKey);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, message: "Terlalu banyak permintaan save." },
      { status: 429 }
    );
  }

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

  // TASK 03L.2E.4.2 — Candidate Guard: simpan jawaban hanya untuk calon DITERIMA.
  // Dijalankan SEBELUM setiap tulis ke ExamAttempt.
  // TASK 03L.2E.4.6 — ctx disimpan untuk pemeriksaan final di batas penulisan.
  let ctx: CandidateEligibilityContext;
  try {
    ctx = await requireCurrentCandidateEligibility(prisma, user);
  } catch (err) {
    const guardResponse = candidateGuardErrorResponse(err);
    if (guardResponse) return guardResponse;
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Payload tidak valid." },
      { status: 400 }
    );
  }

  // TASK 03L.2E.4.10B-SQL — `deletedAt IS NULL` ikut pada pembacaan awal.
  // Sebelumnya `findUnique({ where: { id } })` tanpa filter soft-delete, dan
  // penulisan juga tidak memfilternya — sehingga attempt yang sudah
  // soft-deleted masih bisa menerima jawaban tersimpan. Pola
  // `findFirst({ id, deletedAt: null })` sudah dipakai
  // `requireOwnedHistoricalResource` (candidate-guard.ts:401).
  const attempt = await prisma.examAttempt.findFirst({
    where: { id: parsed.data.attemptId, deletedAt: null },
  });

  if (!attempt || attempt.userId !== user.id) {
    return NextResponse.json(
      { ok: false, message: "Sesi ujian tidak ditemukan." },
      { status: 404 }
    );
  }

  if (attempt.submittedAt) {
    return NextResponse.json(
      { ok: false, message: "Ujian sudah dikumpulkan." },
      { status: 409 }
    );
  }

  // Batasi ukuran: maks 50 pasang jawaban, max 4000 char per jawaban
  const entries = Object.entries(parsed.data.answers ?? {}).slice(0, 50);
  const sanitized: Record<string, string> = {};
  for (const [k, v] of entries) {
    sanitized[k] = String(v).slice(0, 4000);
  }

  // TASK 03L.2E.4.6 — Pemeriksaan final di batas penulisan: jika kelayakan
  // berubah (DITERIMA -> DITOLAK / Application di-soft-delete) selama request,
  // jangan menulis. Dipertahankan (kebijakan eligibility tidak diubah pada
  // task ini); statement atomik di bawah kini menjadi pengaman kedua yang
  // benar-benar menyerialkan, sehingga pemeriksaan ini tidak lagi jadi
  // satu-satunya pagar.
  try {
    await assertEligibilityStillValid(prisma, ctx);
  } catch (err) {
    const guardResponse = candidateGuardErrorResponse(err);
    if (guardResponse) return guardResponse;
    throw err;
  }

  // TASK 03L.2E.4.10B-SQL — Penulisan ATOMIK satu statement.
  //
  // Semua nilai dinamis (id, JSON, user id) diikat sebagai PARAMETER lewat
  // `Prisma.sql`. Tidak ada interpolasi string. Nama tabel/kolom static.
  //
  // Bentuk SET dirakit dari fragmen STATIS; kolom opsional hanya ikut bila
  // memang dikirim — identik dengan semantik `updateData` sebelumnya.
  const setFragments: Prisma.Sql[] = [
    Prisma.sql`"savedAnswers" = ${JSON.stringify(sanitized)}::jsonb`,
  ];
  if (parsed.data.flaggedQuestions) {
    setFragments.push(
      Prisma.sql`"flaggedQuestions" = ${JSON.stringify(parsed.data.flaggedQuestions)}::jsonb`,
    );
  }
  if (parsed.data.bookmarkedQuestions) {
    setFragments.push(
      Prisma.sql`"bookmarkedQuestions" = ${JSON.stringify(parsed.data.bookmarkedQuestions)}::jsonb`,
    );
  }

  // `FOR UPDATE OF a` — mengunci HANYA baris Application. RecruitmentPeriod
  // sengaja TIDAK dikunci: audit menemukan TIDAK ADA writer produksi untuk
  // `RecruitmentPeriod.deletedAt`, jadi predicate di bawah cukup untuk
  // menjaga aturan guard. Jika suatu saat writer ditambahkan, predicate ini
  // menjadi snapshot-basi dan WAJIB diaudit ulang (lihat laporan).
  //
  // Bukti (PostgreSQL 18.6): pola `WITH ... AS MATERIALIZED (... FOR UPDATE)`
  // + write dependen terbukti menyerialkan terhadap revokasi
  // (revocation-first -> 0 baris; save-first -> revoker menunggu).
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH elig AS MATERIALIZED (
        SELECT a.id
          FROM "Application" a
          JOIN "RecruitmentPeriod" rp ON rp.id = a."recruitmentPeriodId"
         WHERE a.id                       = ${ctx.application.id}
           AND a."userId"                = ${user.id}
           AND a.status                  = 'DITERIMA'
           AND a."deletedAt"             IS NULL
           AND a."recruitmentPeriodId"   = ${ctx.examPeriod.recruitmentPeriodId}
           AND rp."deletedAt"            IS NULL
           FOR UPDATE OF a
      )
      UPDATE "ExamAttempt" att
         SET ${Prisma.join(setFragments, ", ")}
       WHERE att.id           = ${attempt.id}
         AND att."userId"     = ${user.id}
         AND att."periodId"   = ${ctx.examPeriod.id}
         AND att."submittedAt" IS NULL
         AND att."deletedAt"   IS NULL
         AND EXISTS (SELECT 1 FROM elig)
      RETURNING att.id
    `);

    // `att.id` adalah PRIMARY KEY, jadi >1 baris mustahil. Cabang ini tetap
    // ditulis sebagai pagar invariant.
    if (rows.length > 1) {
      console.error("[exam/save] invariant violation: expected at most 1 row, got", rows.length);
      return NextResponse.json(
        { ok: false, message: "Gagal menyimpan jawaban." },
        { status: 500 },
      );
    }

    // 0 baris = attempt sudah disubmit / soft-deleted, atau kelayakan sudah
    // berubah, atau attempt bukan milik user ini. Fail-closed: JANGAN sukses.
    // Pesan sengaja sama dengan jalur cepat `submittedAt` dan tidak menyebut
    // Application/eligibility, sehingga tidak membocorkan penyebabnya.
    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Ujian sudah dikumpulkan." },
        { status: 409 },
      );
    }
  } catch (err) {
    // Fail-closed: error query TIDAK diubah jadi sukses, dan TIDAK diretry
    // buta. Logger hanya mencatat kategori error, tanpa nilai request.
    console.error("[exam/save] atomic save failed:", err instanceof Error ? err.name : "unknown");
    throw err;
  }

  return NextResponse.json({ ok: true });
}
