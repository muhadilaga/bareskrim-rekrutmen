// ============================================================
// Engine Pengacakan & Auto-Grading (SERVER-SIDE ONLY)
// correctKey / keywords TIDAK PERNAH bocor ke client.
// ============================================================

import type { Question } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { CONFIG } from "@/lib/constants";

// Deterministic RNG (mulberry32)
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// Snapshot soal (tersimpan di ExamAttempt.questionsJson)
// ============================================================

export interface SnapshotOption {
  key: string;
  text: string;
}

export interface SnapshotQuestion {
  id: string;
  type: "MCQ" | "ESSAY";
  prompt: string;
  points: number;
  options?: SnapshotOption[]; // MCQ
  correctKey?: string; // MCQ - SERVER ONLY
  keywords?: string[]; // ESSAY - SERVER ONLY
}

// Versi yang aman dikirim ke client (tanpa correctKey/keywords)
export type ClientQuestion = Omit<SnapshotQuestion, "correctKey" | "keywords">;

function toSnapshot(q: Question, rng: () => number): SnapshotQuestion {
  if (q.type === "ESSAY") {
    return {
      id: q.id,
      type: "ESSAY",
      prompt: q.prompt,
      points: q.points,
      keywords: (q.keywords as unknown as string[]) ?? [],
    };
  }

  const rawOptions = (q.options as unknown as Array<{ key: string; text: string }>) ?? [];
  const shuffled = seededShuffle(rawOptions, rng);
  const presented: SnapshotOption[] = shuffled.map((opt, idx) => ({
    key: String.fromCharCode(65 + idx),
    text: opt.text,
  }));
  const correctIdx = shuffled.findIndex((opt) => opt.key === q.correctKey);

  return {
    id: q.id,
    type: "MCQ",
    prompt: q.prompt,
    points: q.points,
    options: presented,
    correctKey: correctIdx >= 0 ? presented[correctIdx].key : undefined,
  };
}

// Bangun soal acak dari bank soal, diurutkan MCQ dahulu lalu Essay.
// - `seed` (periode): memilih SUBSET soal yang sama untuk semua casis (adil).
// - `userSeed` (opsional, per username): mengacak URUTAN soal & posisi opsi
//   berbeda tiap casis, sehingga jawaban tidak bisa dikomunikasikan antar user.
// - `mcqCount`/`essayCount`: jumlah soal per jenis (default dari CONFIG).
export function buildQuestionSet(
  mcqs: Question[],
  essays: Question[],
  seed: number,
  userSeed?: number,
  mcqCount: number = CONFIG.mcqCount,
  essayCount: number = CONFIG.essayCount
): SnapshotQuestion[] {
  const pickRng = mulberry32(seed);
  const mcqPick = seededShuffle(mcqs, pickRng).slice(0, mcqCount);
  const essayPick = seededShuffle(essays, pickRng).slice(0, essayCount);

  const rng = userSeed !== undefined ? mulberry32(userSeed) : pickRng;
  const mcqOrdered = seededShuffle(mcqPick, rng);
  const essayOrdered = seededShuffle(essayPick, rng);
  const all = [...mcqOrdered, ...essayOrdered];
  return all.map((q) => toSnapshot(q, rng));
}

// Hash string -> int 32-bit (deterministik). Dipakai membuat seed per username.
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function sanitizeForClient(snapshot: SnapshotQuestion[]): ClientQuestion[] {
  return snapshot.map(({ correctKey: _ck, keywords: _kw, ...rest }) => rest);
}

// Helper: serialize GradedAnswerDetail[] ke format JSON-safe untuk Prisma Json
export function serializeGradedDetails(details: GradedAnswerDetail[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue;
}

// ============================================================
// Auto-Grading
// ============================================================

export interface GradedAnswerDetail {
  questionId: string;
  type: "MCQ" | "ESSAY";
  prompt: string;
  points: number;
  userAnswer: string;
  isCorrect: boolean | null; // null utk essay
  earned: number;
  options?: SnapshotOption[];
  correctKey?: string;
  matchedKeywords?: string[];
}

export interface GradingResult {
  score: number;
  maxScore: number;
  mcqScore: number;
  essayScore: number;
  status: "LULUS" | "TIDAK_LULUS";
  passed: boolean;
  details: GradedAnswerDetail[];
}

export function gradeExam(
  snapshot: SnapshotQuestion[],
  answers: Record<string, string>,
  _kkm: number = CONFIG.kkm
): GradingResult {
  let score = 0;
  let maxScore = 0;
  let mcqScore = 0;
  let essayScore = 0;
  const details: GradedAnswerDetail[] = [];

  for (const q of snapshot) {
    const userAnswer = (answers[q.id] ?? "").trim();
    maxScore += q.points;

    if (q.type === "MCQ") {
      const isCorrect = userAnswer.length > 0 && userAnswer === q.correctKey;
      const earned = isCorrect ? q.points : 0;
      score += earned;
      mcqScore += earned;
      details.push({
        questionId: q.id,
        type: "MCQ",
        prompt: q.prompt,
        points: q.points,
        userAnswer,
        isCorrect,
        earned,
        options: q.options,
        correctKey: q.correctKey,
      });
    } else {
      const keywords = q.keywords ?? [];
      const matched = keywords.filter((k) =>
        userAnswer.toLowerCase().includes(k.toLowerCase())
      );
      const earned =
        keywords.length > 0
          ? Math.round((q.points * matched.length) / keywords.length)
          : 0;
      score += earned;
      essayScore += earned;
      details.push({
        questionId: q.id,
        type: "ESSAY",
        prompt: q.prompt,
        points: q.points,
        userAnswer,
        isCorrect: null,
        earned,
        matchedKeywords: matched,
      });
    }
  }

  const passed = true;
  return {
    score,
    maxScore,
    mcqScore,
    essayScore,
    status: "LULUS",
    passed,
    details,
  };
}
