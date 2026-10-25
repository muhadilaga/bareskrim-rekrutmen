/**
 * TASK 03L.2E.4.10B — Integration harness statement exam-save vs PostgreSQL.
 *
 * =====================================================================
 *  TAHAP INI: IMPLEMENTED — NOT RUN. Tidak ada klaim apa pun tentang
 *  perilaku PostgreSQL nyata sampai skenario benar-benar dijalankan.
 * =====================================================================
 *
 * Jalankan (perlu persetujuan terpisah):
 *   T047_INTEGRATION=1 npx vitest run --config harness/vitest.integration.config.ts
 * Tanpa opt-in: suite DILEWATI, tanpa soket, tanpa fixture.
 *
 * ARSITEKTUR: CAPTURE-AND-REPLAY
 *   Tahap 1 (tanpa DB): route produksi dipanggil dengan prisma di-mock;
 *     objek `Prisma.Sql` yang ia kirim DICAPTURE — SQL dari kode produksi,
 *     tanpa penulisan ulang, jadi tanpa divergensi.
 *   Tahap 2 (butuh DB): objek Sql sama diputar ulang pada transaksi berbatas;
 *     parameter di-rebind lewat kunci semantik (bukan indeks).
 *
 * S2/S3 memakai SIGNAL in-process (promise) + polling PID-filtered, bukan
 * `sleep` sebagai bukti lock. Lihat `waitForSessionLockWait`.
 *
 * BATAS BUKTI: replay membuktikan STATEMENT produksi, bukan concurrency penuh
 * jalur HTTP (session, Guard chain, rate-limit).
 */

import { existsSync, readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";

import {
  EXPECTED_TARGET,
  buildRunnerUrl,
  describeGuardFailure,
  extractRunnerCredential,
  validateTargetUrl,
} from "../src/__tests__/support/target-guard";
import { assertPrimitiveValues, deriveParamMap, rebindSql } from "../src/__tests__/support/params";
import { ROLE_USER, type SessionRole } from "../src/__tests__/support/identity";
import {
  HARNESS_FIXTURE_IDS,
  preCleanFixture,
  seedFixture,
  teardownTargets,
  verifyNoFixtureRemains,
} from "./lib/fixtures";
import {
  LOCK_OBSERVE_DEADLINE_MS,
  TIMEOUTS,
  readBackendPid,
  runBounded,
  sessionTimeoutStatements,
  verifyIdentity,
  waitForSessionLockWait,
  type Tx,
} from "./lib/session";

// ── Opt-in fail-closed ──────────────────────────────────────────────────────
const OPT_IN = process.env.T047_INTEGRATION === "1";

// ── Mocks untuk capture (Tahap 1, tanpa database) ─────────────────────────
const CTX = {
  applicationId: "app-captured",
  userId: "user-captured",
  recruitmentPeriodId: "rp-captured",
  examPeriodId: "ep-captured",
  attemptId: "att-captured",
};

const FAKE_USER = {
  id: CTX.userId,
  username: "captured",
  displayName: "Captured",
  discordUsername: null,
  matraBlocked: false,
  deletedAt: null,
};

const CAPTURED: Prisma.Sql[] = [];

const mockPrisma = {
  $queryRaw: vi.fn(async (q: Prisma.Sql) => {
    CAPTURED.push(q);
    return [{ id: CTX.attemptId }];
  }),
  examPeriod: {
    findMany: vi.fn(async () => [
      {
        id: CTX.examPeriodId,
        name: "ep",
        description: null,
        recruitmentPeriodId: CTX.recruitmentPeriodId,
        isActive: true,
        isAttendanceOpen: true,
        isExamOpen: true,
        examStartTime: null,
        examEndTime: null,
        seed: 1,
        mcqCount: 1,
        essayCount: 0,
        passThreshold: 70,
        openedAt: null,
        closedAt: null,
        deletedAt: null,
      },
    ]),
  },
  recruitmentPeriod: {
    findUnique: vi.fn(async () => ({
      id: CTX.recruitmentPeriodId,
      code: "RP",
      name: "rp",
      isActive: true,
      openedAt: new Date(),
      closedAt: new Date(),
      deletedAt: null,
    })),
  },
  application: {
    findFirst: vi.fn(async () => ({
      id: CTX.applicationId,
      registrationId: "REG",
      recruitmentPeriodId: CTX.recruitmentPeriodId,
      status: "DITERIMA",
      verifiedAt: new Date(),
      userId: CTX.userId,
      deletedAt: null,
    })),
  },
  attendance: { findFirst: vi.fn(async () => ({})), findUnique: vi.fn(async () => ({})) },
  examAttempt: {
    findFirst: vi.fn(async () => ({
      id: CTX.attemptId,
      userId: CTX.userId,
      periodId: CTX.examPeriodId,
      submittedAt: null,
      deletedAt: null,
    })),
    findUnique: vi.fn(async () => null),
  },
  examResult: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
  blacklistEntry: { findFirst: vi.fn(async () => null) },
  verdictEntry: { findFirst: vi.fn(async () => null) },
  question: { findMany: vi.fn(async () => []) },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => FAKE_USER) }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "127.0.0.1",
  createRateLimiter: () => ({ check: () => ({ ok: true, retryAfterSeconds: 0 }) }),
  saveLimiter: { check: () => ({ ok: true, retryAfterSeconds: 0 }) },
  submitLimiter: { check: () => ({ ok: true, retryAfterSeconds: 0 }) },
  userSubmitLimiter: { check: () => ({ ok: true, retryAfterSeconds: 0 }) },
}));

const saveRoute = await import("@/app/api/exam/save/route");

function postRequest(body: unknown): Request {
  return new Request("http://127.0.0.1:1/api/exam/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function captureRouteSql(payload: Record<string, unknown>): Promise<Prisma.Sql> {
  CAPTURED.length = 0;
  const res = await saveRoute.POST(postRequest({ attemptId: CTX.attemptId, ...payload }));
  if (res.status !== 200) throw new Error(`Capture gagal: status ${res.status}.`);
  if (CAPTURED.length !== 1) throw new Error(`Capture gagal: $queryRaw dipanggil ${CAPTURED.length}x.`);
  const sql = CAPTURED[0];
  assertPrimitiveValues(sql);
  return sql;
}

// ── Client: satu peran = satu client terverifikasi (F-3) ────────────────────
const PGPASS_PATH = "D:/Dev/Temp/t047-concurrency-secrets/pgpass.txt";

async function openValidatedClient(role: SessionRole): Promise<PrismaClient> {
  if (!existsSync(PGPASS_PATH)) {
    throw new Error("pgpass instance terisolasi tidak ditemukan -> BLOCKED (bukan membaca .env).");
  }
  const user = ROLE_USER[role];
  const cred = extractRunnerCredential(readFileSync(PGPASS_PATH, "utf8"), {
    ...EXPECTED_TARGET,
    user,
  });
  if (!cred) throw new Error(`Entri ${user} tidak ditemukan di pgpass -> BLOCKED.`);

  const url = buildRunnerUrl({
    host: EXPECTED_TARGET.host,
    port: EXPECTED_TARGET.port,
    database: EXPECTED_TARGET.database,
    user: cred.user,
    password: cred.password,
  });
  const verdict = validateTargetUrl(url);
  if (!verdict.ok) throw new Error(`Hard guard gagal. ${describeGuardFailure(verdict)}`);

  const client = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    // URL benar != server benar. Verifikasi identitas (read-only) sebelum dipakai.
    await verifyIdentity(client, role);
    return client;
  } catch (err) {
    await client.$disconnect();
    throw err;
  }
}

// ── Skenario ────────────────────────────────────────────────────────────────
describe.skipIf(!OPT_IN)("exam-save raw SQL vs PostgreSQL terisolasi", () => {
  let fixtureClient: PrismaClient;
  let runner: PrismaClient;
  let sqlOne: Prisma.Sql;

  /** Siapkan fixture di sesi bootstrap (F-1): pre-clean lalu seed, keduanya bounded. */
  async function ensureFixtures(): Promise<void> {
    await runBounded(fixtureClient, async (tx) => {
      await preCleanFixture(tx);
      await seedFixture(tx);
    });
  }

  beforeAll(async () => {
    sqlOne = await captureRouteSql({ answers: { q1: "A" } });
    fixtureClient = await openValidatedClient("fixture");
    runner = await openValidatedClient("runner");
    await ensureFixtures();
  }, TIMEOUTS.testMs);

  afterAll(async () => {
    try {
      if (fixtureClient) {
        await runBounded(fixtureClient, async (tx) => {
          await preCleanFixture(tx);
          const left = await verifyNoFixtureRemains(tx);
          expect(Object.values(left).every((v) => Number(v) === 0)).toBe(true);
        });
      }
    } finally {
      await runner?.$disconnect();
      await fixtureClient?.$disconnect();
    }
  }, TIMEOUTS.testMs);

  /** Statement save dengan nilai skenario, diturunkan dari base capture. */
  function saveSql(overrides: Record<string, unknown>): Prisma.Sql {
    return rebindSql(sqlOne, {
      applicationId: HARNESS_FIXTURE_IDS.application,
      eligibilityUserId: HARNESS_FIXTURE_IDS.user,
      recruitmentPeriodId: "t047_rp1",
      attemptId: HARNESS_FIXTURE_IDS.attemptMain,
      attemptUserId: HARNESS_FIXTURE_IDS.user,
      attemptPeriodId: "t047_ep1",
      savedAnswers: JSON.stringify({ q1: "X" }),
      ...overrides,
    });
  }

  /** Restore status ke DITERIMA (fixture kembali eligible). */
  async function restoreEligibility(): Promise<void> {
    await runBounded(fixtureClient, (tx) =>
      tx.$executeRaw(
        Prisma.sql`UPDATE "Application" SET status = 'DITERIMA', "updatedAt" = now()
                    WHERE id = ${HARNESS_FIXTURE_IDS.application}`
      )
    );
  }

  it("S0. timeout sesi via set_config transaction-local [IMPLEMENTED-NOT-RUN]", () => {
    const stmts = sessionTimeoutStatements();
    const rendered = stmts.map((s) => s.inspect().statement).join(" ");
    // Nama setting harus ada...
    expect(rendered).toContain("statement_timeout");
    expect(rendered).toContain("lock_timeout");
    expect(rendered).toContain("idle_in_transaction_session_timeout");
    // ...dan BENTUKNYA wajib `set_config()`: bentuk `SET x = $1` memicu
    // SQLSTATE 42601 pada PostgreSQL (bukti smoke test).
    expect(rendered).toContain("set_config");
    expect(stmts.every((s) => s.inspect().statement.startsWith("SELECT set_config("))).toBe(true);
    expect(stmts.every((s) => s.inspect().statement.startsWith("SET "))).toBe(false);
    // `is_local = true` di SEMUA statement -> transaction-level, tidak bocor.
    expect(stmts).toHaveLength(3);
    expect(stmts.every((s) => s.inspect().statement.endsWith(", true)"))).toBe(true);
  }, TIMEOUTS.testMs);

  it("S1. save normal -> 1 baris, JSONB sesuai payload [IMPLEMENTED-NOT-RUN]", async () => {
    const rows = await runBounded(runner, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(saveSql({ savedAnswers: JSON.stringify({ q1: "A" }) }))
    );
    expect(rows).toHaveLength(1);

    const stored = await runBounded(runner, (tx) =>
      tx.$queryRaw<Array<{ savedAnswers: unknown }>>(Prisma.sql`
        SELECT "savedAnswers" FROM "ExamAttempt" WHERE id = ${HARNESS_FIXTURE_IDS.attemptMain}
      `)
    );
    expect(stored[0]?.savedAnswers).toEqual({ q1: "A" });
  }, TIMEOUTS.testMs);

  // -- S2: revocation-first (F-4: signalling, bukan sleep) ------------------
  it("S2. revocation-first: save menunggu lock, lalu ditolak [IMPLEMENTED-NOT-RUN]", async () => {
    const revoker = await openValidatedClient("runner");
    let lockHeld!: () => void;
    const held = new Promise<void>((r) => (lockHeld = r));
    let allowCommit!: () => void;
    const gate = new Promise<void>((r) => (allowCommit = r));

    let saveTx: Promise<Array<{ id: string }>> | undefined;
    let revocation: Promise<unknown> | undefined;

    try {
      // Revoker memegang row lock Application lewat UPDATE yang belum di-commit.
      revocation = runBounded(revoker, async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`UPDATE "Application" SET status = 'DITOLAK', "updatedAt" = now()
                      WHERE id = ${HARNESS_FIXTURE_IDS.application}`
        );
        lockHeld(); // lock benar-benar dipegang (pernyataan UPDATE selesai).
        await gate; // tunggu saver terbukti menunggu, baru commit.
      });

      await held; // Ordering deterministik — tanpa sleep.

      // PID diambil DI DALAM transaksi yang sama, jadi pasti backend yang
      // akan terblokir. Poll PID lain = bukti palsu (F-2).
      let saverPidReady!: (p: number) => void;
      const saverPidP = new Promise<number>((r) => (saverPidReady = r));

      saveTx = runBounded(runner, async (tx) => {
        const pid = await readBackendPid(tx);
        saverPidReady(pid);
        return tx.$queryRaw<Array<{ id: string }>>(saveSql({})); // terblokir di sini
      });

      const saverPid = await saverPidP;
      const observed = await waitForSessionLockWait(
        fixtureClient,
        saverPid,
        LOCK_OBSERVE_DEADLINE_MS
      );
      expect(observed.waited).toBe(true);

      allowCommit(); // revoker boleh commit -> saver ter-release.
      const rows = await saveTx;
      await revocation;

      expect(rows).toHaveLength(0); // ditolak setelah status terbaru dievaluasi.
    } finally {
      // A-4: gate selalu dibuka; seluruh promise selalu ditangani agar tidak
      // menjadi unhandled rejection. Kegagalan cleanup dicatat sebagai
      // INFORMASI TAMBAHAN dan tidak menutupi error utama.
      allowCommit();
      await Promise.allSettled([...(saveTx ? [saveTx] : []), ...(revocation ? [revocation] : [])]);
      try {
        await restoreEligibility();
      } catch (cleanupError) {
        console.error(
          "[harness] S2 cleanup gagal:",
          cleanupError instanceof Error ? cleanupError.name : "unknown"
        );
      }
      await revoker.$disconnect().catch(() => undefined);
    }
  }, TIMEOUTS.testMs);

  // -- S3: save-first (F-2: revoker nyata + polling terfilter) --------------
  it("S3. save-first: revoker menunggu lock, lalu apply [IMPLEMENTED-NOT-RUN]", async () => {
    const revoker = await openValidatedClient("runner");
    let saveLocked!: () => void;
    const locked = new Promise<void>((r) => (saveLocked = r));
    let allowSaveCommit!: () => void;
    const saveGate = new Promise<void>((r) => (allowSaveCommit = r));

    let saveTx: Promise<Array<{ id: string }>> | undefined;
    let revocation: Promise<number> | undefined;

    try {
      // Save memegang lock, lalu menahan sampai diizinkan commit.
      saveTx = runBounded(runner, async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(saveSql({}));
        saveLocked(); // save memegang lock Application sekarang.
        await saveGate;
        return rows;
      });

      await locked;

      // Revoker dari koneksi TERPISAH; pid diambil di dalam transaksinya sendiri.
      let revokerPidReady!: (p: number) => void;
      const revokerPidP = new Promise<number>((r) => (revokerPidReady = r));

      revocation = runBounded(revoker, async (tx) => {
        const pid = await readBackendPid(tx);
        revokerPidReady(pid);
        // UPDATE ini harus TERBLOKIR oleh lock save.
        await tx.$executeRaw(
          Prisma.sql`UPDATE "Application" SET status = 'DITOLAK', "updatedAt" = now()
                      WHERE id = ${HARNESS_FIXTURE_IDS.application}`
        );
        return 1;
      });

      const revokerPid = await revokerPidP;
      const observed = await waitForSessionLockWait(
        fixtureClient,
        revokerPid,
        LOCK_OBSERVE_DEADLINE_MS
      );
      expect(observed.waited).toBe(true);

      allowSaveCommit(); // save selesai -> revoker boleh lanjut.
      const rows = await saveTx;
      const updated = await revocation;

      expect(rows).toHaveLength(1); // save menang lock pertama.
      expect(updated).toBe(1); // revokasi tetap apply SETELAH save.
    } finally {
      allowSaveCommit();
      await Promise.allSettled([...(saveTx ? [saveTx] : []), ...(revocation ? [revocation] : [])]);
      try {
        await restoreEligibility();
      } catch (cleanupError) {
        console.error(
          "[harness] S3 cleanup gagal:",
          cleanupError instanceof Error ? cleanupError.name : "unknown"
        );
      }
      await revoker.$disconnect().catch(() => undefined);
    }
  }, TIMEOUTS.testMs);

  // -- S4: sudah submitted ---------------------------------------------------
  it("S4. attempt submitted -> 0 baris [IMPLEMENTED-NOT-RUN]", async () => {
    await runBounded(fixtureClient, (tx) =>
      tx.$executeRaw(
        Prisma.sql`UPDATE "ExamAttempt" SET "submittedAt" = now() WHERE id = ${HARNESS_FIXTURE_IDS.attemptMain}`
      )
    );
    try {
      const rows = await runBounded(runner, (tx) =>
        tx.$queryRaw<Array<{ id: string }>>(saveSql({ savedAnswers: JSON.stringify({ q1: "S4" }) }))
      );
      expect(rows).toHaveLength(0);
    } finally {
      await runBounded(fixtureClient, (tx) =>
        tx.$executeRaw(
          Prisma.sql`UPDATE "ExamAttempt" SET "submittedAt" = NULL WHERE id = ${HARNESS_FIXTURE_IDS.attemptMain}`
        )
      );
    }
  }, TIMEOUTS.testMs);

  // -- S5: soft-deleted (jalur statement, BUKAN 404 route) ------------------
  it("S5. attempt soft-deleted -> predicate menolak (0 baris) [IMPLEMENTED-NOT-RUN]", async () => {
    await runBounded(fixtureClient, (tx) =>
      tx.$executeRaw(
        Prisma.sql`UPDATE "ExamAttempt" SET "deletedAt" = now() WHERE id = ${HARNESS_FIXTURE_IDS.attemptMain}`
      )
    );
    try {
      const rows = await runBounded(runner, (tx) =>
        tx.$queryRaw<Array<{ id: string }>>(saveSql({ savedAnswers: JSON.stringify({ q1: "S5" }) }))
      );
      expect(rows).toHaveLength(0);
    } finally {
      await runBounded(fixtureClient, (tx) =>
        tx.$executeRaw(
          Prisma.sql`UPDATE "ExamAttempt" SET "deletedAt" = NULL WHERE id = ${HARNESS_FIXTURE_IDS.attemptMain}`
        )
      );
    }
  }, TIMEOUTS.testMs);

  // -- S6: ownership mismatch ------------------------------------------------
  it("S6. ownership mismatch -> 0 baris [IMPLEMENTED-NOT-RUN]", async () => {
    const rows = await runBounded(runner, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(saveSql({ attemptUserId: "t047_u2" }))
    );
    expect(rows).toHaveLength(0);
  }, TIMEOUTS.testMs);

  // -- S7: period mismatch (A-2) --------------------------------------------
  it("S7. period mismatch -> 0 baris [IMPLEMENTED-NOT-RUN]", async () => {
    // Attempt nyata milik harness: t047_it_att2 berperiodId t047_it_ep2,
    // sementara ctx.examPeriod.id = t047_ep1 (baseline). Keduanya benar-benar
    // di-seed, jadi ini mismatch nyata — bukan ID yang tidak pernah ada.
    const rows = await runBounded(runner, (tx) =>
      tx.$queryRaw<Array<{ id: string }>>(
        saveSql({
          attemptId: HARNESS_FIXTURE_IDS.attemptOtherPeriod,
          attemptPeriodId: HARNESS_FIXTURE_IDS.examPeriodExtra,
        })
      )
    );
    expect(rows).toHaveLength(0);
  }, TIMEOUTS.testMs);
});