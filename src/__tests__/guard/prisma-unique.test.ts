import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  isExpectedUniqueViolation,
  isUniqueConstraintViolation,
  type ExpectedUniqueConstraint,
} from "@/lib/prisma-unique";

// ============================================================================
// TASK 03L.2E.4.6 — F3: unit test validasi target constraint pada P2002.
//
//.Handler lama cukup memeriksa `code === "P2002"`, sehingga konflik unik yang
// TIDAK terkait (mis. unique milik kolom lain, atau meta.target yang hilang)
// ikut disalin menjadi 409/200. Helper ini mengunci perilaku: hanya target
// yang dicocokkan persis yang dianggap race idempotensi.
// ============================================================================

const ATTEMPT: readonly ExpectedUniqueConstraint[] = [
  { fields: ["attemptKey"], indexNames: ["ExamAttempt_attemptKey_key"] },
  { fields: ["periodId", "userId"], indexNames: ["ExamAttempt_periodId_userId_key"] },
];

const RESULT: readonly ExpectedUniqueConstraint[] = [
  { fields: ["attemptId"], indexNames: ["ExamResult_attemptId_key"] },
];

function p2002(meta?: { target?: unknown }): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta,
  });
}

describe("isUniqueConstraintViolation", () => {
  it("1. true hanya untuk P2002", () => {
    expect(isUniqueConstraintViolation(p2002({ target: ["attemptKey"] }))).toBe(true);
    const other = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(isUniqueConstraintViolation(other)).toBe(false);
    expect(isUniqueConstraintViolation(new Error("P2002"))).toBe(false);
    expect(isUniqueConstraintViolation(null)).toBe(false);
  });
});

describe("isExpectedUniqueViolation — bentuk target yang COCOK", () => {
  it("2. array kolom persis sama -> true", () => {
    expect(isExpectedUniqueViolation(p2002({ target: ["attemptKey"] }), ATTEMPT)).toBe(true);
    expect(isExpectedUniqueViolation(p2002({ target: ["periodId", "userId"] }), ATTEMPT)).toBe(true);
  });

  it("3. urutan kolom tidak berpengaruh (dibandingkan sebagai set)", () => {
    expect(isExpectedUniqueViolation(p2002({ target: ["userId", "periodId"] }), ATTEMPT)).toBe(true);
  });

  it("4. bentuk string: nama kolom -> true", () => {
    expect(isExpectedUniqueViolation(p2002({ target: "attemptKey" }), ATTEMPT)).toBe(true);
  });

  it("5. bentuk string: nama index Postgres -> true", () => {
    expect(isExpectedUniqueViolation(p2002({ target: "ExamAttempt_attemptKey_key" }), ATTEMPT)).toBe(true);
    expect(isExpectedUniqueViolation(p2002({ target: "ExamResult_attemptId_key" }), RESULT)).toBe(true);
  });

  it("6. ExamResult.create hanya cocok pada target attemptId", () => {
    expect(isExpectedUniqueViolation(p2002({ target: ["attemptId"] }), RESULT)).toBe(true);
  });
});

describe("isExpectedUniqueViolation — target TIDAK cocok / tidak tersedia", () => {
  it("7. constraint lain pada model yang sama -> false", () => {
    expect(isExpectedUniqueViolation(p2002({ target: ["seed"] }), ATTEMPT)).toBe(false);
    expect(isExpectedUniqueViolation(p2002({ target: ["id"] }), RESULT)).toBe(false);
  });

  it("8. target subset dari constraint yang diharapkan -> false (tidak boleh longgar)", () => {
    expect(isExpectedUniqueViolation(p2002({ target: ["periodId"] }), ATTEMPT)).toBe(false);
  });

  it("9. target superset -> false", () => {
    expect(isExpectedUniqueViolation(p2002({ target: ["attemptKey", "userId"] }), ATTEMPT)).toBe(false);
  });

  it("10. meta.target tidak ada -> false (fail closed)", () => {
    expect(isExpectedUniqueViolation(p2002(), ATTEMPT)).toBe(false);
    expect(isExpectedUniqueViolation(p2002({}), ATTEMPT)).toBe(false);
  });

  it("11. target dengan bentuk tidak didukung -> false", () => {
    expect(isExpectedUniqueViolation(p2002({ target: 42 }), ATTEMPT)).toBe(false);
    expect(isExpectedUniqueViolation(p2002({ target: [] }), ATTEMPT)).toBe(false);
    expect(isExpectedUniqueViolation(p2002({ target: "" }), ATTEMPT)).toBe(false);
    expect(isExpectedUniqueViolation(p2002({ target: [1, 2] }), ATTEMPT)).toBe(false);
    expect(isExpectedUniqueViolation(p2002({ target: ["attemptKey", null] }), ATTEMPT)).toBe(false);
    expect(isExpectedUniqueViolation(p2002({ target: null }), ATTEMPT)).toBe(false);
  });

  it("12. target duplikat -> false (tidak dianggap sah)", () => {
    expect(isExpectedUniqueViolation(p2002({ target: ["attemptKey", "attemptKey"] }), ATTEMPT)).toBe(false);
  });

  it("13. target bukan P2002 -> false walau nilainya cocok", () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "test",
      meta: { target: ["attemptKey"] },
    });
    expect(isExpectedUniqueViolation(p2025, ATTEMPT)).toBe(false);
    expect(isExpectedUniqueViolation(new Error("boom"), ATTEMPT)).toBe(false);
  });

  it("14. daftar expected kosong -> selalu false", () => {
    expect(isExpectedUniqueViolation(p2002({ target: ["attemptKey"] }), [])).toBe(false);
  });
});