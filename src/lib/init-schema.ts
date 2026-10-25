// ============================================================
// LEGACY SCHEMA GUARD (TASK 03G)
// Prisma Migrate adalah penulis skema TUNGGAL Bareskrim V2
// (docs/v2/11-PRISMA-MIGRATION-STRATEGY.md).
//
// Modul ini KINI HANYA melakukan verifikasi read-only:
// - ensureSchema(): memeriksa kesiapan schema V2 (14 tabel +
//   kolom kritis Application/RecruitmentPeriod). Jika belum
//   siap → error jelas SCHEMA_NOT_READY. TIDAK PERNAH DDL
//   (CREATE/ALTER/DROP).
// - initSchema(): DINONAKTIFKAN — melempar error. Legacy SQL
//   dipertahankan di prisma/init.sql sebagai referensi dokumentasi,
//   tidak pernah dieksekusi oleh aplikasi.
//
// Deteksi kesiapan TIDAK memakai keberadaan tabel riwayat
// migrasi (migration history) saja — memeriksa seluruh tabel
// & kolom kritis schema V2 yang diharapkan.
// ============================================================

import { prisma } from "@/lib/prisma";

// 15 tabel wajib hasil initial migration (TASK 03F + 03G.1).
const EXPECTED_TABLES = [
  "User",
  "ExamPeriod",
  "Question",
  "ExamAttempt",
  "ExamAnswer",
  "ExamResult",
  "BlacklistEntry",
  "VerdictEntry",
  "Attendance",
  "AdminLog",
  "StudentActionLog",
  "PendingDiscordReport",
  "RecruitmentPeriod",
  "Application",
  "RuntimeSetting",
] as const;

// Kolom kritis per tabel — mendeteksi schema parsial yang
// "tabelnya ada tapi kolom pendaftaran belum".
const EXPECTED_COLUMNS: Record<string, string[]> = {
  Application: [
    "id",
    "recruitmentPeriodId",
    "registrationId",
    "accessTokenHash",
    "robloxUsernameKey",
    "status",
  ],
  RecruitmentPeriod: ["id", "code", "openedAt", "closedAt", "isActive"],
  RuntimeSetting: ["key", "value", "updatedAt"],
};

export type SchemaStatus = {
  ready: boolean;
  /** Nama tabel/kolom yang belum ada (kosong bila ready). */
  missing: string[];
};

// ============================================================
// Verifikasi read-only terhadap information_schema.
// Tidak ada CREATE/ALTER/DROP apa pun di modul ini.
// Jika database tidak dapat diakses → dianggap BELUM SIAP
// (bukan "sehat"), agar tidak ada mekanisme yang diam-diam
// menganggap database baik-baik saja.
// ============================================================
export async function checkSchemaStatus(): Promise<SchemaStatus> {
  try {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const present = new Set(tables.map((t) => t.table_name));
    const missing: string[] = [];
    for (const t of EXPECTED_TABLES) {
      if (!present.has(t)) missing.push(t);
    }

    // Cek kolom kritis hanya untuk tabel yang sudah ada.
    const wanted = Object.entries(EXPECTED_COLUMNS)
      .filter(([t]) => present.has(t))
      .flatMap(([t, cols]) => cols.map((c) => `('${t}','${c}')`))
      .join(",");
    if (wanted) {
      const cols = await prisma.$queryRawUnsafe<
        Array<{ table_name: string; column_name: string }>
      >(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND (table_name, column_name) IN (${wanted})`
      );
      const have = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`));
      for (const [t, cs] of Object.entries(EXPECTED_COLUMNS)) {
        if (!present.has(t)) continue;
        for (const c of cs) {
          if (!have.has(`${t}.${c}`)) missing.push(`${t}.${c}`);
        }
      }
    }

    return { ready: missing.length === 0, missing };
  } catch {
    // DB tidak dapat diakses → belum siap (read-only, tanpa DDL).
    return { ready: false, missing: [...EXPECTED_TABLES] };
  }
}

/** Kompatibilitas lama: true hanya bila schema V2 lengkap. */
export async function schemaExists(): Promise<boolean> {
  return (await checkSchemaStatus()).ready;
}

// Guard memoized: sekali terverifikasi lengkap → tidak query ulang.
let schemaVerified = false;
let schemaPromise: Promise<void> | null = null;

// ============================================================
// ensureSchema() — kontrak BARU (TASK 03G):
// - TIDAK menjalankan statement DDL apa pun.
// - Hanya memeriksa kesiapan; throw bila schema belum lengkap.
// - Kegagalan TIDAK di-cache (retry di request berikutnya).
// ============================================================
export async function ensureSchema(): Promise<void> {
  if (schemaVerified) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const status = await checkSchemaStatus();
      if (!status.ready) {
        throw new Error(
          `SCHEMA_NOT_READY: database belum lengkap — jalankan Prisma Migrate ` +
            `(prisma migrate deploy, lihat docs/v2/11-PRISMA-MIGRATION-STRATEGY.md). ` +
            `Objek hilang: ${status.missing.join(", ")}. ` +
            `Inisialisasi otomatis dinonaktifkan di V2 (TASK 03G).`
        );
      }
      schemaVerified = true;
    })().catch((e) => {
      schemaPromise = null;
      throw e;
    });
  }
  return schemaPromise;
}

// ============================================================
// initSchema() — DINONAKTIFKAN (TASK 03G).
// DDL legacy tidak lagi dieksekusi aplikasi V2.
// prisma/init.sql tetap ada sebagai referensi dokumentasi.
// ============================================================
export async function initSchema(): Promise<never> {
  throw new Error(
    "INIT_SCHEMA_DISABLED: inisialisasi SQL legacy dinonaktifkan di V2. " +
      "Skema dikelola Prisma Migrate " +
      "(docs/v2/11-PRISMA-MIGRATION-STRATEGY.md)."
  );
}
