import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// Mock Prisma: verifikasi guard tanpa database nyata.
const mockPrisma = {
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

const INIT_SCHEMA_SRC = readFileSync(
  "D:/Dev/Projects/bareskrim-rekrutmen-v2/src/lib/init-schema.ts",
  "utf-8"
);

// Muat ulang modul per test: memoisasi ensureSchema di-reset.
async function loadFresh() {
  vi.resetModules();
  return await import("@/lib/init-schema");
}

const ALL_TABLE_NAMES = [
  "User",
  "ExamPeriod",
  "Question",
  "ExamAttempt",
  "ExamAnswer",
  "ExamResult",
  "BlacklistEntry",
  "VerdictEntry",
  "Attendance",
  "AdminLog",
  "StudentActionLog",
  "PendingDiscordReport",
  "RecruitmentPeriod",
  "Application",
  "RuntimeSetting",
];

const ALL_TABLES = ALL_TABLE_NAMES.map((t) => ({ table_name: t }));

const ALL_CRITICAL_COLUMNS = [
  ["Application", "id"],
  ["Application", "recruitmentPeriodId"],
  ["Application", "registrationId"],
  ["Application", "accessTokenHash"],
  ["Application", "robloxUsernameKey"],
  ["Application", "status"],
  ["RecruitmentPeriod", "id"],
  ["RecruitmentPeriod", "code"],
  ["RecruitmentPeriod", "openedAt"],
  ["RecruitmentPeriod", "closedAt"],
  ["RecruitmentPeriod", "isActive"],
  ["RuntimeSetting", "key"],
  ["RuntimeSetting", "value"],
  ["RuntimeSetting", "updatedAt"],
].map(([table_name, column_name]) => ({ table_name, column_name }));

// Mock berbasis SQL: tabel vs kolom.
function mockQueries(tables: unknown[], columns: unknown[]) {
  mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) => {
    if (sql.includes("information_schema.tables")) return Promise.resolve(tables);
    if (sql.includes("information_schema.columns")) return Promise.resolve(columns);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureSchema — Legacy Schema Guard (TASK 03G)", () => {
  it("resolves when full V2 schema present (14 tables + critical columns)", async () => {
    mockQueries(ALL_TABLES, ALL_CRITICAL_COLUMNS);
    const { ensureSchema } = await loadFresh();
    await expect(ensureSchema()).resolves.toBeUndefined();
  });

  it("throws SCHEMA_NOT_READY when Application/RecruitmentPeriod missing", async () => {
    const tablesOnly = ALL_TABLES.filter(
      (t) => t.table_name !== "Application" && t.table_name !== "RecruitmentPeriod"
    );
    mockQueries(tablesOnly, []);
    const { ensureSchema } = await loadFresh();
    await expect(ensureSchema()).rejects.toThrow(/SCHEMA_NOT_READY/);
    await expect(ensureSchema()).rejects.toThrow(/Application/);
    await expect(ensureSchema()).rejects.toThrow(/RecruitmentPeriod/);
  });

  it("detects partial schema: Application table exists but critical columns missing", async () => {
    const partialCols = ALL_CRITICAL_COLUMNS.filter(
      (c) => !["Application.registrationId", "Application.accessTokenHash"].includes(
        `${c.table_name}.${c.column_name}`
      )
    );
    mockQueries(ALL_TABLES, partialCols);
    const { ensureSchema } = await loadFresh();
    await expect(ensureSchema()).rejects.toThrow(/Application\.registrationId/);
  });

  it("throws SCHEMA_NOT_READY when RuntimeSetting missing or columns incomplete", async () => {
    const tablesNoRS = ALL_TABLES.filter((t) => t.table_name !== "RuntimeSetting");
    mockQueries(tablesNoRS, []);
    const { ensureSchema } = await loadFresh();
    await expect(ensureSchema()).rejects.toThrow(/RuntimeSetting/);

    // Tabel ada tapi kolom kritis hilang
    const rsCols = ALL_CRITICAL_COLUMNS.filter(
      (c) => c.table_name !== "RuntimeSetting" || c.column_name !== "value"
    );
    mockQueries(ALL_TABLES, rsCols);
    const fresh2 = await loadFresh();
    await expect(fresh2.ensureSchema()).rejects.toThrow(/RuntimeSetting\.value/);
  });

  it("DB error → treated as NOT ready (never silently healthy)", async () => {
    mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error("ECONNREFUSED"));
    const { ensureSchema, checkSchemaStatus } = await loadFresh();
    const status = await checkSchemaStatus();
    expect(status.ready).toBe(false);
    expect(status.missing.length).toBe(15); // semua tabel dianggap hilang
    await expect(ensureSchema()).rejects.toThrow(/SCHEMA_NOT_READY/);
  });

  it("failure is not cached: re-checks on next call", async () => {
    mockQueries([], []);
    const { ensureSchema } = await loadFresh();
    await expect(ensureSchema()).rejects.toThrow();
    // Sekarang schema "lengkap" → panggilan kedua harus lolos
    mockQueries(ALL_TABLES, ALL_CRITICAL_COLUMNS);
    await expect(ensureSchema()).resolves.toBeUndefined();
  });

  it("memoizes success: no re-query after verified", async () => {
    mockQueries(ALL_TABLES, ALL_CRITICAL_COLUMNS);
    const { ensureSchema } = await loadFresh();
    await ensureSchema();
    const callsAfterFirst = mockPrisma.$queryRawUnsafe.mock.calls.length;
    await ensureSchema();
    expect(mockPrisma.$queryRawUnsafe.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe("initSchema — dinonaktifkan (TASK 03G)", () => {
  it("throws INIT_SCHEMA_DISABLED and never runs DDL", async () => {
    const { initSchema } = await loadFresh();
    await expect(initSchema()).rejects.toThrow(/INIT_SCHEMA_DISABLED/);
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("schemaExists — kompatibilitas lama", () => {
  it("returns true only when schema complete", async () => {
    mockQueries(ALL_TABLES, ALL_CRITICAL_COLUMNS);
    const { schemaExists } = await loadFresh();
    expect(await schemaExists()).toBe(true);
  });

  it("returns false when Application missing", async () => {
    const tablesOnly = ALL_TABLES.filter((t) => t.table_name !== "Application");
    mockQueries(tablesOnly, []);
    const { schemaExists } = await loadFresh();
    expect(await schemaExists()).toBe(false);
  });
});

describe("static — tidak ada jalur DDL di aplikasi V2", () => {
  it("init-schema.ts contains no DDL execution path", () => {
    expect(INIT_SCHEMA_SRC).not.toMatch(/\$executeRawUnsafe/);
    expect(INIT_SCHEMA_SRC).not.toMatch(/CREATE TABLE/i);
    expect(INIT_SCHEMA_SRC).not.toMatch(/ALTER TABLE/i);
    expect(INIT_SCHEMA_SRC).not.toMatch(/CREATE TYPE/i);
  });

  it("init-schema.ts verifies critical V2 objects (not just _prisma_migrations)", () => {
    expect(INIT_SCHEMA_SRC).toMatch(/"Application"/);
    expect(INIT_SCHEMA_SRC).toMatch(/"RecruitmentPeriod"/);
    expect(INIT_SCHEMA_SRC).toMatch(/"RuntimeSetting"/);
    expect(INIT_SCHEMA_SRC).toMatch(/accessTokenHash/);
    // Tidak ada pengecekan yang hanya mengandalkan _prisma_migrations
    expect(INIT_SCHEMA_SRC).not.toMatch(/_prisma_migrations/);
  });

  it("runtime-settings.ts no longer auto-creates RuntimeSetting table (DDL removed)", () => {
    const rs = readFileSync(
      "D:/Dev/Projects/bareskrim-rekrutmen-v2/src/lib/runtime-settings.ts",
      "utf-8"
    );
    expect(rs).not.toMatch(/CREATE TABLE/i);
    expect(rs).toMatch(/RUNTIME_SETTING_TABLE_MISSING/);
  });

  it("migration.sql (TASK 03F) is additive-only: no DROP/TRUNCATE/DELETE", () => {
    const sql = readFileSync(
      "D:/Dev/Projects/bareskrim-rekrutmen-v2/prisma/migrations/20261002000000_init_v2_baseline/migration.sql",
      "utf-8"
    );
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    // Tidak ada referensi schema selain default (public)
    expect(sql).not.toMatch(/search_path/i);
    expect(sql).not.toMatch(/SET SCHEMA/i);
    // Coverage: 14 tabel + 6 enum
    for (const t of ALL_TABLE_NAMES) {
      expect(sql).toContain(`CREATE TABLE "${t}"`);
    }
    for (const e of [
      "QuestionType",
      "AttemptStatus",
      "BlacklistCategory",
      "ApplicationStatus",
      "Gender",
      "VerdictStatus",
    ]) {
      expect(sql).toContain(`CREATE TYPE "${e}"`);
    }
    // FK penting
    expect(sql).toContain(
      'FOREIGN KEY ("recruitmentPeriodId") REFERENCES "RecruitmentPeriod"("id") ON DELETE RESTRICT'
    );
    expect(sql).toContain(
      'FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL'
    );
    // Composite unique satu-per-roblox-per-periode
    expect(sql).toContain(
      'ON "Application"("recruitmentPeriodId", "robloxUsernameKey")'
    );
    // RuntimeSetting: PK "key", tanpa FK (tabel mandiri)
    expect(sql).toContain('CREATE TABLE "RuntimeSetting"');
    expect(sql).toContain('CONSTRAINT "RuntimeSetting_pkey" PRIMARY KEY ("key")');
    expect(sql).not.toMatch(/FOREIGN KEY[^;]*"RuntimeSetting"/);
  });
});
