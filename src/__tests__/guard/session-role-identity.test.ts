import { describe, expect, it } from "vitest";
import { EXPECTED_TARGET } from "../support/target-guard";
import {
  expectationFor,
  verifyServerIdentity,
  type ServerIdentity,
  type SessionRole,
} from "../support/identity";

// ============================================================================
// TASK 03L.2E4.10B — F-7 (sumber konstanta tunggal) + fail-closed identitas.
//
// CATATAN: semantik `readOnly` per peran berubah pada A-3 — `verify` read-only,
// `fixture`/`runner` read-write. Uji mode-peran yang rinci ada di
// `session-mode-readwrite.test.ts`. Berkas ini fokus pada sumber konstanta dan
// fail-closed. TIDAK ADA KONEKSI DATABASE DI SINI.
// ============================================================================

/** Identitas dengan mode read-only (sesi `verify`). */
const READ_ONLY_IDENTITY: ServerIdentity = {
  database: EXPECTED_TARGET.database,
  user: EXPECTED_TARGET.user,
  host: EXPECTED_TARGET.host,
  port: EXPECTED_TARGET.port,
  version: "PostgreSQL 18.6",
  inRecovery: false,
  readOnly: true,
};

describe("F-7: expectation_for memakai konstanta tunggal", () => {
  it("1. semua field diturunkan dari EXPECTED_TARGET (tidak ada hardcode)", () => {
    for (const role of ["verify", "fixture", "runner"] as SessionRole[]) {
      const e = expectationFor(role);
      expect(e.database).toBe(EXPECTED_TARGET.database);
      expect(e.host).toBe(EXPECTED_TARGET.host);
      expect(e.port).toBe(EXPECTED_TARGET.port);
    }
  });

  it("2. expectation runner & verify memakai user target", () => {
    expect(expectationFor("runner").user).toBe(EXPECTED_TARGET.user);
    expect(expectationFor("verify").user).toBe(EXPECTED_TARGET.user);
  });

  it("3. expectation fixture memakai bootstrap, BUKAN runner", () => {
    // Regresi F-3: fixture sebelumnya disamakan dengan verify.
    expect(expectationFor("fixture").user).toBe("t047_bootstrap");
    expect(expectationFor("fixture").user).not.toBe(expectationFor("runner").user);
  });
});

describe("Fail-closed saat identitas salah / tidak lengkap", () => {
  it("4. identitas sempurna pada mode yang cocok -> ok", () => {
    expect(verifyServerIdentity(READ_ONLY_IDENTITY, expectationFor("verify")).ok).toBe(true);
  });

  it("5. sesi verify yang ternyata READ-WRITE -> GAGAL", () => {
    const r = verifyServerIdentity({ ...READ_ONLY_IDENTITY, readOnly: false }, expectationFor("verify"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("read_only");
  });

  it("6. sesi fixture dengan user runner -> GAGAL", () => {
    const r = verifyServerIdentity(
      { ...READ_ONLY_IDENTITY, readOnly: false },
      expectationFor("fixture")
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("user");
  });

  it("7. field hilang (undefined) -> GAGAL, bukan lolos diam-diam", () => {
    const partial = { ...READ_ONLY_IDENTITY, database: undefined as unknown as string };
    const r = verifyServerIdentity(partial, expectationFor("verify"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("database");
  });

  it("8. host dengan suffix netmask tidak cocok (fail-closed, bukan longgar)", () => {
    const r = verifyServerIdentity({ ...READ_ONLY_IDENTITY, host: "127.0.0.1/32" }, expectationFor("verify"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("host");
  });

  it("9. host null (non-TCP) -> GAGAL", () => {
    const r = verifyServerIdentity({ ...READ_ONLY_IDENTITY, host: null }, expectationFor("verify"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("host");
  });

  it("10. in_recovery / database / port salah -> GAGAL", () => {
    const r = verifyServerIdentity(
      { ...READ_ONLY_IDENTITY, inRecovery: true, database: "postgres", port: 5432 },
      expectationFor("verify")
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failedFields).toEqual(expect.arrayContaining(["database", "port", "in_recovery"]));
    }
  });
});