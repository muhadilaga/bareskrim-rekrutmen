import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  FIXTURE_ROWS,
  HARNESS_FIXTURE_IDS,
  preCleanFixture,
  seedFixture,
  teardownTargets,
} from "../../../harness/lib/fixtures";

// ============================================================================
// TASK 03L.2E.4.10B — Unit test sintetis fixture lifecycle (F-1/F-6/F-8).
//
// Tx palsu hanya MENGHAPIL statement SQL yang akan dibangun; tidak pernah
// dieksekusi ke database. Tidak ada koneksi.
// ============================================================================

type Captured = { kind: "exec" | "query"; sql: string; values: unknown[] };

function fakeTx(): { tx: never; captured: Captured[] } {
  const captured: Captured[] = [];
  const tx = {
    $executeRaw: async (q: Prisma.Sql) => {
      const i = q.inspect();
      captured.push({ kind: "exec", sql: i.statement, values: i.values });
      return 1;
    },
    $queryRaw: async (q: Prisma.Sql) => {
      const i = q.inspect();
      captured.push({ kind: "query", sql: i.statement, values: i.values });
      return [];
    },
  };
  return { tx: tx as never, captured };
}

describe("F-8: allowlist ID eksak, tanpa wildcard/prefix", () => {
  it("1. teardown hanya menyasar 5 ID harness", () => {
    const targets = teardownTargets();
    expect(targets).toHaveLength(5);
    const ids = targets.map((t) => t.id);
    for (const id of ids) expect(id.startsWith("t047_it_")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("2. TIDAK ada baseline ID di allowlist", () => {
    const ids = teardownTargets().map((t) => t.id);
    for (const baseline of ["t047_u1", "t047_u2", "t047_rp1", "t047_ep1", "t047_app1", "t047_att_a"]) {
      expect(ids).not.toContain(baseline);
    }
  });

  it("3. statement DELETE memakai 'id = $n', tanpa LIKE/ILIKE/%", async () => {
    const { tx, captured } = fakeTx();
    await preCleanFixture(tx);

    expect(captured).toHaveLength(5);
    for (const c of captured) {
      expect(c.sql).toMatch(/DELETE FROM/);
      expect(c.sql).toMatch(/WHERE id = /);
      expect(c.sql).not.toMatch(/LIKE/);
      expect(c.sql).not.toMatch(/ILIKE/);
      expect(c.sql).not.toContain("%");
    }
  });

  it("4. setiap DELETE mengikat ID-nya sebagai parameter (bukan literal)", async () => {
    const { tx, captured } = fakeTx();
    await preCleanFixture(tx);

    const boundIds = captured.map((c) => c.values[c.values.length - 1]);
    expect(boundIds).toEqual([
      HARNESS_FIXTURE_IDS.attemptMain,
      HARNESS_FIXTURE_IDS.attemptOtherPeriod,
      HARNESS_FIXTURE_IDS.application,
      HARNESS_FIXTURE_IDS.examPeriodExtra,
      HARNESS_FIXTURE_IDS.user,
    ]);
  });

  it("5. urutan child -> parent", () => {
    const order = teardownTargets().map((t) => t.table);
    expect(order.indexOf("ExamAttempt")).toBeLessThan(order.indexOf("Application"));
    expect(order.indexOf("Application")).toBeLessThan(order.indexOf("User"));
  });
});

describe("F-1/F-6: seed menutupi semua kolom NOT NULL tanpa default", () => {
  it("6. seed membuat 5 baris: User, ExamPeriod, Application, 2x ExamAttempt", async () => {
    const { tx, captured } = fakeTx();
    await seedFixture(tx);
    const inserts = captured.filter((c) => /INSERT INTO/.test(c.sql));
    expect(inserts).toHaveLength(5);
    expect(inserts.filter((c) => /INSERT INTO "ExamAttempt"/.test(c.sql))).toHaveLength(2);
  });

  it("7. User menyertakan updatedAt (NOT NULL tanpa default)", async () => {
    const { tx, captured } = fakeTx();
    await seedFixture(tx);
    const user = captured.find((c) => /INSERT INTO "User"/.test(c.sql));
    expect(user?.sql).toMatch(/"updatedAt"/);
    expect(user?.sql).toMatch(/now\(\)/);
  });

  it("8. Application menyertakan updatedAt", async () => {
    const { tx, captured } = fakeTx();
    await seedFixture(tx);
    const app = captured.find((c) => /INSERT INTO "Application"/.test(c.sql));
    expect(app?.sql).toMatch(/"updatedAt"/);
  });

  it("9. ExamAttempt menyertakan questionsJson sebagai jsonb", async () => {
    const { tx, captured } = fakeTx();
    await seedFixture(tx);
    const att = captured.filter((c) => /INSERT INTO "ExamAttempt"/.test(c.sql));
    expect(att).toHaveLength(2);
    for (const a of att) expect(a.sql).toMatch(/"questionsJson"/);
  });

  it("10. ExamPeriod tambahan TIDAK aktif (tidak bentrok guard)", () => {
    expect(FIXTURE_ROWS.examPeriodExtra.isActive).toBe(false);
  });

  // -- A-1: status fixture harus DITERIMA, sebagai PARAMETER -----------------
  it("A-1. FIXTURE_ROWS.application.status = DITERIMA", () => {
    expect(FIXTURE_ROWS.application.status).toBe("DITERIMA");
  });

  it("A-1. DITERIMA benar-benar jadi NILAI PARAMETER di INSERT (bukan literal SQL)", async () => {
    const { tx, captured } = fakeTx();
    await seedFixture(tx);
    const app = captured.find((c) => /INSERT INTO "Application"/.test(c.sql));
    expect(app).toBeDefined();
    // Ada di daftar kolom...
    expect(app!.sql).toMatch(/"userId", status, "updatedAt"/);
    // ...dan NILAINYA ada di `values` (parameter), bukan tercetak di teks SQL.
    expect(app!.sql).not.toContain("DITERIMA");
    expect(app!.values).toContain("DITERIMA");
  });

  it("A-1. status tidak lagi jatuh ke default MENUNGGU_VERIFIKASI", async () => {
    const { tx, captured } = fakeTx();
    await seedFixture(tx);
    const app = captured.find((c) => /INSERT INTO "Application"/.test(c.sql))!;
    // Kolom status wajib ada; kalau tidak, default schema dipakai dan guard gagal diam-diam.
    expect(app.sql).toContain("status");
    expect(app.values).not.toContain("MENUNGGU_VERIFIKASI");
  });

  it("11. Application ber-FK ke recruitmentPeriod BASELINE (hanya referensi)", () => {
    expect(FIXTURE_ROWS.application.recruitmentPeriodId).toBe("t047_rp1");
    // bukan fixture milik harness -> tidak ikut dihapus.
    expect(FIXTURE_ROWS.application.recruitmentPeriodId.startsWith("t047_it_")).toBe(false);
  });

  it("12. attempt utama memakai ExamPeriod baseline (tanpa ExamPeriod baru yang aktif)", () => {
    expect(FIXTURE_ROWS.attemptMain.periodId).toBe("t047_ep1");
  });

  it("13. slot unik ExamAttempt untuk dua attempt harness tidak bentrok", () => {
    const keys = [FIXTURE_ROWS.attemptMain.attemptKey, FIXTURE_ROWS.attemptOtherPeriod.attemptKey];
    expect(new Set(keys).size).toBe(2);
    const pairs = [
      `${FIXTURE_ROWS.attemptMain.periodId}:${FIXTURE_ROWS.attemptMain.userId}`,
      `${FIXTURE_ROWS.attemptOtherPeriod.periodId}:${FIXTURE_ROWS.attemptOtherPeriod.userId}`,
    ];
    expect(new Set(pairs).size).toBe(2);
    // tidak boleh sama dengan fixture baseline (t047_ep1:t047_u1)
    expect(pairs).not.toContain("t047_ep1:t047_u1");
  });

  // -- A-2: fixture untuk S7 benar-benar ada & konsisten --------------------
  it("A-2. attemptOtherPeriod memakai examPeriodExtra (bukan ID yang tak pernah di-seed)", () => {
    expect(FIXTURE_ROWS.attemptOtherPeriod.periodId).toBe(HARNESS_FIXTURE_IDS.examPeriodExtra);
    expect(FIXTURE_ROWS.attemptOtherPeriod.id).toBe(HARNESS_FIXTURE_IDS.attemptOtherPeriod);
  });

  it("A-2. examPeriodExtra tidak aktif dan tetap dipakai S7", () => {
    expect(FIXTURE_ROWS.examPeriodExtra.isActive).toBe(false);
    expect(FIXTURE_ROWS.attemptOtherPeriod.periodId).toBe(FIXTURE_ROWS.examPeriodExtra.id);
  });

  it("A-2. attemptOtherPeriod punya user yang sama dengan attempt utama", () => {
    expect(FIXTURE_ROWS.attemptOtherPeriod.userId).toBe(FIXTURE_ROWS.attemptMain.userId);
  });
});