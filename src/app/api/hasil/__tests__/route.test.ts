import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ============================================================================
// TASK 03L.2E.4.4 / 03L.2E.4.5 — Secure Candidate Result Access (/api/hasil).
//
// Menguji route SEBENARNYA + getLatestResult SEBENARNYA (query ownership
// terikat pada userId sesi). Prisma & auth di-mock; tidak menyentuh DB nyata.
//
// Mock findFirst meniru SEMANTIK Prisma untuk field yang dipakai route:
//   - kepemilikan   : where.attempt.userId
//   - soft-delete   : where.deletedAt / where.attempt.deletedAt
//   - urutan        : orderBy (submittedAt/id)
// Karena itu tes soft-delete & urutan bersifat PERILAKU (bukan sekadar memeriksa
// bentuk query): bila filter di route dihapus, hasil soft-deleted akan lolos
// dan tes yang mengharapkan 404 GAGAL. Bila ikatan userId dihapus, mock tidak
// menemukan baris dan tes yang mengharapkan 200 GAGAL.
// ============================================================================

const USER_A = { id: "user-A", username: "CasisA", displayName: "Casis A", deletedAt: null };
const USER_B = { id: "user-B", username: "CasisB", displayName: "Casis B", deletedAt: null };

// Rahasia palsu di dalam answersJson — TIDAK boleh muncul di response.
const SECRET_ANSWER = "JAWABAN-RAHASIA-JANGAN-BOCOR";
const SECRET_CORRECT_KEY = "KUNCI-RAHASIA-JANGAN-BOCOR";

type SessionUser = { id: string; username: string; displayName: string; deletedAt: Date | null };

interface ResultRow {
  id: string;
  attemptId: string;
  score: number;
  maxScore: number;
  mcqScore: number;
  essayScore: number;
  status: string;
  passed: boolean;
  submittedAt: Date;
  deletedAt: Date | null;
  answersJson: unknown[];
  attempt: {
    id: string;
    userId: string;
    deletedAt: Date | null;
    user: {
      id: string;
      username: string;
      displayName: string;
      robloxId: bigint;
      avatarUrl: string;
      policeGroupRank: string;
      discordUsername: string;
    };
    period: { name: string; passThreshold: number };
  };
}

interface FindFirstArgs {
  where?: { deletedAt?: unknown; attempt?: { userId?: string; deletedAt?: unknown } };
  orderBy?: Array<Record<string, "asc" | "desc">>;
}

const state: {
  user: SessionUser | null;
  results: ResultRow[];
  dbError: Error | null;
  limit: { ok: boolean; retryAfterSeconds: number };
} = {
  user: USER_A,
  results: [],
  dbError: null,
  limit: { ok: true, retryAfterSeconds: 0 },
};

/** Tiru prisma orderBy (Date/string) — hanya mengembalikan baris terurut. */
function applyOrder(rows: ResultRow[], orderBy: FindFirstArgs["orderBy"]): ResultRow[] {
  if (!Array.isArray(orderBy)) return rows;
  return [...rows].sort((a, b) => {
    for (const clause of orderBy) {
      const [field, dir] = Object.entries(clause)[0] ?? [];
      if (!field) continue;
      const av = (a as unknown as Record<string, unknown>)[field];
      const bv = (b as unknown as Record<string, unknown>)[field];
      let cmp = 0;
      if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else if (typeof av === "string" && typeof bv === "string") cmp = av < bv ? -1 : av > bv ? 1 : 0;
      if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

const mockPrisma = {
  examResult: {
    // Meniru query nyata: hanya hasil MILIK userId yang diminta, filter
    // soft-delete HANYA jika route memintanya, urutan sesuai orderBy route.
    findFirst: vi.fn(async (args: FindFirstArgs) => {
      if (state.dbError) throw state.dbError;
      const where = args?.where ?? {};
      const uid = where.attempt?.userId;
      if (typeof uid !== "string") return null; // tanpa ikatan pemilik -> kosong
      let rows = state.results.filter((r) => r.attempt.userId === uid);
      if (where.deletedAt === null) rows = rows.filter((r) => r.deletedAt === null);
      if (where.attempt?.deletedAt === null) rows = rows.filter((r) => r.attempt.deletedAt === null);
      return applyOrder(rows, args?.orderBy)[0] ?? null;
    }),
    update: vi.fn(async () => ({})),
    create: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  },
  user: {
    findUnique: vi.fn(async () => state.user),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => state.user) }));
vi.mock("@/lib/init-schema", () => ({ ensureSchema: vi.fn(async () => {}) }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "127.0.0.1",
  createRateLimiter: () => ({ check: () => state.limit }),
}));
vi.mock("@/lib/discord-api", () => ({
  checkDiscordRole: vi.fn(async () => ({ ok: false, hasRole: false })),
}));

const hasilRoute = await import("@/app/api/hasil/route");
const { getSessionUser } = (await import("@/lib/auth")) as unknown as {
  getSessionUser: ReturnType<typeof vi.fn>;
};

function post(body?: unknown): Request {
  return new Request("http://localhost/api/hasil", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function resultFor(owner: SessionUser, over: Partial<ResultRow> = {}): ResultRow {
  return {
    id: `res-${owner.id}`,
    attemptId: `att-${owner.id}`,
    score: owner.id === USER_A.id ? 80 : 10,
    maxScore: 100,
    mcqScore: 60,
    essayScore: 20,
    status: "LULUS",
    passed: true,
    submittedAt: new Date("2026-03-01T10:00:00.000Z"),
    deletedAt: null,
    // Ada di DB, tetapi route HARUS mengosongkan answersJson.
    answersJson: [{ questionId: "q1", userAnswer: SECRET_ANSWER, correctKey: SECRET_CORRECT_KEY }],
    attempt: {
      id: `att-${owner.id}`,
      userId: owner.id,
      deletedAt: null,
      user: {
        id: owner.id,
        username: owner.username,
        displayName: owner.displayName,
        robloxId: 111n,
        avatarUrl: "https://example.test/avatar.png",
        policeGroupRank: "Bripka",
        discordUsername: "casis#1234",
      },
      period: { name: "Periode Ujian 1", passThreshold: 70 },
    },
    ...over,
  };
}

function lastFindFirstArgs(): FindFirstArgs {
  const calls = mockPrisma.examResult.findFirst.mock.calls;
  return calls[calls.length - 1]?.[0] as FindFirstArgs;
}

beforeEach(() => {
  state.user = USER_A;
  state.results = [];
  state.dbError = null;
  state.limit = { ok: true, retryAfterSeconds: 0 };
  vi.clearAllMocks();
});

describe("POST /api/hasil — autentikasi wajib", () => {
  it("1. tanpa sesi terverifikasi -> 401 dan TIDAK ada query hasil", async () => {
    state.user = null;
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(401);
    const json = (await res.json()) as { ok: boolean; code: string };
    expect(json.ok).toBe(false);
    expect(json.code).toBe("UNAUTHORIZED");
    // Memakai mekanisme auth kandidat yang sudah ada (sesi trusted), bukan sistem paralel.
    expect(getSessionUser).toHaveBeenCalledTimes(1);
    expect(mockPrisma.examResult.findFirst).not.toHaveBeenCalled();
  });

  it("2. respons 401 no-store (data personal tidak di-cache)", async () => {
    state.user = null;
    const res = await hasilRoute.POST(post());
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("3. user di-soft-delete -> 403 ACCOUNT_DISABLED tanpa query hasil (fail closed)", async () => {
    state.user = { ...USER_A, deletedAt: new Date("2026-03-02T00:00:00.000Z") };
    state.results = [resultFor(USER_A)]; // hasil ada, tetapi TIDAK boleh diambil
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(403);
    const json = (await res.json()) as { ok: boolean; code: string };
    expect(json.ok).toBe(false);
    expect(json.code).toBe("ACCOUNT_DISABLED");
    // Fail closed: TIDAK ada query hasil yang dijalankan untuk akun terhapus.
    expect(mockPrisma.examResult.findFirst).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("POST /api/hasil — ownership terikat pada sesi", () => {
  it("4. kandidat terautentikasi memperoleh hasil miliknya", async () => {
    state.results = [resultFor(USER_A)];
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; result: { score: number; passed: boolean } };
    expect(json.ok).toBe(true);
    expect(json.result.score).toBe(80);
    expect(json.result.passed).toBe(true);
    // Query ownership memakai userId dari sesi.
    expect(lastFindFirstArgs().where?.attempt?.userId).toBe(USER_A.id);
  });

  it("5. tanpa body/username -> tetap memperoleh hasil sendiri", async () => {
    state.results = [resultFor(USER_A)];
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(200);
    expect(lastFindFirstArgs().where?.attempt?.userId).toBe(USER_A.id);
  });

  it("6. mengirim username kandidat LAIN -> tetap hasil sendiri (username diabaikan)", async () => {
    state.results = [resultFor(USER_A), resultFor(USER_B, { score: 10 })];
    const res = await hasilRoute.POST(post({ username: USER_B.username }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { score: number } };
    expect(json.result.score).toBe(80); // hasil A, bukan B
    const args = lastFindFirstArgs();
    expect(args.where?.attempt?.userId).toBe(USER_A.id);
    expect(JSON.stringify(args.where)).not.toContain("username");
  });

  it("7. mengirim resultId/attemptId/userId kandidat LAIN -> tetap hasil sendiri", async () => {
    state.results = [resultFor(USER_A), resultFor(USER_B, { score: 10 })];
    const res = await hasilRoute.POST(
      post({ resultId: `res-${USER_B.id}`, attemptId: `att-${USER_B.id}`, userId: USER_B.id, username: USER_B.username }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { id: string; score: number } };
    expect(json.result.id).toBe(`res-${USER_A.id}`);
    expect(lastFindFirstArgs().where?.attempt?.userId).toBe(USER_A.id);
  });

  it("8. kandidat tanpa hasil -> 404 NO_RESULT (generik)", async () => {
    state.results = [];
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(404);
    const json = (await res.json()) as { ok: boolean; code: string };
    expect(json.code).toBe("NO_RESULT");
    expect(lastFindFirstArgs().where?.attempt?.userId).toBe(USER_A.id);
  });

  it("9. query mengecualikan hasil & attempt yang di-soft-delete (bentuk query)", async () => {
    state.results = [resultFor(USER_A)];
    await hasilRoute.POST(post());
    const args = lastFindFirstArgs();
    expect(args.where?.deletedAt).toBeNull();
    expect(args.where?.attempt?.deletedAt).toBeNull();
  });

  it("10. hasil yang di-soft-delete -> 404 (perilaku, bukan hanya bentuk query)", async () => {
    const deleted = resultFor(USER_A);
    deleted.deletedAt = new Date("2026-03-02T00:00:00.000Z");
    state.results = [deleted];
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(404);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("NO_RESULT");
  });

  it("11. attempt yang di-soft-delete -> 404 (perilaku)", async () => {
    const row = resultFor(USER_A);
    row.attempt.deletedAt = new Date("2026-03-02T00:00:00.000Z");
    state.results = [row];
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(404);
  });

  it("12. urutan query deterministik (submittedAt desc, id desc)", async () => {
    state.results = [resultFor(USER_A)];
    await hasilRoute.POST(post());
    expect(lastFindFirstArgs().orderBy).toEqual([{ submittedAt: "desc" }, { id: "desc" }]);
  });

  it("13. hasil TERBARU dipilih dan tie-break id desc bersifat perilaku", async () => {
    state.results = [
      resultFor(USER_A, { id: "res-a", submittedAt: new Date("2026-02-01T00:00:00.000Z") }),
      resultFor(USER_A, { id: "res-b", submittedAt: new Date("2026-03-01T00:00:00.000Z") }),
    ];
    let json = (await (await hasilRoute.POST(post())).json()) as { result: { id: string } };
    expect(json.result.id).toBe("res-b");

    // submittedAt sama -> id desc (deterministik).
    state.results = [
      resultFor(USER_A, { id: "res-1", submittedAt: new Date("2026-03-01T00:00:00.000Z") }),
      resultFor(USER_A, { id: "res-9", submittedAt: new Date("2026-03-01T00:00:00.000Z") }),
    ];
    json = (await (await hasilRoute.POST(post())).json()) as { result: { id: string } };
    expect(json.result.id).toBe("res-9");
  });
});

describe("POST /api/hasil — minimalisasi data", () => {
  it("14. answersJson selalu kosong (tidak membocorkan jawaban/kunci)", async () => {
    state.results = [resultFor(USER_A)];
    const res = await hasilRoute.POST(post());
    const json = (await res.json()) as { result: { answersJson: unknown[] } };
    expect(json.result.answersJson).toEqual([]);
    const raw = JSON.stringify(json);
    expect(raw).not.toContain(SECRET_ANSWER);
    expect(raw).not.toContain(SECRET_CORRECT_KEY);
  });

  it("15. response tidak memuat PII / ID internal yang tidak dipakai UI", async () => {
    state.results = [resultFor(USER_A)];
    const res = await hasilRoute.POST(post());
    const json = (await res.json()) as { result: Record<string, unknown> };
    const raw = JSON.stringify(json);
    expect(raw).not.toContain(USER_A.displayName);
    expect(raw).not.toContain(USER_A.username);
    expect(raw).not.toContain("robloxId");
    expect(raw).not.toContain("avatarUrl");
    expect(raw).not.toContain("discordUsername");
    // attempt.id internal tidak dikembalikan; hasil.id dipertahankan untuk review milik sendiri.
    const attempt = json.result.attempt as Record<string, unknown>;
    expect(attempt).not.toHaveProperty("id");
    expect((json.result as { id?: string }).id).toBe(`res-${USER_A.id}`);
  });

  it("16. respons sukses no-store", async () => {
    state.results = [resultFor(USER_A)];
    const res = await hasilRoute.POST(post());
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("POST /api/hasil — bukan oracle & tanpa mutasi", () => {
  it("17. tidak ada kode USER_NOT_FOUND / perbedaan oracle untuk user yang tidak ada", async () => {
    state.user = USER_B;
    state.results = [resultFor(USER_A)]; // B tidak punya hasil
    const res = await hasilRoute.POST(post({ username: USER_A.username }));
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("USER_NOT_FOUND");
    expect(body).not.toContain(USER_A.username);
    expect(body).not.toContain(USER_A.displayName);
  });

  it("18. hasil milik kandidat lain tidak dapat diambil lewat username/ID apa pun", async () => {
    state.user = USER_A;
    // A belum punya hasil, B punya.
    state.results = [resultFor(USER_B)];
    for (const body of [
      undefined,
      { username: USER_B.username },
      { resultId: `res-${USER_B.id}` },
      { attemptId: `att-${USER_B.id}` },
      { userId: USER_B.id },
    ]) {
      const res = await hasilRoute.POST(post(body));
      expect(res.status).toBe(404);
      const json = (await res.json()) as { code: string };
      expect(json.code).toBe("NO_RESULT");
      expect(lastFindFirstArgs().where?.attempt?.userId).toBe(USER_A.id);
    }
  });

  it("19. kegagalan autentikasi/tidak-ada-hasil tidak memutasi data apa pun", async () => {
    state.user = null;
    await hasilRoute.POST(post());
    state.user = USER_A;
    state.results = [];
    await hasilRoute.POST(post());

    expect(mockPrisma.examResult.create).not.toHaveBeenCalled();
    expect(mockPrisma.examResult.update).not.toHaveBeenCalled();
    expect(mockPrisma.examResult.delete).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it("20. kegagalan DB -> 500 generik tanpa bocor detail & tanpa mutasi", async () => {
    state.dbError = new Error("connection refused at db.internal:5432 secret");
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("5432");
    expect(body).not.toContain("db.internal");
    expect(mockPrisma.examResult.update).not.toHaveBeenCalled();
  });

  it("21. tabel belum ada (P2021) -> 409 DB_NOT_READY", async () => {
    state.dbError = new Prisma.PrismaClientKnownRequestError("table missing", {
      code: "P2021",
      clientVersion: "5.20.0",
    });
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(409);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe("DB_NOT_READY");
  });
});

describe("POST /api/hasil — rate limit", () => {
  it("22. rate limit terlampaui -> 429 no-store dan TIDAK ada query hasil", async () => {
    state.limit = { ok: false, retryAfterSeconds: 42 };
    state.results = [resultFor(USER_A)];
    const res = await hasilRoute.POST(post());
    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const json = (await res.json()) as { ok: boolean; message: string };
    expect(json.ok).toBe(false);
    expect(json.message).toContain("42");
    // Ditolak sebelum autentikasi / query.
    expect(getSessionUser).not.toHaveBeenCalled();
    expect(mockPrisma.examResult.findFirst).not.toHaveBeenCalled();
  });
});
