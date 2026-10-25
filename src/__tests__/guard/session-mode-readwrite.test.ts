import { describe, expect, it } from "vitest";
import { EXPECTED_TARGET } from "../support/target-guard";
import {
  ROLE_USER,
  expectationFor,
  expectedReadOnlyFor,
  verifyServerIdentity,
  type ServerIdentity,
} from "../support/identity";

// ============================================================================
// TASK 03L.2E4.10B — Unit test A-3: ekspektasi mode sesi per peran.
// Tidak ada koneksi database di sini.
// ============================================================================

const BASE: ServerIdentity = {
  database: EXPECTED_TARGET.database,
  user: EXPECTED_TARGET.user,
  host: EXPECTED_TARGET.host,
  port: EXPECTED_TARGET.port,
  version: "PostgreSQL 18.6",
  inRecovery: false,
  readOnly: false,
};

describe("A-3: mode sesi mengikuti peran", () => {
  it("1. verify WAJIB read-only", () => {
    expect(expectedReadOnlyFor("verify")).toBe(true);
    expect(expectationFor("verify").readOnly).toBe(true);
  });

  it("2. fixture WAJIB read-write", () => {
    expect(expectedReadOnlyFor("fixture")).toBe(false);
    expect(expectationFor("fixture").readOnly).toBe(false);
  });

  it("3. runner WAJIB read-write", () => {
    expect(expectedReadOnlyFor("runner")).toBe(false);
    expect(expectationFor("runner").readOnly).toBe(false);
  });

  it("4. tidak lagi semua peran readOnly=true (regresi lama)", () => {
    const modes = (["verify", "fixture", "runner"] as const).map(expectedReadOnlyFor);
    expect(new Set(modes).size).toBe(2); // {true, false}, bukan semua true.
  });

  it("5. sesi verify yang ternyata read-write -> GAGAL (fail-closed)", () => {
    const r = verifyServerIdentity({ ...BASE, readOnly: false }, expectationFor("verify"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("read_only");
  });

  it("6. sesi fixture/runner yang ternyata read-only -> GAGAL (fail-closed)", () => {
    for (const role of ["fixture", "runner"] as const) {
      const r = verifyServerIdentity({ ...BASE, readOnly: true }, expectationFor(role));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.failedFields).toContain("read_only");
    }
  });

  it("7. mode + user + target semuanya harus cocok", () => {
    expect(verifyServerIdentity({ ...BASE, readOnly: false }, expectationFor("fixture")).ok).toBe(
      false
    ); // user salah (runner != bootstrap)
    expect(
      verifyServerIdentity(
        { ...BASE, user: "t047_bootstrap", readOnly: false },
        expectationFor("fixture")
      ).ok
    ).toBe(true);
  });

  it("8. peran memakai user yang benar", () => {
    expect(ROLE_USER.fixture).toBe("t047_bootstrap");
    expect(ROLE_USER.runner).toBe(EXPECTED_TARGET.user);
    expect(ROLE_USER.verify).toBe(EXPECTED_TARGET.user);
  });
});