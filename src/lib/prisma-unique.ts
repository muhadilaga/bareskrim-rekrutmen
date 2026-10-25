import { Prisma } from "@prisma/client";

/**
 * TASK 03L.2E.4.6 — Validasi target constraint pada P2002 (anti false-idempotensi).
 *
 * Latar belakang: handler lama hanya memeriksa `code === "P2002"` lalu langsung
 * menganggapnya race idempotensi milik operation itu sendiri. Padahal P2002 bisa
 * muncul dari constraint MANA SAJA pada model yang sama, sehingga konflik yang
 * tidak dikenal ikut ditelan sebagai "sudah berhasil / sudah absen". Helper ini
 * membuat handler wajib menyebut constraint yang BENAR-BENAR diharapkan;
 * sisanya dilempar ke jalur error yang sudah ada.
 *
 * Bentuk `err.meta?.target` pada Prisma 5.22 + PostgreSQL (Rust query engine):
 * `string[]` berisi nama kolom unique, mis. `['userId','periodId','tahap']`
 * (lihat prisma/migrations/.../init_v2_baseline: CREATE UNIQUE INDEX). Bentuk
 * scalar `string` (nama index/constraint Postgres, mis. `name_code_idx`) tidak
 * dihasilkan engine ini, tetapi terjadi pada adapter lain / versi lain; keduanya
 * didukung supaya pemeriksaan tidak jadi false-negative. `target` yang hilang,
 * bukan string, atau array non-string dianggap TIDAK COCOK (fail closed).
 */

export interface ExpectedUniqueConstraint {
  /** Nama kolom unique seperti dilaporkan Prisma (`meta.target` bentuk array). */
  fields: readonly string[];
  /**
   * Nama unique index/constraint di Postgres; hanya dicocokkan bila
   * `meta.target` berupa scalar string. Diisi dari prisma/migrations.
   */
  indexNames?: readonly string[];
}

/** True bila error adalah Prisma known-request error P2002. */
export function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Normalisasi `meta.target` menjadi daftar string.
 * Mengembalikan null bila target tidak tersedia / tidak didukung — pemanggil
 * harus memperlakukannya sebagai "tidak bisa dipastikan", bukan sebagai match.
 */
function normalizeTarget(err: unknown): string[] | null {
  const target = (err as { meta?: { target?: unknown } } | null | undefined)?.meta?.target;
  if (typeof target === "string") {
    return target.length > 0 ? [target] : null;
  }
  if (Array.isArray(target) && target.length > 0 && target.every((v) => typeof v === "string")) {
    return target as string[];
  }
  return null;
}

/** Perbandingan sebagai SET (urutan kolom dari DB tidak dijamin). */
function sameFieldSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  if (set.size !== a.length) return false;
  return b.every((v) => set.has(v));
}

/**
 * True HANYA bila error adalah P2002 yang `meta.target`-nya cocok persis dengan
 * salah satu constraint yang diharapkan. P2002 dengan target lain, atau tanpa
 * target sama sekali, menghasilkan `false` sehingga caller melempar error ke
 * jalur error yang sudah ada (bukan menelan konflik tak dikenal).
 */
export function isExpectedUniqueViolation(
  err: unknown,
  expected: readonly ExpectedUniqueConstraint[],
): boolean {
  if (!isUniqueConstraintViolation(err)) return false;
  const target = normalizeTarget(err);
  if (!target) return false;

  return expected.some((constraint) => {
    if (sameFieldSet(target, constraint.fields)) return true;
    const indexNames = constraint.indexNames ?? [];
    return target.length === 1 && indexNames.includes(target[0]!);
  });
}