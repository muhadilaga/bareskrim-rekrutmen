import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockAuth } = vi.hoisted(() => ({
  mockPrisma: {
    examPeriod: { findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    application: { findFirst: vi.fn() },
    attendance: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
  mockAuth: {
    user: null as { id: string; robloxId: bigint; username: string } | null,
  },
}));

vi.mock("@/lib/init-schema", () => ({
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn().mockImplementation(async () => mockAuth.user),
  signCasisPortalSession: vi.fn().mockResolvedValue("mocked-casis-jwt-token"),
  SESSION_COOKIE: "casis_session",
}));

import { GET } from "../route";

describe("GET /api/attendance/check — Trust Boundary & Session Isolation", () => {
  const PERIOD = {
    id: "ep-1",
    name: "Periode Ujian 43",
    isActive: true,
    isAttendanceOpen: true,
  };

  const TARGET_USER = {
    id: "user-victim-123",
    username: "VictimCandidate",
    robloxId: 999999n,
  };

  const ATTENDANCE = {
    id: "att-1",
    userId: "user-victim-123",
    periodId: "ep-1",
    tahap: "AKADEMIK",
    status: "APPROVED",
    roleEligible: true,
    instructorNotes: "Lulus verifikasi berkas",
    verifiedAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = null;
    mockPrisma.examPeriod.findFirst.mockResolvedValue(PERIOD);
    mockPrisma.user.findFirst.mockResolvedValue(TARGET_USER);
    mockPrisma.user.findUnique.mockResolvedValue(TARGET_USER);
    mockPrisma.application.findFirst.mockResolvedValue({
      id: "app-1",
      userId: TARGET_USER.id,
      status: "APPROVED",
    });
    mockPrisma.attendance.findFirst.mockResolvedValue(ATTENDANCE);
    mockPrisma.attendance.findUnique.mockResolvedValue(ATTENDANCE);
  });

  it("Public unauthenticated inquiry MUST NOT issue a casis_session cookie for target user", async () => {
    // Unauthenticated caller queries victim's attendance status by username
    const req = new Request("http://localhost/api/attendance/check?username=VictimCandidate");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.attended).toBe(true);

    // CRITICAL: Must not issue session cookie to unauthenticated public inquiry!
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeNull();
    expect(res.cookies.get("casis_session")).toBeUndefined();
  });

  it("Authenticated user querying their own attendance receives data without session hijacking", async () => {
    mockAuth.user = {
      id: "user-me",
      robloxId: 111111n,
      username: "SelfUser",
    };
    mockPrisma.user.findFirst.mockResolvedValue(mockAuth.user);
    mockPrisma.attendance.findUnique.mockResolvedValue({
      ...ATTENDANCE,
      userId: "user-me",
    });

    const req = new Request("http://localhost/api/attendance/check");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.attended).toBe(true);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
