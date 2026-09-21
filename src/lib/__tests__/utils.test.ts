import { describe, it, expect } from "vitest";
import { cn, isNextRedirectError, randomSeed } from "@/lib/utils";

describe("cn", () => {
  it("menggabungkan kelas valid dan membuang yang falsy", () => {
    expect(cn("a", "b")).toBe("a b");
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn()).toBe("");
  });
});

describe("randomSeed", () => {
  it("menghasilkan bilangan bulat positif", () => {
    for (let i = 0; i < 100; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
    }
  });

  it("menghasilkan nilai bervariasi", () => {
    const set = new Set(Array.from({ length: 50 }, () => randomSeed()));
    // Sangat kecil kemungkinan ke-50 semuanya sama
    expect(set.size).toBeGreaterThan(1);
  });
});

describe("isNextRedirectError", () => {
  it("returns true for errors with NEXT_REDIRECT digest", () => {
    const err = new Error("redirect") as Error & { digest: string };
    err.digest = "NEXT_REDIRECT;push;/login;307;";
    expect(isNextRedirectError(err)).toBe(true);
  });

  it("returns false for regular errors", () => {
    expect(isNextRedirectError(new Error("db timeout"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isNextRedirectError("NEXT_REDIRECT")).toBe(false);
    expect(isNextRedirectError(null)).toBe(false);
    expect(isNextRedirectError(undefined)).toBe(false);
  });
});
