import { Prisma } from "@prisma/client";

/**
 * Pemetaan parameter untuk capture-and-replay.
 *
 * MASALAH YANG DISOLUSIKAN: urutan `values` pada `Prisma.Sql` BERGESER
 * mengikuti jumlah fragmen SET. Dengan 1 fragmen `attemptId` ada di indeks 4;
 * dengan 3 fragmen ia bergeser ke indeks 6. Rebind berbasis indeks konstanta
 * akan diam-diam menulis nilai ke parameter yang salah.
 *
 * SOLUSI: indeks TIDAK pernah ditulis tangan. Ia diturunkan dari teks SQL
 * hasil `inspect()` dengan mengenali kata kunci tepat sebelum placeholder.
 * Kalau struktur SQL berubah, pemetaan ikut berubah atau gagal keras —
 * bukan diam-diam salah.
 */

/** Kunci semantik -> indeks nilai (0-based). */
export type ParamMap = Record<string, number>;

/**
 * Klasifikasi harus diuji dari yang SPESIFIK ke yang umum.
 * Contoh: `att."userId"` tidak boleh tertangkap rule `a."userId"`.
 *
 * Pola diuji terhadap teks yang berada TEPAT SEBELUM placeholder, yaitu
 * teks yang diakhiri tanda `=` — bukan yang memuat `:N`.
 */
const CLASSIFIERS: ReadonlyArray<{ key: string; pattern: RegExp }> = [
  { key: "attemptUserId", pattern: /att\."userId"\s+=\s*$/ },
  { key: "attemptPeriodId", pattern: /att\."periodId"\s+=\s*$/ },
  { key: "attemptId", pattern: /att\.id\s+=\s*$/ },
  { key: "eligibilityUserId", pattern: /a\."userId"\s+=\s*$/ },
  { key: "applicationId", pattern: /a\.id\s+=\s*$/ },
  { key: "recruitmentPeriodId", pattern: /a\."recruitmentPeriodId"\s+=\s*$/ },
  { key: "savedAnswers", pattern: /"savedAnswers"\s+=\s*$/ },
  { key: "flaggedQuestions", pattern: /"flaggedQuestions"\s+=\s*$/ },
  { key: "bookmarkedQuestions", pattern: /"bookmarkedQuestions"\s+=\s*$/ },
];

/**
 * Turunkan peta parameter dari statement ter-render.
 * Placeholder yang tidak dikenali diabaikan (mis. parameter tambahan di masa
 * depan) — `rebindSql` tetap aman karena hanya mengganti kunci yang ada.
 */
export function deriveParamMap(statement: string): ParamMap {
  const map: ParamMap = {};
  const re = /:(\d+)(?:::jsonb)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(statement)) !== null) {
    const index = Number(m[1]) - 1;
    const before = statement.slice(0, m.index);
    for (const c of CLASSIFIERS) {
      if (c.pattern.test(before)) {
        map[c.key] = index;
        break;
      }
    }
  }
  return map;
}

/**
 * Ganti nilai pada `Prisma.Sql` berdasarkan kunci semantik.
 *
 * - Struktur SQL (`strings`) TIDAK PERNAH diubah — berasal dari produksi.
 * - Hanya array `values` yang disalin dan ditimpa.
 * - Key yang tidak ada di peta akan melempar error, bukan diabaikan diam-diam.
 *
 * CATATAN RUNTIME (ditemukan lewat unit test, bukan diasumsikan):
 * `Prisma.Sql` TERDEDLARASI di `.d.ts` sebagai kelas yang bisa di-`new`,
 * tetapi di Prisma 5.22 nilainya `undefined` saat runtime — `new Prisma.Sql(...)`
 * melempar "Prisma.Sql is not a constructor". Yang benar dan sudah diuji
 * adalah `Prisma.sql(strings, ...values)` yang mempertahankan `strings` persis
 * sama. Karena itu jangan pernah memakai `new Prisma.Sql(...)` di sini.
 */
export function rebindSql(
  sql: Prisma.Sql,
  overrides: Record<string, unknown>
): Prisma.Sql {
  const { statement, values } = sql.inspect();
  const map = deriveParamMap(statement);

  const unknown = Object.keys(overrides).filter((k) => !(k in map));
  if (unknown.length > 0) {
    throw new Error(
      `rebindSql: kunci parameter tidak dikenal pada statement: ${unknown.join(", ")}. ` +
        `Struktur SQL mungkin berubah — jangan lanjutkan.`
    );
  }

  const next = [...values] as unknown[];
  for (const [key, value] of Object.entries(overrides)) {
    next[map[key]] = value;
  }
  // `strings` berasal dari Sql yang sudah jadi. `Prisma.Sql` tidak bisa di-`new`
  // di runtime; `Prisma.sql(strings, ...values)` adalah jalur yang benar.
  const strings = sql.strings as unknown as TemplateStringsArray;
  return Prisma.sql(strings, ...next);
}

/** Berapa banyak nilai yang terikat — untuk sanity check. */
export function countBoundValues(sql: Prisma.Sql): number {
  return sql.inspect().values.length;
}

/** Pastikan semua nilai terikat beripe primitif (tidak Sql/objek berlapis). */
export function assertPrimitiveValues(sql: Prisma.Sql): void {
  const { values } = sql.inspect();
  const bad = values.map((v, i) => ({ i, v })).filter(({ v }) => typeof v === "object" && v !== null);
  if (bad.length > 0) {
    throw new Error(
      `Nilai parameter non-primitif pada indeks ${bad.map((b) => b.i).join(", ")}. ` +
        `Pastikan join tidak menyisipkan objek Sql.`
    );
  }
}