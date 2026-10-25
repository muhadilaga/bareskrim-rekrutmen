import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// TASK 03L.2E.4.10B-SQL — Regresi raw SQL atomik pada POST /api/exam/save.
//
// Statement yang diuji: `WITH elig AS MATERIALIZED (... FOR UPDATE OF a)`
// + `UPDATE "ExamAttempt" ... RETURNING att.id`, dikirim lewat
// `prisma.$queryRaw(Prisma.sql\`...\`)` TANPA interactive $transaction.
//
// JENIS BUKTI — dibaca sebelum menarik kesimpulan:
//   * Test file ini = UNIT/MOCKED. Prisma dimock; TIDAK ADA database.
//     Membuktikan logika route, parameterisasi, dan penanganan hasil.
//   * Perilaku lock/concurrency di database = bukti TERPISAH dari
//     eksperimen PostgreSQL 18.6 (T7a/E1-E4), bukan dari file ini.
//   * INTEGRATION TEST terhadap DB nyata = TIDAK ADA (repo tidak punya
//     globalSetup). Dibutuhkan sebelum bisa dinyatakan siap produksi.
// ============================================================================

const USER = {
  id: "user-1",
  robloxId: 123n,
  username: "CasisSatu",
  displayName: "Casis Satu",
  discordUsername: null,
  matraBlocked: false,
  policeGroupRankNumber: null,
  deletedAt: null,
  bannedGroupIds: null,
};

const PERIOD = {
  id: "ep-1",
  name: "Periode Ujian 1",
  description: null,
  recruitmentPeriodId: "rp-1",
  isActive: true,
  isAttendanceOpen: true,
  isExamOpen: true,
  seed: 1,
  mcqCount: 15,
  essayCount: 5,
  passThreshold: 70,
  openedAt: new Date("2026-01-01T00:00:00.000Z"),
  closedAt: null,
  deletedAt: null,
};

const RP = {
  id: "rp-1",
  code: "XLI-01",
  name: "Angkatan",
  isActive: true,
  openedAt: new Date("2026-01-01T00:00:00.000Z"),
  closedAt: new Date("2026-02-01T00:00:00.000Z"),
  deletedAt: null,
};

function appFixture(status: string, over: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    registrationId: "XLI-01-ABC123",
    recruitmentPeriodId: "rp-1",
    status,
    verifiedAt: new Date("2026-01-05T00:00:00.000Z"),
    userId: "user-1",
    deletedAt: null,
    ...over,
  };
}

const state: Record<string, unknown> = {};

const mockPrisma = {
  $queryRaw: vi.fn(async (_query: Prisma.Sql) => {
    if (state.queryRawError) throw state.queryRawError;
    return state.queryRawRows;
  }),
  examPeriod: {
    findMany: vi.fn(async () => state.periods),
    findFirst: vi.fn(async () => state.period),
  },
  recruitmentPeriod: { findUnique: vi.fn(async () => state.rp) },
  application: { findFirst: vi.fn(async () => state.application) },
  attendance: {
    findFirst: vi.fn(async () => state.attendance),
    findUnique: vi.fn(async () => state.attendance),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: "att-new",
      status: "HADIR",
      createdAt: new Date("2026-01-09T00:00:00.000Z"),
      ...args.data,
    })),
  },
  examAttempt: {
    // Save route kini memakai findFirst (filter deletedAt), bukan findUnique.
    findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
      const row = state.attempt as Record<string, unknown> | null;
      if (!row) return null;
      const w = args?.where ?? {};
      // Simulasikan filter DB: deletedAt: null berarti baris harus belum soft-delete.
      if (w.deletedAt === null && row.deletedAt != null) return null;
      if (w.id !== undefined && row.id !== w.id) return null;
      return row;
    }),
    findUnique: vi.fn(async () => state.attempt),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async () => ({ id: "attempt-new" })),
  },
  examResult: {
    findFirst: vi.fn(async () => state.resultForGuard),
    findUnique: vi.fn(async () => state.resultFull),
    update: vi.fn(async () => ({})),
    create: vi.fn(async () => ({ id: "res-new" })),
  },
  blacklistEntry: { findFirst: vi.fn(async () => null) },
  verdictEntry: { findFirst: vi.fn(async () => null) },
  pendingDiscordReport: { deleteMany: vi.fn(async () => ({})), upsert: vi.fn(async () => ({})) },
  question: { findMany: vi.fn(async () => []) },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => state.user) }));
vi.mock("@/lib/init-schema", () => ({ ensureSchema: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ logStudentAction: vi.fn(async () => {}) }));
vi.mock("@/lib/rate-limit", () => {
  const ok = { ok: true, retryAfterSeconds: 0 };
  return {
    clientIp: () => "127.0.0.1",
    createRateLimiter: () => ({ check: () => ok }),
    saveLimiter: { check: vi.fn(() => (state.rateLimited ? { ok: false, retryAfterSeconds: 60 } : ok)) },
    submitLimiter: { check: () => ok },
    userSubmitLimiter: { check: () => ok },
  };
});
vi.mock("@/lib/exam-service", () => ({
  startExamSession: vi.fn(),
  submitExam: vi.fn(),
}));
vi.mock("@/lib/discord", () => ({ sendDiscordExamReport: vi.fn(async () => "msg-1") }));
vi.mock("@/lib/discord-api", () => ({
  checkDiscordRole: vi.fn(async () => ({ ok: false, hasRole: false })),
  assignDiscordRoleById: vi.fn(async () => ({ ok: true })),
  removeDiscordRoleById: vi.fn(async () => ({ ok: true })),
  assignDiscordRoleAndNickname: vi.fn(async () => ({ ok: true, nicknameOk: true })),
}));

const saveRoute = await import("@/app/api/exam/save/route");

function post(body: unknown): Request {
  return new Request("http://localhost/api/exam/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SAVE_BODY = { attemptId: "att-1", answers: { q1: "A" } };

function reset(over: Record<string, unknown> = {}) {
  state.user = USER;
  state.periods = [PERIOD];
  state.period = PERIOD;
  state.rp = RP;
  state.application = appFixture("DITERIMA");
  state.attendance = null;
  state.attempt = { id: "att-1", userId: "user-1", submittedAt: null, startedAt: new Date() };
  state.resultForGuard = null;
  state.resultFull = null;
  state.queryRawRows = [{ id: "att-1" }];
  state.queryRawError = null;
  state.rateLimited = false;
  Object.assign(state, over);
  vi.clearAllMocks();
}

beforeEach(() => reset());

/** SQL + parameter yang benar-benar dikirim ke Prisma. */
function sentSql() {
  const call = mockPrisma.$queryRaw.mock.calls[0]?.[0] as unknown as Prisma.Sql;
  return call.inspect();
}

// ---------------------------------------------------------------------------

describe("1. Mekanisme parameterisasi (anti injeksi)", () => {
  it("1.1 statement memakai placeholder posisional, bukan nilai request mentah", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    const sql = sentSql();

    // Placeholder posisional wajib ada (Prisma merender `:N`).
    expect(sql.statement).toMatch(/:\d+/);
    // Nilai yang dikirim user TIDAK boleh muncul di teks SQL.
    expect(sql.statement).not.toContain("att-1");
    expect(sql.statement).not.toContain("user-1");
    expect(sql.statement).not.toContain("CasisSatu");
    // ...melainkan muncul di `values`.
    expect(sql.values).toContain("att-1");
    expect(sql.values).toContain("user-1");
  });

  it("1.2 JSON jawaban diikat sebagai parameter jsonb, bukan disisipkan", async () => {
    await saveRoute.POST(post({ attemptId: "att-1", answers: { q1: "A", q2: "B" } }));
    const sql = sentSql();

    expect(sql.statement).toContain("::jsonb");
    expect(sql.values).toContain(JSON.stringify({ q1: "A", q2: "B" }));
    expect(sql.statement).not.toContain('{"q1"');
  });

  it("1.3 nilailana yang berisi kutipan tidak keluar dari SQL sebagai literal", async () => {
    // Vektor injeksi klasik. Harus tetap jadi satu nilai parameter.
    const evil = { attemptId: "att-1", answers: { q1: "'; DROP TABLE \"User\"; --" } } as unknown;
    await saveRoute.POST(post(evil));
    const sql = sentSql();

    expect(sql.statement).not.toContain("DROP TABLE");
    expect(sql.values.some((v) => typeof v === "string" && v.includes("DROP TABLE"))).toBe(true);
  });
});

describe("2-3. Jumlah baris menentukan hasil", () => {
  it("2.1 TEPAT satu baris -> 200 dan ok:true", async () => {
    reset({ queryRawRows: [{ id: "att-1" }] });
    const res = await saveRoute.POST(post(SAVE_BODY));

    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
  });

  it("2.2 NOL baris -> TIDAK ada respons sukses (409)", async () => {
    reset({ queryRawRows: [] });
    const res = await saveRoute.POST(post(SAVE_BODY));
    const json = (await res.json()) as { ok: boolean; message: string };

    expect(res.status).toBe(409);
    expect(res.status).not.toBe(200);
    expect(json.ok).toBe(false);
  });

  it("2.3 pesan 409 tidak membocorkan penyebab kegagalan", async () => {
    reset({ queryRawRows: [] });
    const json = (await (await saveRoute.POST(post(SAVE_BODY))).json()) as Record<string, unknown>;

    expect(json.message).toBe("Ujian sudah dikumpulkan.");
    const dumped = JSON.stringify(json);
    expect(dumped).not.toMatch(/elig|Application|RecruitmentPeriod|submittedAt|deletedAt|P2\d{3}/i);
  });

  it("3.1 LEBIH dari satu baris -> invariant violation, gagal tertutup (500)", async () => {
    reset({ queryRawRows: [{ id: "att-1" }, { id: "att-2" }] });
    const res = await saveRoute.POST(post(SAVE_BODY));
    const json = (await res.json()) as { ok: boolean };

    expect(res.status).toBe(500);
    expect(json.ok).toBe(false);
  });
});

describe("5. Query error tetap fail-closed", () => {
  it("5.1 $queryRaw melempar -> tidak ada respons sukses", async () => {
    reset({ queryRawError: new Error("deadlock detected") });

    await expect(saveRoute.POST(post(SAVE_BODY))).rejects.toThrow(/deadlock detected/);
  });

  it("5.2 tidak ada retry otomatis setelah error", async () => {
    reset({ queryRawError: new Error("connection reset") });

    await expect(saveRoute.POST(post(SAVE_BODY))).rejects.toThrow();

    // Tepat satu panggilan — tidak ada retry buta.
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("6. Guard yang ada tidak boleh dilewati", () => {
  it("6.1 tanpa trusted session -> 401, tanpa penulisan", async () => {
    reset({ user: null });
    const res = await saveRoute.POST(post(SAVE_BODY));

    expect(res.status).toBe(401);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("6.2 attempt milik user lain -> 404, tanpa penulisan", async () => {
    reset({ attempt: { id: "att-1", userId: "user-OTHER", submittedAt: null } });
    const res = await saveRoute.POST(post(SAVE_BODY));

    expect(res.status).toBe(404);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("6.3 kelayakan DITOLAK -> 403, tanpa penulisan", async () => {
    reset({ application: appFixture("DITOLAK") });
    const res = await saveRoute.POST(post(SAVE_BODY));

    expect(res.status).toBe(403);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("6.4 payload invalid -> 400, tanpa penulisan", async () => {
    const res = await saveRoute.POST(post({ answers: {} }));
    expect(res.status).toBe(400);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("6.5 rate limit -> 429, tanpa penulisan", async () => {
    reset({ rateLimited: true });
    const res = await saveRoute.POST(post(SAVE_BODY));

    expect(res.status).toBe(429);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("6.6 attempt sudah submitted -> 409 via jalur cepat, tanpa penulisan", async () => {
    reset({ attempt: { id: "att-1", userId: "user-1", submittedAt: new Date(), startedAt: new Date() } });
    const res = await saveRoute.POST(post(SAVE_BODY));

    expect(res.status).toBe(409);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("7. Attempt soft-deleted ditolak", () => {
  it("7.1 pembacaan awal memfilter deletedAt -> 404", async () => {
    reset({ attempt: { id: "att-1", userId: "user-1", submittedAt: null, deletedAt: new Date() } });
    const res = await saveRoute.POST(post(SAVE_BODY));

    expect(res.status).toBe(404);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("7.2 pembacaan awal benar-benar mengirim filter deletedAt: null", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    const args = mockPrisma.examAttempt.findFirst.mock.calls[0]?.[0] as unknown as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({ id: "att-1", deletedAt: null });
  });
});

describe("8-9. Predicate kritis harus ADA di statement atomik", () => {
  it("8.1 predicate ExamAttempt: submittedAt/deletedAt NULL, userId, periodId", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    const { statement } = sentSql();

    expect(statement).toMatch(/att\."submittedAt"\s+IS NULL/);
    expect(statement).toMatch(/att\."deletedAt"\s+IS NULL/);
    expect(statement).toMatch(/att\."userId"/);
    expect(statement).toMatch(/att\."periodId"/);
  });

  // TASK 03L.2E.4.10B-M16 — Celah mutation: predicate `a."userId"` di CTE
  // sebelumnya tidak punya pagar. Menghapus predicate itu (kebenaran
  // Application milik user di sisi eligibility) tidak merusak test mana pun.
  //
  // Assertion di sini DI-SCOPING per wilayah statement agar tidak bisa
  // terpenuhi oleh `att."userId"` yang ada di bagian UPDATE:
  //   - regex `a."userId"` TIDAK mungkin match `att."userId"`
  //     (karena setelah `a` pada `att.` adalah `t`, bukan `"`).
  //   - di samping itu, CTE dan UPDATE dipisah secara eksplisit.
  it("8.2 predicate a.\"userId\" ada DI DALAM CTE, terpisah dari att.userId", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    const { statement } = sentSql();

    // Bagi statement menjadi wilayah CTE dan wilayah UPDATE.
    const splitAt = statement.indexOf('UPDATE "ExamAttempt"');
    expect(splitAt).toBeGreaterThan(-1);
    const cte = statement.slice(0, splitAt);
    const upd = statement.slice(splitAt);

    // --- Wilayah CTE: WAJIB punya predicate Application.userId ---
    expect(cte).toMatch(/a\."userId"\s+=\s+:\d/);
    // ...dan TIDAK boleh punya predicate ExamAttempt.userId.
    expect(cte).not.toMatch(/att\."userId"/);

    // --- Sisi CTE TIDAK boleh bocor ke wilayah UPDATE ---
    expect(upd).not.toMatch(/a\."userId"/);

    // CATATAN sengaja: test ini TIDAK mengassert keberadaan `att."userId"`
    // (itu milik 8.1). suppressor agar guard ini terisolasi: ia harus tetap
    // LOLOS saat hanya predikat ExamAttempt yang berubah, sehingga kegagalannya
    // benar-benar menunjuk ke predikat Application.
  });

  it("8.3 invariant statement: user id terikat sebagai parameter pada KEDUA predikat", async () => {
    // Ini invariant SELURUH statement, bukan guard CTE terisolasi — ia gagal
    // bila salah satu dari dua predikat userId hilang.
    await saveRoute.POST(post(SAVE_BODY));
    const { statement, values } = sentSql();

    // Tidak pernah sebagai literal di teks SQL.
    expect(statement).not.toContain("user-1");
    // Satu parameter untuk CTE, satu untuk UPDATE.
    const bound = values.filter((v) => v === "user-1").length;
    expect(bound).toBe(2);
  });

  it("8.2 eligibility diikat ke Application yang SUDAH tervalidasi guard", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    const { statement, values } = sentSql();

    // id Application datang dari ctx, bukan dari payload.
    expect(statement).toMatch(/a\.id\s+= :\d/);
    expect(values).toContain("app-1");
    expect(values).not.toContain("app-1-from-client");
  });

  it("9.1 predicate Application: status DITERIMA dan deletedAt NULL", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    const { statement } = sentSql();

    expect(statement).toMatch(/a\.status\s+= 'DITERIMA'/);
    expect(statement).toMatch(/a\."deletedAt"\s+IS NULL/);
  });

  it("9.2 predicate RecruitmentPeriod.deletedAt IS NULL via relasi eksplisit", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    const { statement, values } = sentSql();

    expect(statement).toMatch(/JOIN "RecruitmentPeriod" rp ON rp\.id = a\."recruitmentPeriodId"/);
    expect(statement).toMatch(/rp\."deletedAt"\s+IS NULL/);
    // Relasi periode eksplisit, bukan ditebak dari nama/tanggal/isActive.
    expect(statement).toMatch(/a\."recruitmentPeriodId"\s+= :\d/);
    expect(values).toContain("rp-1");
  });

  it("9.3 lock diambil dengan FOR UPDATE OF a (hanya baris Application)", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    const { statement } = sentSql();

    expect(statement).toMatch(/FOR UPDATE OF a/);
    // RecruitmentPeriod sengaja TIDAK dikunci.
    expect(statement).not.toMatch(/FOR UPDATE OF a, rp/);
  });

  it("9.4 statement memakai CTE MATERIALIZED dan RETURNING (bukan jumlah perubahan)", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    const { statement } = sentSql();

    expect(statement).toMatch(/WITH elig AS MATERIALIZED/);
    expect(statement).toMatch(/RETURNING att\.id/);
  });

  it("9.4b UPDATE WAJIB bergantung pada hasil CTE (EXISTS ... FROM elig)", async () => {
    // Mutasi M1x: menghapus `AND EXISTS (SELECT 1 FROM elig)` membuat UPDATE
    // menulis tanpa regard terhadap kelayakan. Semua test lain tetap lulus
    // tanpa baris ini — jadi baris ini harus diuji secara eksplisit.
    await saveRoute.POST(post(SAVE_BODY));
    const { statement } = sentSql();

    expect(statement).toMatch(/EXISTS \(SELECT 1 FROM elig\)/);
  });

  it("9.5 route TIDAK memakai interactive $transaction untuk statement ini", async () => {
    await saveRoute.POST(post(SAVE_BODY));

    // Tidak ada interactive transaction di mock sama sekali.
    expect((mockPrisma as Record<string, unknown>).$transaction).toBeUndefined();
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("Semantik penyimpanan dipertahankan", () => {
  it("10.1 sanitasi 50 pasang + 4000 char tetap berlaku", async () => {
    const answers: Record<string, string> = {};
    for (let i = 0; i < 60; i += 1) answers[`q${i}`] = "x".repeat(5000);
    await saveRoute.POST(post({ attemptId: "att-1", answers }));

    const { values } = sentSql();
    const payload = values.find((v) => typeof v === "string" && v.startsWith("{")) as string;
    const parsedJson = JSON.parse(payload) as Record<string, string>;

    expect(Object.keys(parsedJson)).toHaveLength(50);
    expect(Object.values(parsedJson).every((v) => v.length === 4000)).toBe(true);
  });

  it("10.2 kolom opsional hanya ikut bila dikirim", async () => {
    await saveRoute.POST(post(SAVE_BODY));
    let statement = sentSql().statement;
    expect(statement).toContain('"savedAnswers"');
    expect(statement).not.toContain('"flaggedQuestions"');
    expect(statement).not.toContain('"bookmarkedQuestions"');

    reset();
    await saveRoute.POST(post({ ...SAVE_BODY, flaggedQuestions: ["q1"], bookmarkedQuestions: ["q2"] }));
    statement = sentSql().statement;
    expect(statement).toContain('"flaggedQuestions"');
    expect(statement).toContain('"bookmarkedQuestions"');
  });
});