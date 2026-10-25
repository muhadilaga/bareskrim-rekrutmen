import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// TASK 03L.2E.4.10B-SEC — Keamanan `cron/auto-submit`.
//
// Laporan 10B-PRE menemukan route ini tidak punya satu pun lapisan proteksi,
// sementara `cron/discord-retry` punya dua. Tes ini mengunciLima hal:
//
//  1-3. Gerbang `x-admin-key` (tolak tanpa key, tolak key salah, terima key valid)
//  4. Permintaan tidak sah berhenti SEBELUM query/mutasi DB apa pun
//  6.  Batch dibatasi + paginasi kursor tidak mengulang attempt yang sudah jadi
//  7.  Filter soft-delete (ExamAttempt + relasi ExamPeriod)
//  8.  Kegagalan satu attempt tidak menghasilkan loop tanpa kemajuan
//
// KETERBATASAN: seluruh tes memakai mock Prisma. Mock membuktikan logika
// route, BUKAN autentikasi runtime (header nyata, TLS, reverse proxy) dan
// BUKAN konfigurasi scheduler produksi. Keduanya belum terverifikasi.
// ============================================================================

const TEST_ADMIN_KEY = "test-admin-key-not-a-real-secret";

const state: {
  attemptsById: Map<string, Record<string, unknown>>;
  findManyCalls: Array<Record<string, unknown>>;
  resultCreates: string[];
  attemptUpdates: string[];
} = {
  attemptsById: new Map(),
  findManyCalls: [],
  resultCreates: [],
  attemptUpdates: [],
};

const mockPrisma = {
  examAttempt: {
    findMany: vi.fn(async (args: Record<string, unknown>) => {
      state.findManyCalls.push(args);
      const where = (args.where ?? {}) as {
        submittedAt?: null;
        startedAt?: { lt: Date };
        deletedAt?: null;
        period?: { deletedAt: null };
        user?: { deletedAt?: null; matraBlocked?: false };
      };

      let rows = [...state.attemptsById.values()];
      // submittedAt: null — Prisma memfilter di sisi memori pada mock ini.
      rows = rows.filter((r) => r.submittedAt === null);
      // startedAt < cutoff (waktu SubmittedAt null berarti belum selesai)
      if (where.startedAt?.lt) {
        const cutoff = where.startedAt.lt.getTime();
        rows = rows.filter((r) => new Date(r.startedAt as string).getTime() < cutoff);
      }
      // deletedAt: null
      if (where.deletedAt === null) rows = rows.filter((r) => r.deletedAt === null);
      // period.deletedAt: null
      if (where.period?.deletedAt === null) {
        rows = rows.filter(
          (r) => (r.period as { deletedAt: Date | null } | null)?.deletedAt === null,
        );
      }
      // user.deletedAt: null
      if (where.user?.deletedAt === null) {
        rows = rows.filter(
          (r) => (r.user as { deletedAt: Date | null } | null)?.deletedAt === null,
        );
      }
      // user.matraBlocked: false
      if (where.user?.matraBlocked === false) {
        rows = rows.filter(
          (r) => (r.user as { matraBlocked: boolean } | null)?.matraBlocked === false,
        );
      }

      // Paginasi kursor: emulate Prisma orderBy id asc + cursor + skip
      rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const cursor = args.cursor as { id: string } | undefined;
      if (cursor) rows = rows.filter((r) => String(r.id) > cursor.id);
      const take = (args.take as number | undefined) ?? rows.length;
      return rows.slice(0, take);
    }),
    updateMany: vi.fn(async (args: { where: { id: string; submittedAt: null }; data: Record<string, unknown> }) => {
      state.attemptUpdates.push(args.where.id);
      const row = state.attemptsById.get(args.where.id);
      if (row && row.submittedAt === null) {
        Object.assign(row, args.data);
        return { count: 1 };
      }
      return { count: 0 };
    }),
    update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      state.attemptUpdates.push(args.where.id);
      const row = state.attemptsById.get(args.where.id);
      if (row) Object.assign(row, args.data);
      return row ?? {};
    }),
  },
  examResult: {
    create: vi.fn(async (args: { data: { attemptId: string } }) => {
      state.resultCreates.push(args.data.attemptId);
      return { id: `res-${args.data.attemptId}` };
    }),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/constants", () => ({
  CONFIG: { kkm: 75, examDurationMinutes: 45 },
  getAdminKey: () => TEST_ADMIN_KEY,
}));
vi.mock("@/lib/grading", () => ({
  gradeExam: vi.fn(() => ({
    score: 80,
    maxScore: 100,
    mcqScore: 60,
    essayScore: 20,
    status: "LULUS",
    passed: true,
    details: [],
  })),
}));

const { GET } = await import("@/app/api/cron/auto-submit/route");

function get(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/auto-submit", { headers });
}

function withKey(key = TEST_ADMIN_KEY): Record<string, string> {
  return { "x-admin-key": key };
}

/** Attempt default: belum submit, sudah lewat deadline, tidak soft-deleted. */
function attempt(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    startedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    submittedAt: null,
    deletedAt: null,
    questionsJson: [{ id: "q1", type: "MCQ", prompt: "?", correctKey: "A", points: 4 }],
    period: { passThreshold: 70, deletedAt: null },
    answers: [{ questionId: "q1", answer: "A" }],
    user: { deletedAt: null, matraBlocked: false },
    ...over,
  };
}

function reset(attempts: Array<Record<string, unknown>> = []) {
  state.attemptsById = new Map(attempts.map((a) => [String(a.id), a]));
  state.findManyCalls = [];
  state.resultCreates = [];
  state.attemptUpdates = [];
  mockPrisma.examResult.create = vi.fn(async (args: { data: { attemptId: string } }) => {
    state.resultCreates.push(args.data.attemptId);
    return { id: `res-${args.data.attemptId}` };
  });
  delete ((mockPrisma as Record<string, unknown>).examResult as Record<string, unknown>).findUnique;
  vi.clearAllMocks();
}

beforeEach(() => reset());

// ---------------------------------------------------------------------------
// 1-3. Gerbang autentikasi
// ---------------------------------------------------------------------------

describe("auth gate — x-admin-key", () => {
  it("1. tanpa header x-admin-key -> 401 dan TIDAK menyentuh database", async () => {
    reset([attempt("att-1")]);

    const res = await GET(get());

    expect(res.status).toBe(401);
    const json = (await res.json()) as { ok: boolean; message: string };
    expect(json.ok).toBe(false);
    // Syarat 4: berhenti sebelum query/mutasi apa pun.
    expect(mockPrisma.examAttempt.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.examResult.create).not.toHaveBeenCalled();
    expect(mockPrisma.examAttempt.updateMany).not.toHaveBeenCalled();
    expect(state.findManyCalls).toHaveLength(0);
  });

  it("2. key salah -> 401, database tidak disentuh", async () => {
    reset([attempt("att-1")]);

    const res = await GET(get(withKey("wrong-key")));

    expect(res.status).toBe(401);
    expect(mockPrisma.examAttempt.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.examResult.create).not.toHaveBeenCalled();
  });

  it("3. key valid -> lolos gerbang, respons 200 dengan ok:true", async () => {
    reset([attempt("att-1")]);

    const res = await GET(get(withKey()));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; processed: number; failed: number };
    expect(json.ok).toBe(true);
    expect(json.processed).toBe(1);
    expect(json.failed).toBe(0);
  });

  it("3b. respons 401 tidak pernah membocorkan nilai key", async () => {
    reset();
    const res = await GET(get(withKey("wrong-key")));
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain(TEST_ADMIN_KEY);
    expect(body.toLowerCase()).not.toContain("admin-key");
  });
});

// ---------------------------------------------------------------------------
// 6. Pembatasan batch + paginasi kursor
// ---------------------------------------------------------------------------

describe("batch limiting — take + cursor pagination", () => {
  it("6a. findMany dipanggil dengan take dan orderBy id asc", async () => {
    reset([attempt("att-1")]);

    await GET(get(withKey()));

    expect(state.findManyCalls.length).toBeGreaterThan(0);
    const first = state.findManyCalls[0]!;
    expect(first.take).toBe(50);
    expect(first.orderBy).toEqual({ id: "asc" });
  });

  it("6b. banyak attempt diproses dalam batch terpisah, kursor maju, tidak ada attempt yang terulang", async () => {
    // 120 attempt > 50 (BATCH_SIZE) → butuh ≥3 findMany.
    const many = Array.from({ length: 120 }, (_, i) => attempt(`att-${String(i).padStart(3, "0")}`));
    reset(many);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number; failed: number };

    expect(json.processed).toBe(120);
    expect(state.findManyCalls.length).toBeGreaterThanOrEqual(3);

    // Tidak ada attempt yang diproses dua kali.
    expect(state.resultCreates).toHaveLength(120);
    expect(new Set(state.resultCreates).size).toBe(120);
    expect(state.attemptUpdates).toHaveLength(120);

    // Cursor benar-benar maju: setiap panggilan berikutnya punya cursor.
    const cursors = state.findManyCalls
      .slice(1)
      .map((c) => (c.cursor as { id: string } | undefined)?.id);
    expect(cursors.every((c) => typeof c === "string" && c.length > 0)).toBe(true);
    // Cursor naik monoton.
    for (let i = 1; i < cursors.length; i++) {
      expect(cursors[i]! > cursors[i - 1]!).toBe(true);
    }
  });

  it("6c. attempt yang sudah diproses tidak diambil lagi pada batch berikutnya", async () => {
    const many = Array.from({ length: 70 }, (_, i) => attempt(`att-${String(i).padStart(3, "0")}`));
    reset(many);

    await GET(get(withKey()));

    // Setiap id hanya muncul sebagai cursor satu kali → tidak ada pagination ulang.
    const cursorIds = state.findManyCalls
      .map((c) => (c.cursor as { id: string } | undefined)?.id)
      .filter((v): v is string => typeof v === "string");
    expect(new Set(cursorIds).size).toBe(cursorIds.length);
  });

  it("6d. jumlah attempt diproses <= MAX_BATCHES * BATCH_SIZE (plafon keras)", async () => {
    // 5000 attempt — jauh di atas 20 * 50 = 1000.
    const huge = Array.from({ length: 5000 }, (_, i) => attempt(`att-${String(i).padStart(4, "0")}`));
    reset(huge);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number };

    expect(json.processed).toBe(1000);
    expect(state.findManyCalls.length).toBe(20);
    expect(state.findManyCalls.length).toBeLessThanOrEqual(20);
  });

  it("6e. tidak ada attempt → 200, processed 0, findMany dipanggil sekali", async () => {
    reset([]);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number };

    expect(res.status).toBe(200);
    expect(json.processed).toBe(0);
    expect(state.findManyCalls).toHaveLength(1);
  });

  it("6f. include tidak lagi memuat user; period + answers tetap ada", async () => {
    reset([attempt("att-1")]);

    await GET(get(withKey()));

    const include = state.findManyCalls[0]!.include as Record<string, unknown>;
    expect(include).not.toHaveProperty("user");
    expect(include).toHaveProperty("period");
    expect(include).toHaveProperty("answers");
  });
});

// ---------------------------------------------------------------------------
// 7. Filter soft-delete
// ---------------------------------------------------------------------------

describe("soft-delete filters", () => {
  it("7a. where memuat deletedAt: null untuk ExamAttempt dan relasi ExamPeriod", async () => {
    reset([attempt("att-1")]);

    await GET(get(withKey()));

    const where = state.findManyCalls[0]!.where as Record<string, unknown>;
    expect(where.deletedAt).toBeNull();
    expect(where.period).toEqual({ deletedAt: null });
  });

  it("7b. attempt yang di-soft-delete TIDAK diproses", async () => {
    reset([attempt("att-soft", { deletedAt: new Date() })]);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number };

    expect(json.processed).toBe(0);
    expect(state.resultCreates).toHaveLength(0);
  });

  it("7c. attempt dari periode yang di-soft-delete TIDAK diproses", async () => {
    reset([
      attempt("att-1", { period: { passThreshold: 70, deletedAt: new Date("2026-01-01") } }),
    ]);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number };

    expect(json.processed).toBe(0);
    expect(state.resultCreates).toHaveLength(0);
  });

  it("7d. attempt aktif diproses (kontrol: filter tidak reinstated berlebihan)", async () => {
    reset([attempt("att-1")]);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number };

    expect(json.processed).toBe(1);
  });

  it("7e. TIDAK memfilter isActive / isExamOpen / recruitmentPeriodId (kebijakan historis), hanya filter deletedAt dan user-block", async () => {
    reset([attempt("att-1")]);

    await GET(get(withKey()));

    const where = state.findManyCalls[0]!.where as Record<string, unknown>;
    expect(Object.keys(where).sort()).toEqual(
      ["deletedAt", "period", "startedAt", "submittedAt", "user"].sort(),
    );
    expect(where.user).toEqual({
      deletedAt: null,
      matraBlocked: false,
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Kegagalan satu attempt tidak menyebabkan loop tanpa kemajuan
// ---------------------------------------------------------------------------

describe("per-attempt failure isolation", () => {
  it("8a. satu attempt gagal -> attempt lain tetap diproses", async () => {
    reset([attempt("att-1"), attempt("att-2"), attempt("att-3")]);
    // Catat id-nya dulu (mencerminkan create yang benar-benar dipanggil), lalu gagal.
    mockPrisma.examResult.create.mockImplementationOnce(async (args: { data: { attemptId: string } }) => {
      state.resultCreates.push(args.data.attemptId);
      throw new Error("boom");
    });

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number; failed: number };

    expect(json.failed).toBe(1);
    expect(json.processed).toBe(2);
    expect(state.resultCreates).toEqual(["att-1", "att-2", "att-3"]);
  });

  it("8b. attempt yang GAGAL tidak diulang pada batch berikutnya (cursor maju)", async () => {
    // 60 attempt → 2 batch. Attempt pertama selalu gagal.
    const many = Array.from({ length: 60 }, (_, i) => attempt(`att-${String(i).padStart(3, "0")}`));
    reset(many);
    mockPrisma.examResult.create.mockImplementation(async (args: { data: { attemptId: string } }) => {
      if (args.data.attemptId === "att-000") {
        throw new Error("always fails");
      }
      state.resultCreates.push(args.data.attemptId);
      return { id: `res-${args.data.attemptId}` };
    });

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number; failed: number };

    // Gagal tepat satu kali, diproses 59 kali.
    expect(json.failed).toBe(1);
    expect(json.processed).toBe(59);
    // 59 = 60 - 1: attempt yang gagal tidak dihitung sebagai sukses DAN tidak diulang.
    expect(new Set(state.resultCreates).size).toBe(59);
  });

  it("8c. SEMUA attempt gagal → loop tetap berhenti, tidak hang", async () => {
    const many = Array.from({ length: 120 }, (_, i) => attempt(`att-${String(i).padStart(3, "0")}`));
    reset(many);
    mockPrisma.examResult.create.mockImplementation(async () => {
      throw new Error("everything fails");
    });

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number; failed: number };

    expect(json.processed).toBe(0);
    expect(json.failed).toBe(120);
    // Berhenti setelah habisnya attempt, bukan plafon 20 batch.
    expect(state.findManyCalls.length).toBeLessThanOrEqual(4);
    expect(state.findManyCalls.length).toBeGreaterThan(1);
  });

  it("8d. findMany yang melempar error → loop berhenti rapi, tidak melempar keluar", async () => {
    reset([attempt("att-1")]);
    mockPrisma.examAttempt.findMany.mockRejectedValueOnce(new Error("cursor row deleted"));

    const res = await GET(get(withKey()));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { processed: number; failed: number };
    expect(json.processed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Filter user-level anti-starvation (TASK 03L.2E.4.10B)
// ---------------------------------------------------------------------------

describe("user-level anti-starvation filters", () => {
  it("9a. attempt dari user soft-deleted (user.deletedAt != null) TIDAK dipilih oleh findMany", async () => {
    reset([
      attempt("att-deleted-user", {
        user: { deletedAt: new Date("2026-01-01"), matraBlocked: false },
      }),
    ]);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number; failed: number };

    expect(json.processed).toBe(0);
    expect(json.failed).toBe(0);
    expect(state.resultCreates).toHaveLength(0);
  });

  it("9b. attempt dari user matraBlocked = true TIDAK dipilih oleh findMany", async () => {
    reset([
      attempt("att-blocked-user", {
        user: { deletedAt: null, matraBlocked: true },
      }),
    ]);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number; failed: number };

    expect(json.processed).toBe(0);
    expect(json.failed).toBe(0);
    expect(state.resultCreates).toHaveLength(0);
  });

  it("9c. attempt dari user aktif dan tidak terblokir tetap dipilih dan diproses normal", async () => {
    reset([
      attempt("att-valid", {
        user: { deletedAt: null, matraBlocked: false },
      }),
    ]);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number; failed: number };

    expect(json.processed).toBe(1);
    expect(json.failed).toBe(0);
    expect(state.resultCreates).toEqual(["att-valid"]);
  });

  it("9d. batch campuran: user terblokir disaring di tingkat query, attempt eligible tetap diproses", async () => {
    reset([
      attempt("att-1-blocked", { user: { deletedAt: null, matraBlocked: true } }),
      attempt("att-2-valid", { user: { deletedAt: null, matraBlocked: false } }),
      attempt("att-3-deleted", { user: { deletedAt: new Date(), matraBlocked: false } }),
      attempt("att-4-valid", { user: { deletedAt: null, matraBlocked: false } }),
    ]);

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number; failed: number };

    expect(json.processed).toBe(2);
    expect(json.failed).toBe(0);
    expect(state.resultCreates).toEqual(["att-2-valid", "att-4-valid"]);
  });

  it("9e. pagination dan urutan kursor deterministik tetap terjaga dengan user filter", async () => {
    // 3 user valid
    reset([
      attempt("att-01-valid", { user: { deletedAt: null, matraBlocked: false } }),
      attempt("att-02-blocked", { user: { deletedAt: null, matraBlocked: true } }),
      attempt("att-03-valid", { user: { deletedAt: null, matraBlocked: false } }),
    ]);

    await GET(get(withKey()));

    expect(state.findManyCalls.length).toBeGreaterThan(0);
    const callWhere = state.findManyCalls[0]!.where as Record<string, unknown>;
    expect(callWhere.user).toEqual({ deletedAt: null, matraBlocked: false });
    expect(state.resultCreates).toEqual(["att-01-valid", "att-03-valid"]);
  });
});

// ---------------------------------------------------------------------------
// 10. PAYLOAD_CONFLICT per-attempt isolation (TASK 03L.2E.4.10B)
// ---------------------------------------------------------------------------

describe("PAYLOAD_CONFLICT failure isolation in cron auto-submit", () => {
  it("10a. PAYLOAD_CONFLICT diisolasi per-attempt dan attempt eligible berikutnya tetap selesai", async () => {
    reset([
      attempt("att-conflict"),
      attempt("att-ok"),
    ]);

    // Simulasikan P2002 conflict dengan score berbeda pada finalizeExamAttempt
    // melalui mockPrisma.examResult.create melempar P2002 conflict
    const p2002Error = new Error("Unique constraint failed");
    (p2002Error as unknown as { code: string; meta: { target: string[] } }).code = "P2002";
    (p2002Error as unknown as { code: string; meta: { target: string[] } }).meta = {
      target: ["attemptId"],
    };

    // Tambahkan examResult.findUnique pada mockPrisma agar alur recovery P2002 berjalan
    (mockPrisma as Record<string, unknown>).examResult = {
      create: vi.fn(async (args: { data: { attemptId: string } }) => {
        if (args.data.attemptId === "att-conflict") {
          throw p2002Error;
        }
        state.resultCreates.push(args.data.attemptId);
        return { id: `res-${args.data.attemptId}` };
      }),
      findUnique: vi.fn(async (args: { where: { attemptId: string } }) => {
        if (args.where.attemptId === "att-conflict") {
          // Return hasil lama dengan skor tidak konsisten (999 != 80) -> menghasilkan PAYLOAD_CONFLICT
          return {
            id: "res-old-conflict",
            attemptId: "att-conflict",
            score: 999,
            mcqScore: 900,
            essayScore: 99,
            passed: true,
            status: "LULUS",
            answersJson: JSON.stringify([{ questionId: "q1", userAnswer: "WRONG" }]),
          };
        }
        return null;
      }),
    };

    const res = await GET(get(withKey()));
    const json = (await res.json()) as { processed: number; failed: number };

    // att-conflict gagal karena PAYLOAD_CONFLICT, att-ok sukses
    expect(json.failed).toBe(1);
    expect(json.processed).toBe(1);
    expect(state.resultCreates).toContain("att-ok");
  });
});