import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Prisma: endpoint diagnostic read-only, tanpa database nyata.
const mockPrisma = {
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

const { GET, POST } = await import("../route");

const ADMIN_KEY = "unit-test-admin-key-03g";

const ALL_TABLES = [
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
].map((t) => ({ table_name: t }));

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

function mockQueries(tables: unknown[], columns: unknown[]) {
  mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) => {
    if (sql.includes("information_schema.tables")) return Promise.resolve(tables);
    if (sql.includes("information_schema.columns")) return Promise.resolve(columns);
    return Promise.resolve([]);
  });
}

function makeReq(method: "GET" | "POST", withAdminKey: boolean): Request {
  return new Request("http://localhost:3000/api/admin/init", {
    method,
    headers: withAdminKey ? { "x-admin-key": ADMIN_KEY } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_KEY = ADMIN_KEY;
});

describe("/api/admin/init — diagnostic read-only (TASK 03G)", () => {
  it("GET without admin key → 401", async () => {
    const res = await GET(makeReq("GET", false));
    expect(res.status).toBe(401);
  });

  it("GET with admin key → initialized=true when schema complete", async () => {
    mockQueries(ALL_TABLES, ALL_CRITICAL_COLUMNS);
    const res = await GET(makeReq("GET", true));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.initialized).toBe(true);
    expect(body.missing).toEqual([]);
  });

  it("GET reports missing objects when Application absent (read-only)", async () => {
    const tablesOnly = ALL_TABLES.filter((t) => t.table_name !== "Application");
    mockQueries(tablesOnly, []);
    const res = await GET(makeReq("GET", true));
    const body = await res.json();
    expect(body.initialized).toBe(false);
    expect(body.missing).toContain("Application");
  });

  it("POST without admin key → 401", async () => {
    const res = await POST(makeReq("POST", false));
    expect(res.status).toBe(401);
  });

  it("POST is disabled → 410, no DDL ever executed", async () => {
    mockQueries(ALL_TABLES, ALL_CRITICAL_COLUMNS);
    const res = await POST(makeReq("POST", true));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.initialized).toBe(true); // status saat ini tetap dilaporkan
    expect(body.message).toMatch(/Prisma Migrate/);
    expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("POST when schema incomplete → 410 with honest message", async () => {
    mockQueries([], []);
    const res = await POST(makeReq("POST", true));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.initialized).toBe(false);
    expect(body.message).toMatch(/prisma migrate deploy/i);
  });
});
