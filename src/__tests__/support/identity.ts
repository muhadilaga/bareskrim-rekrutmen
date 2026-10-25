import { EXPECTED_TARGET } from "./target-guard";

/**
 * TASK 03L.2E.4.10B — Verifikasi identitas server (G-2) + tiga peran sesi (F-3).
 *
 * URL guard membuktikan APA yang kita TUJUK. Modul ini membuktikan SIAPA yang
 * MENGAWAL. Keduanya wajib — URL benar tidak menjamin server benar.
 *
 * TIGA PERAN SESI (F-3):
 *   verify  : transaksi READ-ONLY, hanya untuk pemeriksaan identitas.
 *             TIDAK BOLEH dipakai untuk operasi fixture maupun statement.
 *   fixture : penulis, role bootstrap, untuk seed/cleanup `t047_it_*`.
 *   runner  : penulis, role runner, untuk statement yang diuji.
 *
 * SUMBER KONSTANTA TUNGGAL (F-7): host/port/database/user diturunkan dari
 * `EXPECTED_TARGET`, tidak ada hardcode ganda.
 *
 * Catatan `readOnly`: expectation mengikuti PERAN. Verifikasi dilakukan di
 * dalam transaksi dengan mode yang sesuai peran tersebut — read-only untuk
 * `verify`, read-write untuk `fixture`/`runner` — sehingga mode aktual sesi
 * ikut terbukti, bukan sekadar diasumsikan.
 *
 * MODUL INI MURNI: tidak meng-import Prisma, tidak membuka koneksi.
 */

export type SessionRole = "verify" | "fixture" | "runner";

/** Role PostgreSQL yang dipakai tiap peran sesi. */
export const ROLE_USER: Record<SessionRole, string> = {
  verify: EXPECTED_TARGET.user,
  fixture: "t047_bootstrap",
  runner: EXPECTED_TARGET.user,
};

export interface ServerIdentity {
  database: string;
  user: string;
  /** `host(inet_server_addr())` — null bila bukan koneksi TCP (gagal fail-closed). */
  host: string | null;
  port: number;
  version: string;
  inRecovery: boolean;
  readOnly: boolean;
}

export interface IdentityExpectation {
  database: string;
  user: string;
  host: string;
  port: number;
  readOnly: boolean;
}

export type IdentityResult =
  | { ok: true }
  | { ok: false; failedFields: string[] };

/**
 * Ekspektasi mode sesi per peran (A-3).
 *
 * SEBELUMNYA semua peran disyaratkan `readOnly: true` — itu membuat sesi
 * fixture/runner yang diam-diam read-only tidak pernah terdeteksi. Sekarang:
 *   verify  -> WAJIB read-only  (hanya memeriksa identitas)
 *   fixture -> WAJIB read-write (menulis seed/teardown `t047_it_*`)
 *   runner  -> WAJIB read-write (menjalankan statement yang diuji)
 *
 * Verifikasi mode TIDAK melakukan penulisan apa pun: ia hanya membaca
 * `current_setting('transaction_read_only')` di dalam transaksi dengan mode
 * yang sesuai. Jadi sesi read-write dibuktikan tanpa menyentuh data.
 */
export function expectedReadOnlyFor(role: SessionRole): boolean {
  return role === "verify";
}

/** Ekspektasi identitas untuk sebuah peran sesi. */
export function expectationFor(role: SessionRole): IdentityExpectation {
  return {
    database: EXPECTED_TARGET.database,
    user: ROLE_USER[role],
    host: EXPECTED_TARGET.host,
    port: EXPECTED_TARGET.port,
    readOnly: expectedReadOnlyFor(role),
  };
}

/**
 * Bandingkan identitas server dengan ekspektasi peran.
 * Sengaja TIDAK membandingkan `version` — instance uji boleh berubah versi.
 */
export function verifyServerIdentity(
  actual: ServerIdentity,
  expected: IdentityExpectation
): IdentityResult {
  const failed: string[] = [];

  // Nilai hilang (undefined/null) akan gagal compared dan berujung fail-closed.
  if (actual.database !== expected.database) failed.push("database");
  if (actual.user !== expected.user) failed.push("user");
  if (actual.host !== expected.host) failed.push("host");
  if (actual.port !== expected.port) failed.push("port");
  if (actual.inRecovery !== false) failed.push("in_recovery");
  if (actual.readOnly !== expected.readOnly) failed.push("read_only");

  return failed.length === 0 ? { ok: true } : { ok: false, failedFields: failed };
}

/** Pesan diagnostik aman: hanya nama field + versi, tanpa URL/kredensial. */
export function describeIdentityFailure(
  result: IdentityResult,
  actual?: Pick<ServerIdentity, "version">
): string {
  if (result.ok) return "server identity: OK";
  const suffix = actual ? ` (server version ${actual.version})` : "";
  return `server identity GAGAL pada field: ${result.failedFields.join(", ")}${suffix}`;
}