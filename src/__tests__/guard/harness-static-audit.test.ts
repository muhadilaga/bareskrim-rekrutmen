import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { LOCK_OBSERVE_DEADLINE_MS, TIMEOUTS } from "../../../harness/lib/session";

// ============================================================================
// TASK 03L.2E4.10B — Audit statis harness (A-2/A-5/A-6) tanpa eksekusi.
// Membaca TEKS berkas; tidak pernah meng-import atau menjalankannya.
// ============================================================================

const HARNESS = path.resolve(__dirname, "..", "..", "..", "harness", "exam-save.integration.test.ts");
const SRC = readFileSync(HARNESS, "utf8");

describe("A-5: anggaran deadline dan transaction timeout", () => {
  it("1. deadline polling lebih kecil dari transactionMs (observer habis duluan)", () => {
    expect(LOCK_OBSERVE_DEADLINE_MS).toBeLessThan(TIMEOUTS.transactionMs);
  });

  it("2. maxWait juga lebih kecil dari transactionMs", () => {
    expect(TIMEOUTS.maxWaitMs).toBeLessThan(TIMEOUTS.transactionMs);
  });

  it("3. testTimeout lebih besar dari transactionMs (jaring proses di luar pager DB)", () => {
    expect(TIMEOUTS.testMs).toBeGreaterThan(TIMEOUTS.transactionMs);
  });

  it("4. deadline polling berasal dari konstanta, bukan angka hardcode", () => {
    expect(SRC).toContain("LOCK_OBSERVE_DEADLINE_MS");
    expect(SRC).not.toMatch(/waitForSessionLockWait\([^)]*,\s*\d{3,}\s*,/);
  });

  it("5. tidak ada timeout test hardcoded tersisa", () => {
    expect(SRC).not.toMatch(/\}, (60_000|120_000)\)/);
    expect(SRC).toContain("TIMEOUTS.testMs");
  });
});

describe("A-6: label status pada nama test", () => {
  const names = [...SRC.matchAll(/it\(\s*"([^"]+)"/g)].map((m) => m[1]);

  it("6. S0-S7 semuanya memuat label IMPLEMENTED-NOT-RUN", () => {
    for (const label of ["S0.", "S1.", "S2.", "S3.", "S4.", "S5.", "S6.", "S7."]) {
      const found = names.filter((n) => n.startsWith(label));
      expect(found.length).toBe(1);
      expect(found[0]).toContain("IMPLEMENTED-NOT-RUN");
    }
  });

  it("7. tidak ada test S tanpa label", () => {
    for (const n of names) {
      if (/^S\d\./.test(n)) expect(n).toContain("IMPLEMENTED-NOT-RUN");
    }
  });
});

describe("A-2: S7 memakai attempt & period yang benar-benar di-seed", () => {
  it("8. S7 mengikat attemptId ke attemptOtherPeriod", () => {
    expect(SRC).toMatch(
      /attemptId:\s*HARNESS_FIXTURE_IDS\.attemptOtherPeriod[\s\S]{0,120}attemptPeriodId:\s*HARNESS_FIXTURE_IDS\.examPeriodExtra/
    );
  });

  it("9. S7 tidak lagi memakai ID period yang tidak pernah di-seed", () => {
    expect(SRC).not.toContain('"t047_ep2"');
  });
});

describe("A-4: promise selalu ditangani", () => {
  it("10. S2 & S3 memakai Promise.allSettled di finally", () => {
    const count = (SRC.match(/Promise\.allSettled/g) ?? []).length;
    expect(count).toBe(2);
  });

  it("11. gate selalu dibuka di finally", () => {
    const count = (SRC.match(/allowCommit\(\);|allowSaveCommit\(\);/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("12. disconnect di-swallow-kan agar cleanup tidak menutupi error utama", () => {
    expect(SRC).toContain("revoker.$disconnect().catch(() => undefined)");
  });
});

describe("A-3: verifikasi identitas memakai mode sesuai peran", () => {
  it("13. openValidatedClient memverifikasi identitas sebelum dipakai", () => {
    expect(SRC).toMatch(/verifyIdentity\(client, role\)/);
  });

  it("14. client yang gagal verifikasi di-disconnect lalu dilempar", () => {
    expect(SRC).toMatch(/await client\.\$disconnect\(\);\s*\n\s*throw err;/);
  });
});