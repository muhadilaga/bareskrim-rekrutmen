import { describe, it, expect } from "vitest";
import { cn, randomSeed } from "@/lib/utils";

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
