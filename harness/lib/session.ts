import { Prisma, PrismaClient } from "@prisma/client";

import {
  describeIdentityFailure,
  expectationFor,
  expectedReadOnlyFor,
  verifyServerIdentity,
  type SessionRole,
} from "../../src/__tests__/support/identity";

/**
 * TASK 03L.2E4.10B — Sesi database berbatas (G-1) + batas waktu semua jalur (F-5/F-9).
 *
 * SETIAP jalur query harness WAJIB lewat salah satu fungsi di berkas ini.
 * Tidak ada `$queryRaw`/`$executeRaw` langsung pada client di luar sini.
 *
 * Pemisahan timeout — TIDAK saling menggantikan:
 *   - `connectTimeout` : batas menunggu koneksi (URL / pool). Dijaga Prisma.
 *   - `maxWait`        : how long menunggu SLOT koneksi dari pool.
 *   - `timeout`        : batas keseluruhan transaksi interaktif Prisma.
 *   - `statement_timeout` : batas per-statement di sisi PostgreSQL.
 *   - `lock_timeout`   : batas menunggu lock baris di sisi PostgreSQL.
 *   - `idle_in_transaction_session_timeout` : batas sesi menganggur dalam transaksi.
 *   Vitest `testTimeout` HANYA jaring pengaman proses, BUKAN pager database.
 */

/** Dialih saat runtime lewat environment; default aman untuk workload ini. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const TIMEOUTS = {
  /**
   * Batas keseluruhan transaksi interaktif (ms).
   *
   * ANGGARAN (A-5): polling lock `LOCK_OBSERVE_DEADLINE_MS` (10s) +
   * `maxWait` (5s) + pelepasan gate/commit + cleanup. 30s memberi headroom
   * tanpa memperpanjang pembatas secara membumi.
   */
  transactionMs: envInt("T047_TX_TIMEOUT_MS", 30_000),
  /** Berapa lama menunggu slot koneksi dari pool (ms). */
  maxWaitMs: envInt("T047_TX_MAXWAIT_MS", 5_000),
  /** Timeout Vitest per test (ms) — jaring pengaman proses, bukan pager DB. */
  testMs: envInt("T047_TEST_TIMEOUT_MS", 90_000),
} as const;

/**
 * Deadline polling lock (ms). WAJIB lebih kecil dari `transactionMs`
 * supaya observer kehabisan waktu LEBIH DULU daripada transaksi target —
 * dengan begitu tidak ada transaksi target yang menggantung (A-5).
 */
export const LOCK_OBSERVE_DEADLINE_MS = envInt("T047_OBSERVE_DEADLINE_MS", 10_000);

/** Batas PostgreSQL sisi server (ms). Tidak dipengaruhi Vitest. */
export const SERVER_TIMEOUTS_MS = {
  statementMs: 15_000,
  lockMs: 5_000,
  idleInTransactionMs: 10_000,
} as const;

export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Pasang batas timeout sisi server sebagai `SELECT set_config(...)` berparameter (B-1).
 *
 * MENGAPA BUKAN `SET x = $1`:
 *   PostgreSQL hanya menerima parameter bind pada SELECT/INSERT/UPDATE/DELETE/
 *   MERGE/VALUES. Pada perintah UTILITAS seperti `SET`, placeholder `$1`
 *   memicu SQLSTATE `42601` ("syntax error at or near $1"). Ini BUKAN dugaan:
 *   terbukti pada PostgreSQL 18.6 + Prisma 5.22 lewat
 *   EXAM_SAVE_PG_READONLY_SMOKE_TEST (Tahap 4) — ketiga perintah gagal dengan
 *   `42601`, dan error pertama meng-abort seluruh transaksi (`25P02`).
 *   Akibatnya SETIAP pemanggilan `runBounded()` gagal pada SET pertama, jadi
 *   S1–S7 tidak akan pernah bisa berjalan dengan bentuk lama.
 *
 * MENGAPA `set_config()`: itu adalah FUNGSI, sehingga nilai benar-benar
 * ter-parameterisasi lewat protokol extended — aman dari injeksi dan tidak
 * membentuk SQL dari input.
 *
 * MENGAPA `is_local => true` (SET LOCAL), BUKAN `false`:
 *   - `false` bersifat SESSION-level: nilainya BERTAHAN setelah COMMIT, lalu
 *     bocor ke pemakaian koneksi pool berikutnya. Smoke test membuktikan nilai
 *     itu hanya kembali ke default bila transaksi di-ROLLBACK — jadi rollback
 *     bukan jaminan cleanup yang boleh diandalkan.
 *   - `true` bersifat TRANSACTION-level: commit MAUPUN rollback sama-sama
 *     mengembalikan nilai sebelumnya. Dengan begitu TIDAK ADA jejak session-
 *     level yang bisa tertinggal — kebocoran dieliminasi lewat desain, bukan
 *     lewat asumsi rollback.
 *
 * Karena pernyataan ini `SELECT`, ia dijalankan lewat `$queryRaw` (bukan
 * `$executeRaw`) di `runBounded`.
 */
export function sessionTimeoutStatements(): Prisma.Sql[] {
  return [
    Prisma.sql`SELECT set_config('statement_timeout', ${`${SERVER_TIMEOUTS_MS.statementMs}ms`}, true)`,
    Prisma.sql`SELECT set_config('lock_timeout', ${`${SERVER_TIMEOUTS_MS.lockMs}ms`}, true)`,
    Prisma.sql`SELECT set_config('idle_in_transaction_session_timeout', ${`${SERVER_TIMEOUTS_MS.idleInTransactionMs}ms`}, true)`,
  ];
}

/**
 * Jalankan `fn` di transaksi interaktif TERBATAS.
 * `mode` menentukan apakah transaksi boleh menulis.
 * Untuk `read-only`, `SET TRANSACTION READ ONLY` dikirim SEBUM sebagai
 * statement pertama — itu satu-satunya cara dijamin server, bukan konvensi.
 */
export async function runBounded<T>(
  client: PrismaClient,
  fn: (tx: Tx) => Promise<T>,
  mode: "read-write" | "read-only" = "read-write"
): Promise<T> {
  return client.$transaction(
    async (tx) => {
      if (mode === "read-only") {
        await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      }
      // Timeout: `SELECT set_config(...)` -> harus lewat `$queryRaw`.
      // Dipasang SEBELUM `fn(tx)`, jadi query kerja sudah terlindungi.
      // Karena `is_local = true`, rollback/commit otomatis menghapusnya.
      for (const stmt of sessionTimeoutStatements()) {
        await tx.$queryRaw(stmt);
      }
      return fn(tx as unknown as Tx);
    },
    {
      maxWait: TIMEOUTS.maxWaitMs,
      timeout: TIMEOUTS.transactionMs,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

// ── Identity (G-2/F-3) ──────────────────────────────────────────────────────

/** Baca identitas server dari sesi txn yang sedang berjalan. */
export async function readServerIdentity(tx: Pick<Tx, "$queryRaw">): Promise<{
  database: string;
  user: string;
  host: string | null;
  port: number;
  version: string;
  inRecovery: boolean;
  readOnly: boolean;
}> {
  const rows = await tx.$queryRaw<
    Array<{
      database: string;
      usr: string;
      host: string | null;
      port: number;
      version: string;
      in_recovery: boolean;
      read_only: string;
    }>
  >(Prisma.sql`
    SELECT current_database()        AS database,
           current_user              AS usr,
           host(inet_server_addr())  AS host,
           inet_server_port()        AS port,
           version()                 AS version,
           pg_is_in_recovery()       AS in_recovery,
           current_setting('transaction_read_only') AS read_only
  `);
  const row = rows[0];
  if (!row) throw new Error("readServerIdentity: server tidak mengembalikan baris.");
  return {
    database: row.database,
    user: row.usr,
    host: row.host,
    port: Number(row.port),
    version: row.version,
    inRecovery: row.in_recovery === true,
    readOnly: row.read_only === "on",
  };
}

/**
 * Verifikasi identitas server untuk sebuah peran sesi (A-3).
 *
 * Dijalankan di dalam transaksi dengan mode yang COCOK dengan peran:
 *   verify  -> `SET TRANSACTION READ ONLY`, lalu membaca `transaction_read_only`
 *               yang harus `on`  => sesi verifikasi terbukti read-only.
 *   fixture -> transaksi read-write, `transaction_read_only` harus `off`
 *   runner  -> idem                => sesi writers terbukti bisa menulis.
 *
 * Tidak ada penulisan apa pun pada probe ini — hanya membaca setelan sesi.
 * Melempar bila gagal (fail-closed); tidak ada fallback ke validasi URL saja.
 *
 * CATATAN: perilaku `SET TRANSACTION READ ONLY` via `$executeRaw` pada Prisma
 * 5.22 BELUM pernah dieksekusi ke PostgreSQL nyata. Yang dijamin di sini
 * hanya bentuk SQL dan logikanya.
 */
export async function verifyIdentity(
  client: PrismaClient,
  role: SessionRole
): Promise<void> {
  const mode = expectedReadOnlyFor(role) ? "read-only" : "read-write";
  const identity = await runBounded(client, async (tx) => readServerIdentity(tx), mode);

  const result = verifyServerIdentity(identity, expectationFor(role));
  if (!result.ok) {
    throw new Error(
      `Server identity tidak cocok (${mode}). ${describeIdentityFailure(result, identity)}`
    );
  }
}

// ── Lock-observation (F-2/F-9) ────────────────────────────────────────────────

/** Backend PID sesi txn saat ini — untuk polling yang terfilter. */
export async function readBackendPid(tx: Pick<Tx, "$queryRaw">): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ pid: number }>>(
    Prisma.sql`SELECT pg_backend_pid()::int AS pid`
  );
  const pid = rows[0]?.pid;
  if (typeof pid !== "number") throw new Error("readBackendPid: pid tidak terbaca.");
  return pid;
}

/**
 * Tunggu sampai SESI TERTENTU (pid) benar-benar menunggu lock.
 *
 * Penting: memfilter `pid` sehingga lock-wait dari sesi lain TIDAK
 * dihitung sebagai keberhasilan (F-2). Deadline eksplisit; kegagalan
 * dilempar, bukan diabaikan.
 */
export async function waitForSessionLockWait(
  observer: PrismaClient,
  pid: number,
  deadlineMs: number
): Promise<{ waited: boolean; observedWaitEvent: string | null }> {
  const startedAt = Date.now();
  let lastEvent: string | null = null;

  while (Date.now() - startedAt < deadlineMs) {
    const rows = await runBounded(observer, (tx) =>
      tx.$queryRaw<Array<{ wait_event_type: string | null; wait_event: string | null }>>(Prisma.sql`
        SELECT wait_event_type, wait_event
          FROM pg_stat_activity
         WHERE pid = ${pid}
      `)
    );
    const row = rows[0];
    if (!row) throw new Error(`waitForSessionLockWait: pid ${pid} tidak terlihat.`);
    if (row.wait_event_type === "Lock") {
      return { waited: true, observedWaitEvent: row.wait_event ?? null };
    }
    lastEvent = row.wait_event ?? null;
    await new Promise((r) => setTimeout(r, 50));
  }
  return { waited: false, observedWaitEvent: lastEvent };
}