import { describe, it, expect } from "vitest";
import { mulberry32, hashString, seededShuffle, buildQuestionSet, gradeExam, sanitizeForClient } from "@/lib/grading";
import type { Question } from "@prisma/client";

function makeMcq(id: string, correctKey = "A", options = [{ key: "A", text: "x" }, { key: "B", text: "y" }, { key: "C", text: "z" }]): Question {
  return {
    id,
    type: "MCQ",
    prompt: `Soal ${id}`,
    options,
    correctKey,
    keywords: null,
    points: 4,
    isActive: true,
    createdAt: new Date(),
    deletedAt: null,
  } as Question;
}

function makeEssay(id: string, keywords = ["reserse"]): Question {
  return {
    id,
    type: "ESSAY",
    prompt: `Essay ${id}`,
    options: null,
    correctKey: null,
    keywords,
    points: 8,
    isActive: true,
    createdAt: new Date(),
    deletedAt: null,
  } as Question;
}

describe("mulberry32 (RNG deterministik)", () => {
  it("menghasilkan urutan yang sama untuk seed yang sama", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("menghasilkan nilai dalam rentang [0,1)", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hashString", () => {
  it("deterministik", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
  });

  it("menghasilkan nilai berbeda untuk input berbeda", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("seededShuffle", () => {
  it("melestarikan semua elemen (permutasi)", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng = mulberry32(7);
    const shuffled = seededShuffle(arr, rng);
    expect([...shuffled].sort()).toEqual([...arr].sort());
  });
});

describe("buildQuestionSet", () => {
  it("mengambil subset dengan jumlah sesuai mcqCount/essayCount", () => {
    const mcqs = [makeMcq("m1"), makeMcq("m2"), makeMcq("m3"), makeMcq("m4")];
    const essays = [makeEssay("e1"), makeEssay("e2"), makeEssay("e3")];
    const set = buildQuestionSet(mcqs, essays, 100, 200, 2, 1);
    expect(set.filter((q) => q.type === "MCQ")).toHaveLength(2);
    expect(set.filter((q) => q.type === "ESSAY")).toHaveLength(1);
  });

  it("urutan MCQ didahulukan sebelum Essay", () => {
    const mcqs = [makeMcq("m1"), makeMcq("m2")];
    const essays = [makeEssay("e1")];
    const set = buildQuestionSet(mcqs, essays, 1, 2, 2, 1);
    expect(set[0].type).toBe("MCQ");
    expect(set[1].type).toBe("MCQ");
    expect(set[2].type).toBe("ESSAY");
  });
});

describe("sanitizeForClient", () => {
  it("membuang correctKey dan keywords", () => {
    const snap = buildQuestionSet([makeMcq("m1", "B")], [makeEssay("e1", ["xx"])], 5, 6, 1, 1);
    const client = sanitizeForClient(snap);
    for (const q of client) {
      expect(q).not.toHaveProperty("correctKey");
      expect(q).not.toHaveProperty("keywords");
    }
  });
});

describe("gradeExam", () => {
  const mockQ = (id: string, type: "MCQ" | "ESSAY", points: number, correctKey?: string, keywords?: string[]) => ({
    id,
    type,
    prompt: `Q ${id}`,
    points,
    correctKey,
    keywords,
  });

  it("MCQ benar menghasilkan poin penuh, salah = 0", () => {
    const snapshot = [
      mockQ("1", "MCQ", 4, "A") as any,
      mockQ("2", "MCQ", 4, "B") as any,
    ];
    const result = gradeExam(snapshot, { "1": "A", "2": "C" }, 70);
    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(8);
    expect(result.mcqScore).toBe(4);
  });

  it("Essay dinilai berdasarkan proporsi keyword yang cocok", () => {
    const snapshot = [mockQ("e1", "ESSAY", 8, undefined, ["reserse", "kriminal"]) as any];
    const result = gradeExam(snapshot, { e1: "tugas reserse menyelidiki kriminal" }, 70);
    expect(result.essayScore).toBe(8);
    expect(result.score).toBe(8);
  });

  it("Essay keyword tertutup", () => {
    const snapshot = [mockQ("e1", "ESSAY", 8, undefined, ["reserse", "kriminal"]) as any];
    const result = gradeExam(snapshot, { e1: "tidak ada keyword sama sekali" }, 70);
    expect(result.essayScore).toBe(0);
  });

  it("status LULUS bila score >= kkm, else TIDAK_LULUS", () => {
    const snapshot = [mockQ("1", "MCQ", 10, "A") as any];
    expect(gradeExam(snapshot, { "1": "A" }, 10).passed).toBe(true);
    expect(gradeExam(snapshot, { "1": "A" }, 11).passed).toBe(false);
  });
});
