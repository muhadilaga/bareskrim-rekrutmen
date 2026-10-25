import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  SERVER_TIMEOUTS_MS,
  TIMEOUTS,
  runBounded,
  sessionTimeoutStatements,
} from "../../../harness/lib/session";
import { assertPrimitiveValues } from "../support/params";

// ============================================================================
// TASK 03L.2E4.10B — Unit test SINTETIS untuk konfigurasi timeout sesi (B-1).
//
// TIDAK ADA KONEKSI DATABASE DI SINI. `Prisma.Sql` diperiksa lewat `.inspect()`
// dan `runBounded` diuji dengan client tiruan. Ini BUKAN bukti integrasi
// PostgreSQL; bukti DB memerlukan run terpisah.
// ============================================================================

/** Nama setting yang muncul di sebuah statement (urutan kemunculan). */
function settingsIn(sql: string): string[] {
  const found: string[] = [];
  if (/statement_timeout/.test(sql)) found.push("statement_timeout");
  if (/lock_timeout/.test(sql)) found.push("lock_timeout");
  if (/idle_in_transaction_session_timeout/.test(sql)) found.push("idle_in_transaction_session_timeout");
  return found;
}

describe("B-1: konfigurasi timeout memakai set_config() yang aman", () => {
  it("1. tiga statement, urutan pemasangan benar", () => {
    const stmts = sessionTimeoutStatements();
    expect(stmts).toHaveLength(3);
    const rendered = stmts.map((s) => s.inspect().statement);
    expect(settingsIn(rendered[0])).toEqual(["statement_timeout"]);
    expect(settingsIn(rendered[1])).toEqual(["lock_timeout"]);
    expect(settingsIn(rendered[2])).toEqual(["idle_in_transaction_session_timeout"]);
    // urutan eksplisit, bukan sekadar "semua ada"
    expect(rendered.join(" ")).toMatch(
      /statement_timeout[\s\S]*lock_timeout[\s\S]*idle_in_transaction_session_timeout/
    );
  });

  it("2. memakai set_config(), BUKAN `SET x = $1` (SQLSTATE 42601)", () => {
    for (const s of sessionTimeoutStatements()) {
      const { statement } = s.inspect();
      expect(statement.startsWith("SELECT set_config(")).toBe(true);
      // bentuk lama dimulai dengan `SET ` — itu yang memicu 42601.
      expect(statement.startsWith("SET ")).toBe(false);
    }
  });

  it("3. nilai ter-parameterisasi, sesuai angka yang disyaratkan", () => {
    expect(SERVER_TIMEOUTS_MS).toEqual({
      statementMs: 15_000,
      lockMs: 5_000,
      idleInTransactionMs: 10_000,
    });
    const expected = [
      `${SERVER_TIMEOUTS_MS.statementMs}ms`,
      `${SERVER_TIMEOUTS_MS.lockMs}ms`,
      `${SERVER_TIMEOUTS_MS.idleInTransactionMs}ms`,
    ];
    sessionTimeoutStatements().forEach((s, i) => {
      const { statement, values } = s.inspect();
      expect(values).toHaveLength(1);
      expect(values[0]).toBe(expected[i]);
      // nilai TIDAK boleh dirangkai ke teks SQL (harus jadi parameter)
      expect(statement).not.toContain(expected[i]);
      // placeholder ada; Prisma merender `:1` pada `.statement` (bentuk
      // Postgres `$1` ada pada `.inspect().text`).
      expect(statement).toContain(":1");
    });
  });

  it("3b. nilai parameter primitif (tidak ada Prisma.Sql tersisip)", () => {
    for (const s of sessionTimeoutStatements()) {
      expect(() => assertPrimitiveValues(s)).not.toThrow();
    }
  });

  it("4. is_local = true di SEMUA statement (transaction-level, tanpa bocor)", () => {
    const stmts = sessionTimeoutStatements();
    expect(stmts).toHaveLength(3);
    for (const s of stmts) {
      expect(s.inspect().statement.endsWith(", true)")).toBe(true);
    }
    // `false` (session-level) dilarang: nilainya bertahan melewati commit.
    expect(stmts.map((s) => s.inspect().statement).join(" ")).not.toContain(", false)");
  });
});

describe("B-1: runBounded menerapkan timeout sebelum query kerja", () => {
  /** Client tiruan yang merekam URUTAN pemanggilan. */
  function makeClient() {
    const events: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async (sql: Prisma.Sql) => {
        events.push(sql.inspect().statement.includes("READ ONLY") ? "SET_READ_ONLY" : "executeRaw");
        return 0;
      }),
      $queryRaw: vi.fn(async (sql: Prisma.Sql) => {
        const name = settingsIn(sql.inspect().statement).join(",");
        events.push(`timeout:${name}`);
        return [{ v: "ok" }];
      }),
    };
    const client = {
      $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    };
    return { client, events, tx };
  }

  it("5. timeout dipasang SEBELUM fn, dengan urutan benar", async () => {
    const { client, events } = makeClient();
    const fn = vi.fn(async () => {
      events.push("WORK");
      return 42;
    });
    const result = await runBounded(client as unknown as PrismaClient, fn);
    expect(result).toBe(42);
    expect(events).toEqual([
      "timeout:statement_timeout",
      "timeout:lock_timeout",
      "timeout:idle_in_transaction_session_timeout",
      "WORK",
    ]);
  });

  it("6. mode read-only: SET TRANSACTION READ ONLY dikirim LEBIH DULU", async () => {
    const { client, events, tx } = makeClient();
    await runBounded(client as unknown as PrismaClient, async () => "ok", "read-only");
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(events[0]).toBe("SET_READ_ONLY");
    expect(events[1]).toBe("timeout:statement_timeout");
  });

  it("7. opsi transaksi diteruskan (maxWait/timeout/isolationLevel)", async () => {
    const { client } = makeClient();
    await runBounded(client as unknown as PrismaClient, async () => 1);
    const opts = (client.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.maxWait).toBe(TIMEOUTS.maxWaitMs);
    expect(opts.timeout).toBe(TIMEOUTS.transactionMs);
    expect(opts.isolationLevel).toBe(Prisma.TransactionIsolationLevel.ReadCommitted);
  });

  it("8. kegagalan SET -> error MELAMBAT (fail-closed), fn TIDAK dijalankan", async () => {
    const boom = new Error("42601 syntax error at or near $1");
    const events: string[] = [];
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ v: "15s" }])
        .mockRejectedValueOnce(boom),
    };
    const client = {
      $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    };
    const fn = vi.fn(async () => {
      events.push("WORK");
    });
    await expect(runBounded(client as unknown as PrismaClient, fn)).rejects.toThrow(/42601/);
    expect(fn).not.toHaveBeenCalled();
    expect(events).not.toContain("WORK");
  });

  it("9. kegagalan fn -> error fn yang melambat (bukan error timeout)", async () => {
    const { client } = makeClient();
    await expect(
      runBounded(client as unknown as PrismaClient, async () => {
        throw new Error("work gagal");
      })
    ).rejects.toThrow("work gagal");
  });
});

describe("B-1: regresi — bentuk lama tidak boleh kembali", () => {
  const SRC = readFileSync(
    path.resolve(__dirname, "..", "..", "..", "harness", "lib", "session.ts"),
    "utf8"
  );

  it("10. session.ts tidak lagi memakai `Prisma.sql\`SET ...timeout\``", () => {
    expect(SRC).not.toMatch(/Prisma\.sql`SET\s+\w*timeout/);
    expect(SRC).toContain("set_config(");
    expect(SRC).toContain(", true)");
  });
});
