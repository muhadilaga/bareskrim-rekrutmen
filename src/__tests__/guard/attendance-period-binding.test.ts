import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ============================================================================
// TASK 03L.2E.4.6 — F1: absensi terikat pada periode hasil Candidate Guard.
//
// Versi sebelumnya query ulang `examPeriod.findFirst({ isActive: true })`
// (tanpa filter deletedAt, tanpa verifikasi mapping RecruitmentPeriod) lalu
// memakai hasilnya untuk cek isAttendanceOpen, findUnique absensi, create, dan
// log. Bila periode aktif berubah di antara guard dan query ulang, absensi bisa
// ditulis ke periode yang TIDAK pernah divalidasi.
//
// Mock `examPeriod.findFirst` sengaja mengembalikan periode "jahat" yang BERBEDA
// dari periode yang divalidasi guard (ep-EVIL, tidak terpetakan). Bila route
// masih query ulang, test ini gagal — sekaligus membuktikan query periode kedua
// tidak lagi dipanggil.
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
  examStartTime: null,
  examEndTime: null,
  seed: 12345,
  mcqCount: 0,
  essayCount: 0,
  passThreshold: 70,
  openedAt: new Date("2026-01-01T00:00:00.000Z"),
  closedAt: null,
  deletedAt: null,
};

// Periode hasil query ulang versi lama: aktif, TIDAK terpetakan ke
// RecruitmentPeriod, dan absennya tertutup. Guard tidak pernah memvalidasinya.
const PERIOD_FROM_REQUERY = {
  ...PERIOD,
  id: "ep-EVIL",
  name: "Periode Eval",
  recruitmentPeriodId: null,
  isAttendanceOpen: false,
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

function matchWhere(
  row: Record<string, unknown> | null,
  where: Record<string, unknown> | undefined,
): boolean {
  if (!row) return false;
  if (!where) return true;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.userId !== undefined && row.userId !== where.userId) return false;
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.deletedAt === null && row.deletedAt != null) return false;
  return true;
}

const state: {
  periods: unknown[];
  rp: unknown;
  application: unknown;
  attendance: unknown;
  attendanceCreateCalls: Array<Record<string, unknown>>;
  auditCalls: Array<Record<string, unknown>>;
  existingLookupArgs: unknown[];
} = {
  periods: [PERIOD],
  rp: RP,
  application: appFixture("DITERIMA"),
  attendance: null,
  attendanceCreateCalls: [],
  auditCalls: [],
  existingLookupArgs: [],
};

const mockPrisma = {
  examPeriod: {
    findMany: vi.fn(async () => state.periods),
    // Query periode kedua versi lama. dippedanggil DAN mengembalikan periode
    // berbeda dari yang divalidasi guard.
    findFirst: vi.fn(async () => PERIOD_FROM_REQUERY),
  },
  recruitmentPeriod: { findUnique: vi.fn(async () => state.rp) },
  application: {
    findFirst: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
      matchWhere(state.application as Record<string, unknown> | null, args?.where)
        ? state.application
        : null,
    ),
  },
  attendance: {
    findUnique: vi.fn(async (args: unknown) => {
      state.existingLookupArgs.push(args);
      return state.attendance;
    }),
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      state.attendanceCreateCalls.push(args.data);
      return {
        id: "att-new",
        status: "HADIR",
        createdAt: new Date("2026-01-09T00:00:00.000Z"),
        ...args.data,
      };
    }),
  },
  examAttempt: { findUnique: vi.fn(async () => null) },
  examResult: { findUnique: vi.fn(async () => null) },
  blacklistEntry: { findFirst: vi.fn(async () => null) },
  verdictEntry: { findFirst: vi.fn(async () => null) },
};

const logStudentActionMock = vi.fn(async (args: Record<string, unknown>) => {
  state.auditCalls.push(args);
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => USER) }));
vi.mock("@/lib/audit", () => ({ logStudentAction: logStudentActionMock }));
vi.mock("@/lib/rate-limit", () => {
  const ok = { ok: true, retryAfterSeconds: 0 };
  return {
    clientIp: () => "127.0.0.1",
    createRateLimiter: () => ({ check: () => ok }),
    saveLimiter: { check: () => ok },
    submitLimiter: { check: () => ok },
    userSubmitLimiter: { check: () => ok },
  };
});
vi.mock("@/lib/discord-api", () => ({
  checkDiscordRole: vi.fn(async () => ({ ok: false, hasRole: false })),
  assignDiscordRoleById: vi.fn(async () => ({ ok: true })),
  removeDiscordRoleById: vi.fn(async () => ({ ok: true })),
  assignDiscordRoleAndNickname: vi.fn(async () => ({ ok: true, nicknameOk: true })),
}));

const attendanceSubmitRoute = await import("@/app/api/attendance/submit/route");

function post(body: unknown): Request {
  return new Request("http://localhost/api/attendance/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function reset(over: Partial<typeof state> = {}) {
  state.periods = [PERIOD];
  state.rp = RP;
  state.application = appFixture("DITERIMA");
  state.attendance = null;
  state.attendanceCreateCalls = [];
  state.auditCalls = [];
  state.existingLookupArgs = [];
  Object.assign(state, over);
  vi.clearAllMocks();
}

beforeEach(() => reset());

describe("F1 — absensi terikat pada ctx.examPeriod (tidak ada query periode kedua)", () => {
  it("1. tidak memanggil query ulang examPeriod (findFirst) sama sekali", async () => {
    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(res.status).toBe(200);
    // Hanya guard yang boleh menanyakan ExamPeriod, lewat findMany.
    expect(mockPrisma.examPeriod.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.examPeriod.findMany).toHaveBeenCalledTimes(1);
  });

  it("2. create memakai periodId dari guard (ep-1), bukan periode hasil query ulang (ep-EVIL)", async () => {
    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(res.status).toBe(200);
    expect(mockPrisma.attendance.create).toHaveBeenCalledTimes(1);
    expect(state.attendanceCreateCalls).toHaveLength(1);
    expect(state.attendanceCreateCalls[0]!.periodId).toBe("ep-1");
    expect(JSON.stringify(state.attendanceCreateCalls)).not.toContain("ep-EVIL");
  });

  it("3. pencarian absensi existing memakai periodId dari guard (ep-1)", async () => {
    await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(state.existingLookupArgs).toHaveLength(1);
    const args = state.existingLookupArgs[0] as {
      where: { userId_periodId_tahap: { periodId: string } };
    };
    expect(args.where.userId_periodId_tahap.periodId).toBe("ep-1");
  });

  it("4. log audit memakai periodId dari guard (ep-1)", async () => {
    await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0]!.periodId).toBe("ep-1");
  });

  it("5. isAttendanceOpen dibaca dari periode guard: versi lama akan menolak dengan 'Absen belum dibuka'", async () => {
    // Periode hasil query ulang lama isAttendanceOpen=false; periode guard=true.
    // Bila route masih memakai hasil query ulang, responsnya 403.
    expect(PERIOD_FROM_REQUERY.isAttendanceOpen).toBe(false);
    expect(PERIOD.isAttendanceOpen).toBe(true);

    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));
    expect(res.status).toBe(200);
    expect(state.attendanceCreateCalls[0]!.periodId).toBe("ep-1");
  });

  it("6. absensi sudah ada -> 409 dan TIDAK create, periode tetap ep-1", async () => {
    reset({ attendance: { id: "att-old", userId: "user-1", periodId: "ep-1" } });

    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(res.status).toBe(409);
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/sudah melakukan absensi/i);
  });

  it("7. periode guard menutup absensi -> 403, dan query ulang tidak bisa membukanya", async () => {
    reset({ periods: [{ ...PERIOD, isAttendanceOpen: false }] });

    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(res.status).toBe(403);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/belum dibuka/i);
    expect(mockPrisma.examPeriod.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
  });

  it("8. guard menolak (Application DITOLAK) -> 403 sebelum query periode/create mana pun", async () => {
    reset({ application: appFixture("DITOLAK") });

    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(res.status).toBe(403);
    expect(mockPrisma.examPeriod.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    expect(state.auditCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F3 — validasi target P2002 pada attendance.create.
// ---------------------------------------------------------------------------

function p2002(target?: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: target === undefined ? undefined : { target },
  });
}

describe("F3 — attendance.create hanya idempoten bila target P2002 cocok", () => {
  it("9. target cocok (array kolom) -> 409 idempotent", async () => {
    mockPrisma.attendance.create.mockImplementationOnce(async () => {
      throw p2002(["userId", "periodId", "tahap"]);
    });

    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(res.status).toBe(409);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/sudah melakukan absensi/i);
  });

  it("10. target cocok dalam bentuk string (nama index Postgres) -> 409 idempotent", async () => {
    mockPrisma.attendance.create.mockImplementationOnce(async () => {
      throw p2002("Attendance_userId_periodId_tahap_key");
    });

    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(res.status).toBe(409);
  });

  it("11. target BERBEDA -> bukan idempotensi: 500 generik, tidak successes", async () => {
    mockPrisma.attendance.create.mockImplementationOnce(async () => {
      throw p2002(["seed"]);
    });

    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { ok: boolean; message: string };
    expect(json.ok).toBe(false);
    expect(json.message).toMatch(/gagal menyimpan absensi/i);
    // Tidak boleh bocor detail internal / constraint name ke klien.
    expect(JSON.stringify(json)).not.toContain("seed");
    expect(JSON.stringify(json)).not.toContain("P2002");
    // Tidak boleh lanjut ke assign role Discord / audit log.
    expect(state.auditCalls).toHaveLength(0);
  });

  it("12. target tidak tersedia (meta tanpa target) -> 500 generik, bukan 409", async () => {
    mockPrisma.attendance.create.mockImplementationOnce(async () => {
      throw p2002();
    });

    const res = await attendanceSubmitRoute.POST(post({ discordUserId: "casis#1234" }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
  });
});