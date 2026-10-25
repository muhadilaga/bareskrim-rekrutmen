import { describe, expect, it } from "vitest";
import {
  EXPECTED_TARGET,
  buildRunnerUrl,
  describeGuardFailure,
  extractRunnerCredential,
  redactUrl,
  validateTargetUrl,
  type TargetSpec,
} from "../support/target-guard";

// ============================================================================
// TASK 03L.2E.4.10B — Unit test hard guard target.
//
// MODUL INI TIDAK PERNAH MEMBUKA KONEKSI DATABASE. Hanya logika string/URL.
// Semua kredensial di bawah adalah SINTETIS, bukan secret.
// ============================================================================

const FAKE_PASSWORD = "S3NT3LIS-SINTETIK-JANGAN-DIPAKAI";

function validUrl(over: Partial<TargetSpec> = {}, password = FAKE_PASSWORD) {
  return `postgresql://${over.user ?? EXPECTED_TARGET.user}:${password}@${
    over.host ?? EXPECTED_TARGET.host
  }:${over.port ?? EXPECTED_TARGET.port}/${over.database ?? EXPECTED_TARGET.database}`;
}

describe("Guard menerima target yang benar", () => {
  it("1. URL persis sesuai target -> ok", () => {
    const r = validateTargetUrl(validUrl());
    expect(r.ok).toBe(true);
  });

  it("2. username ter-URL-encode tetap diterima", () => {
    const url = "postgresql://t047_runner:p%40ss@127.0.0.1:55433/t047_concurrency";
    expect(validateTargetUrl(url).ok).toBe(true);
  });
});

describe("Guard menolak target yang salah", () => {
  it("3. port 5432 DITOLAK eksplisit", () => {
    const r = validateTargetUrl(validUrl({ port: 5432 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("port_forbidden");
  });

  it("4. port lain (mis. 6543 pooler) DITOLAK", () => {
    const r = validateTargetUrl(validUrl({ port: 6543 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("port");
  });

  it("5. host remote / Supabase DITOLAK", () => {
    const r = validateTargetUrl(validUrl({ host: "db.abcxyz.supabase.co" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("host");
  });

  it("6. database lain DITOLAK", () => {
    const r = validateTargetUrl(validUrl({ database: "postgres" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("database");
  });

  it("7. role lain (bootstrap) DITOLAK", () => {
    const r = validateTargetUrl(validUrl({ user: "t047_bootstrap" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("user");
  });

  it("8. URL kosong / undefined DITOLAK", () => {
    expect(validateTargetUrl(undefined).ok).toBe(false);
    expect(validateTargetUrl(null).ok).toBe(false);
    expect(validateTargetUrl("").ok).toBe(false);
  });

  it("9. URL tidak bisa diparse DITOLAK", () => {
    const r = validateTargetUrl("bukan-url");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("url_unparsable");
  });

  it("10. password kosong DITOLAK", () => {
    const r = validateTargetUrl("postgresql://t047_runner@127.0.0.1:55433/t047_concurrency");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("password_missing");
  });

  it("11. skema non-postgresql DITOLAK", () => {
    const r = validateTargetUrl("mysql://u:p@127.0.0.1:55433/t047_concurrency");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedFields).toContain("protocol");
  });

  it("12. beberapa field salah dilaporkan GABUNG", () => {
    const r = validateTargetUrl("postgresql://t047_bootstrap:x@evil.example:5432/produksi");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failedFields).toEqual(
        expect.arrayContaining(["host", "port_forbidden", "database", "user"])
      );
    }
  });
});

describe("Tidak ada kebocoran credential di output", () => {
  it("13. pesan kegagalan TIDAK memuat password maupun URL lengkap", () => {
    const url = validUrl({ port: 5432 }, FAKE_PASSWORD);
    const msg = describeGuardFailure(validateTargetUrl(url));

    expect(msg).not.toContain(FAKE_PASSWORD);
    expect(msg).not.toContain(url);
    expect(msg).not.toContain("postgresql://");
    expect(msg).toContain("port_forbidden");
  });

  it("14. redacted URL menyembunyikan password tapi menjaga target", () => {
    const url = validUrl({}, FAKE_PASSWORD);
    const safe = redactUrl(url);

    expect(safe).not.toContain(FAKE_PASSWORD);
    expect(safe).toContain("127.0.0.1:55433");
    expect(safe).toContain("t047_concurrency");
    expect(safe).toContain("***");
  });

  it("15. redacted URL tidak bocor untuk input rusak", () => {
    expect(redactUrl("bukan-url")).toBe("<unparsable-url>");
    expect(redactUrl("postgresql://u:p%zz@127.0.0.1:55433/db")).not.toContain("p%zz");
  });
});

describe("Ekstraksi kredensial dari pgpass (data sintetis)", () => {
  const synthetic = [
    "# komentar diabaikan",
    "127.0.0.1:55433:t047_concurrency:t047_bootstrap:bootstrap-sintetis",
    "127.0.0.1:55433:t047_concurrency:t047_runner:runner-sintetis",
    "",
  ].join("\n");

  const expected: TargetSpec = { ...EXPECTED_TARGET };

  it("16. mengambil baris runner yang cocok, mengabaikan yang lain", () => {
    const cred = extractRunnerCredential(synthetic, expected);
    expect(cred).toEqual({ user: "t047_runner", password: "runner-sintetis" });
  });

  it("17. tidak mengambil role lain", () => {
    const cred = extractRunnerCredential(synthetic, { ...expected, user: "t047_bootstrap" });
    expect(cred?.password).toBe("bootstrap-sintetis");
  });

  it("18. mengabaikan entri dengan host/port/db yang berbeda", () => {
    const text = "db.supabase.co:6543:postgres:postgres:x\n";
    expect(extractRunnerCredential(text, expected)).toBeNull();
  });

  it("19. mengabaikan baris komentar dan baris rusak", () => {
    expect(extractRunnerCredential("# only comment\nnot-enough-parts\n", expected)).toBeNull();
  });

  it("20. password dengan tanda titik dua dipertahankan utuh", () => {
    const text = "127.0.0.1:55433:t047_concurrency:t047_runner:pa:ss:word\n";
    expect(extractRunnerCredential(text, expected)?.password).toBe("pa:ss:word");
  });
});

describe("Rakitan URL", () => {
  it("21. buildRunnerUrl menghasilkan URL yang LULUS guard", () => {
    const url = buildRunnerUrl({
      host: EXPECTED_TARGET.host,
      port: EXPECTED_TARGET.port,
      database: EXPECTED_TARGET.database,
      user: EXPECTED_TARGET.user,
      password: FAKE_PASSWORD,
    });
    expect(url).toContain("127.0.0.1:55433/t047_concurrency");
    expect(validateTargetUrl(url).ok).toBe(true);
  });

  it("22. karakter khusus pada kredensial ter-encode dengan benar", () => {
    const url = buildRunnerUrl({
      host: EXPECTED_TARGET.host,
      port: EXPECTED_TARGET.port,
      database: EXPECTED_TARGET.database,
      user: EXPECTED_TARGET.user,
      password: "p@ss:w/rd#1",
    });
    expect(validateTargetUrl(url).ok).toBe(true);
  });
});