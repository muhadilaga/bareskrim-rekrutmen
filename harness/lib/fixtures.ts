import { Prisma } from "@prisma/client";

import type { Tx } from "./session";

/**
 * TASK 03L.2E4.10B — Lifecycle fixture (F-1/F-6/F-8).
 *
 * SEMUA fungsi di sini menerima `Tx` dari `runBounded`, bukan PrismaClient
 * mentah — jadi tidak ada jalur query tanpa batas waktu.
 *
 * Awas aturan data:
 *  - ID harness deterministik `t047_it_*`, allowlist eksplisit.
 *  - Pre-clean/teardown memakai DAFTAR ID PERSIS (F-8), bukan prefix/wildcard.
 *  - Baseline `t047_u1/u2`, `t047_rp1`, `t047_ep1`, `t047_app1`, `t047_att_a`
 *    tidak pernah dimutasi; `t047_ep1`/`t047_rp1` hanya dirujuk FK.
 *  - Tidak ada ExamPeriod aktif kedua (skenario statement tidak menjalankan guard).
 *  - Cleanup urutan anak -> induk, idempoten.
 */

/** ID milik harness — diz 이끌kan di bawah. */
export const HARNESS_FIXTURE_IDS = {
  user: "t047_it_u1",
  application: "t047_it_app1",
  attemptMain: "t047_it_att1",
  attemptOtherPeriod: "t047_it_att2",
  examPeriodExtra: "t047_it_ep2",
} as const;

/** FK yang DIPAKAI, milik baseline, hanya dibaca. */
export const BASELINE_REFERENCE_IDS = {
  recruitmentPeriod: "t047_rp1",
  examPeriod: "t047_ep1",
} as const;

/**
 * Allowlist teardown: hanya ID di bawah. TIDAK ada wildcard.
 * Urutan child -> parent memenuhi FK.
 */
export function teardownTargets(): ReadonlyArray<{ table: string; id: string }> {
  const f = HARNESS_FIXTURE_IDS;
  return [
    { table: "ExamAttempt", id: f.attemptMain },
    { table: "ExamAttempt", id: f.attemptOtherPeriod },
    { table: "Application", id: f.application },
    { table: "ExamPeriod", id: f.examPeriodExtra },
    { table: "User", id: f.user },
  ];
}

/**
 * Nama tabel berasal dari allowlist di atas (konstanta), bukan input user —
 * jadi aman memakai `Prisma.raw` untuk identifier tabel yang tidak bisa diparameterkan.
 */
function tableRef(table: string): Prisma.Sql {
  return Prisma.raw(`"${table}"`);
}

/**
 * Hapus sisa run sebelumnya memakai ID PERSIS. Idempoten (count 0 jika absen).
 * Dijalankan pada sesi bootstrap, setelah identity terverifikasi.
 */
export async function preCleanFixture(tx: Tx): Promise<Array<{ id: string; removed: number }>> {
  const out: Array<{ id: string; removed: number }> = [];
  for (const { table, id } of teardownTargets()) {
    const removed = await tx.$executeRaw(
      Prisma.sql`DELETE FROM ${tableRef(table)} WHERE id = ${id}`
    );
    out.push({ id, removed });
  }
  return out;
}

/** Rows fixture lengkap (F-6) — semua kolom NOT NULL tanpa default diisi. */
export const FIXTURE_ROWS = {
  user: {
    id: HARNESS_FIXTURE_IDS.user,
    robloxId: 9_047_001n,
    username: "t047_it_casis_1",
    displayName: "T047 IT Casis 1",
  },
  examPeriodExtra: {
    id: HARNESS_FIXTURE_IDS.examPeriodExtra,
    name: "T047 IT Periode Tambahan",
    seed: 4_700_099,
    isActive: false,
  },
  application: {
    id: HARNESS_FIXTURE_IDS.application,
    recruitmentPeriodId: BASELINE_REFERENCE_IDS.recruitmentPeriod,
    registrationId: "T047-IT-000001",
    accessTokenHash: "t047_it_hash_1",
    fullName: "T047 IT Casis 1",
    robloxUsername: "t047_it_casis_1",
    robloxUsernameKey: "t047_it_casis_1",
    discordId: "t047_it_discord_1",
    birthDate: "2000-01-01",
    gender: "L",
    origin: "T047",
    experience: "none",
    motivation: "none",
    // A-1: WAJIB eksplisit. Default schema adalah MENUNGGU_VERIFIKASI,
    // sehingga tanpa kolom ini guard `a.status = 'DITERIMA'` tidak akan
    // pernah cocok dan SEMUA skenario akan salah menyimpulkan.
    status: "DITERIMA" as const,
  },
  attemptMain: {
    id: HARNESS_FIXTURE_IDS.attemptMain,
    periodId: BASELINE_REFERENCE_IDS.examPeriod,
    userId: HARNESS_FIXTURE_IDS.user,
    attemptKey: "t047_it_key_att1",
  },
  attemptOtherPeriod: {
    id: HARNESS_FIXTURE_IDS.attemptOtherPeriod,
    periodId: HARNESS_FIXTURE_IDS.examPeriodExtra,
    userId: HARNESS_FIXTURE_IDS.user,
    attemptKey: "t047_it_key_att2",
  },
} as const;

/**
 * Seed fixture lengkap. Dijalankan pada `Tx` dari runBounded (bootstrap).
 * FK diperiksa berurutan agar tidak melanggar constraint.
 */
export async function seedFixture(tx: Tx): Promise<void> {
  const u = FIXTURE_ROWS.user;
  const ep = FIXTURE_ROWS.examPeriodExtra;
  const app = FIXTURE_ROWS.application;
  const am = FIXTURE_ROWS.attemptMain;
  const ao = FIXTURE_ROWS.attemptOtherPeriod;

  // User: updatedAt NOT NULL tanpa default -> harus diisi.
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "User" (id, "robloxId", username, "displayName", "updatedAt")
    VALUES (${u.id}, ${u.robloxId}, ${u.username}, ${u.displayName}, now())
  `);

  // ExamPeriod tambahan (tidak aktif) — untuk skenario period mismatch.
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ExamPeriod" (id, name, seed, "isActive")
    VALUES (${ep.id}, ${ep.name}, ${ep.seed}, ${ep.isActive})
  `);

  // Application: updatedAt NOT NULL tanpa default -> diisi.
  // status juga diisi EKSPLISIT (A-1) sebagai parameter, bukan literal SQL.
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "Application" (id, "recruitmentPeriodId", "registrationId", "accessTokenHash",
                               "fullName", "robloxUsername", "robloxUsernameKey", "discordId",
                               "birthDate", gender, origin, experience, motivation,
                               "userId", status, "updatedAt")
    VALUES (${app.id}, ${app.recruitmentPeriodId}, ${app.registrationId}, ${app.accessTokenHash},
            ${app.fullName}, ${app.robloxUsername}, ${app.robloxUsernameKey}, ${app.discordId},
            ${app.birthDate}, ${app.gender}, ${app.origin}, ${app.experience}, ${app.motivation},
            ${u.id}, ${app.status}, now())
  `);

  // ExamAttempt: questionsJson NOT NULL tanpa default -> diisi. submittedAt/deletedAt NULL.
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ExamAttempt" (id, "periodId", "userId", "attemptKey", "questionsJson")
    VALUES (${am.id}, ${am.periodId}, ${am.userId}, ${am.attemptKey}, '[]'::jsonb)
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ExamAttempt" (id, "periodId", "userId", "attemptKey", "questionsJson")
    VALUES (${ao.id}, ${ao.periodId}, ${ao.userId}, ${ao.attemptKey}, '[]'::jsonb)
  `);
}

/** Verifikasi bahwa fixture harness tidak tersisa (harus semua 0). */
export async function verifyNoFixtureRemains(tx: Tx): Promise<Record<string, number>> {
  const rows = (await tx.$queryRaw(Prisma.sql`
    SELECT
      (SELECT count(*) FROM "ExamAttempt" WHERE id = ${HARNESS_FIXTURE_IDS.attemptMain})         AS main_attempt,
      (SELECT count(*) FROM "ExamAttempt" WHERE id = ${HARNESS_FIXTURE_IDS.attemptOtherPeriod})  AS other_attempt,
      (SELECT count(*) FROM "Application" WHERE id = ${HARNESS_FIXTURE_IDS.application})         AS application,
      (SELECT count(*) FROM "ExamPeriod"  WHERE id = ${HARNESS_FIXTURE_IDS.examPeriodExtra})     AS exam_period,
      (SELECT count(*) FROM "User"        WHERE id = ${HARNESS_FIXTURE_IDS.user})                AS "user"
  `)) as Array<Record<string, number>>;
  return rows[0] ?? {};
}

/**
 * Catatan jujur soal pemulihan (F-1): bila setup gagal di tengah SEED,
 * `afterAll` tetap berjalan dan pre-clean menutup sisa parsial karena
 * idempoten + ID-persis. Bila cleanup itu sendiri gagal, exception naik dan
 * sisa mungkin tertinggal — dipulihkan oleh pre-clean run berikutnya.
 * `finally` TIDAK menjamin apa-apa bila proses dibunuh paksa.
 */
export const CLEANUP_LIMITATION =
  "pre-clean idempoten menutup setup parsial; bila proses dibunuh paksa, pemulihan bergantung pada pre-clean run berikutnya (bukan jaminan).";