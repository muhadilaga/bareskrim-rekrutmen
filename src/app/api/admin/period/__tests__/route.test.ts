import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET, PATCH } from "../route";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    examPeriod: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    recruitmentPeriod: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    examAttempt: {
      deleteMany: vi.fn(),
    },
    examResult: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((cbOrArray: any) => {
      if (typeof cbOrArray === "function") {
        return cbOrArray(prisma);
      }
      return Promise.all(cbOrArray);
    }),
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  assertVerifiedAdmin: vi.fn().mockResolvedValue({
    discordUserId: "admin-1",
    discordUsername: "StaffAdmin",
    staffRoleId: "1471794305499664426",
  }),
}));

vi.mock("@/lib/constants", () => ({
  getAdminKey: () => "mock-admin-key",
}));

vi.mock("@/lib/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

describe("API /api/admin/period — Explicit Period Linkage & Activation Guard", () => {
  const reqHeaders = {
    "x-admin-key": "mock-admin-key",
    "Content-Type": "application/json",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Create dengan mapping valid -> Success HTTP 200", async () => {
    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue({
      id: "rec-1",
      code: "XLI-01",
      name: "Gel 1",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.examPeriod.create).mockResolvedValue({
      id: "exam-1",
      name: "Periode Ujian 1",
      description: "",
      recruitmentPeriodId: "rec-1",
      isActive: true,
      isExamOpen: false,
      isAttendanceOpen: false,
      seed: 12345,
      mcqCount: 15,
      essayCount: 5,
      passThreshold: 70,
      examStartTime: null,
      examEndTime: null,
      openedAt: new Date(),
      closedAt: null,
      deletedAt: null,
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "Periode Ujian 1",
        recruitmentPeriodId: "rec-1",
        draftMode: false,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toContain("berhasil dibuka");
  });

  it("2. Draft tanpa mapping -> Success HTTP 200 (isActive: false)", async () => {
    vi.mocked(prisma.examPeriod.create).mockResolvedValue({
      id: "exam-draft",
      name: "Draft Ujian",
      description: "",
      recruitmentPeriodId: null,
      isActive: false,
      isExamOpen: false,
      isAttendanceOpen: false,
      seed: 54321,
      mcqCount: null,
      essayCount: null,
      passThreshold: 70,
      examStartTime: null,
      examEndTime: null,
      openedAt: null,
      closedAt: null,
      deletedAt: null,
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "Draft Ujian",
        recruitmentPeriodId: null,
        draftMode: true,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toContain("Draft periode berhasil dibuat");
    expect(prisma.examPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          recruitmentPeriodId: null,
        }),
      })
    );
  });

  it("3. Create-and-activate tanpa recruitmentPeriodId -> Reject HTTP 400", async () => {
    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "Periode Tanpa Mapping",
        recruitmentPeriodId: null,
        draftMode: false,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("tanpa pemetaan RecruitmentPeriod");
  });

  it("4. Mapping ID tidak ditemukan -> Reject HTTP 400", async () => {
    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue(null);

    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "Periode Invalid Mapping",
        recruitmentPeriodId: "rec-invalid",
        draftMode: false,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("tidak ditemukan");
  });

  it("5. Mapping menuju parent soft-deleted -> Reject HTTP 400", async () => {
    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue({
      id: "rec-deleted",
      code: "DEL-01",
      name: "Deleted Rec Period",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: false,
      deletedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "Periode Parent Deleted",
        recruitmentPeriodId: "rec-deleted",
        draftMode: false,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("sudah dihapus");
  });

  it("6. Reopen tanpa mapping -> Reject HTTP 400", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-unmapped",
      name: "Unmapped Exam Period",
      recruitmentPeriodId: null,
      recruitmentPeriod: null,
      _count: { attempts: 0, attendances: 0 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-unmapped",
        action: "reopen",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("belum terhubung dengan Periode Pendaftaran");
  });

  it("7. toggleExamOpen tanpa mapping -> Reject HTTP 400", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-unmapped",
      name: "Unmapped Exam Period",
      recruitmentPeriodId: null,
      recruitmentPeriod: null,
      _count: { attempts: 0, attendances: 0 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-unmapped",
        action: "toggleExamOpen",
        isExamOpen: true,
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Akses ujian tidak dapat dibuka");
  });

  it("8. toggleAttendanceOpen tanpa mapping -> Reject HTTP 400", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-unmapped",
      name: "Unmapped Exam Period",
      recruitmentPeriodId: null,
      recruitmentPeriod: null,
      _count: { attempts: 0, attendances: 0 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-unmapped",
        action: "toggleAttendanceOpen",
        isAttendanceOpen: true,
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Akses absen tidak dapat dibuka");
  });

  it("9. Aktivasi unmapped ditolak -> tidak mengubah state periode lain", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-unmapped",
      name: "Unmapped Exam Period",
      recruitmentPeriodId: null,
      recruitmentPeriod: null,
      _count: { attempts: 0, attendances: 0 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-unmapped",
        action: "reopen",
      }),
    });

    await PATCH(req);
    expect(prisma.examPeriod.updateMany).not.toHaveBeenCalled();
    expect(prisma.examPeriod.update).not.toHaveBeenCalled();
  });

  it("10. Mengubah mapping pada periode yang sudah mempunyai Attempt -> Reject HTTP 409", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-has-attempts",
      name: "Exam Has Attempts",
      recruitmentPeriodId: "rec-1",
      recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
      _count: { attempts: 5, attendances: 0 },
    } as any);

    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue({
      id: "rec-2",
      code: "XLI-02",
      name: "Gel 2",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-has-attempts",
        action: "edit",
        recruitmentPeriodId: "rec-2",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("telah memiliki data historis");
  });

  it("11. Mengubah mapping pada periode yang mempunyai Attendance -> Reject HTTP 409", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-has-attendance",
      name: "Exam Has Attendance",
      recruitmentPeriodId: "rec-1",
      recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
      _count: { attempts: 0, attendances: 3 },
    } as any);

    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue({
      id: "rec-2",
      code: "XLI-02",
      name: "Gel 2",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-has-attendance",
        action: "edit",
        recruitmentPeriodId: "rec-2",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("telah memiliki data historis");
  });

  it("12. PATCH edit tanpa field mapping -> Mempertahankan mapping existing", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-1",
      name: "Exam 1",
      recruitmentPeriodId: "rec-1",
      recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
      _count: { attempts: 0, attendances: 0 },
    } as any);

    vi.mocked(prisma.examPeriod.update).mockResolvedValue({} as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-1",
        action: "edit",
        passThreshold: 80,
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(prisma.examPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ recruitmentPeriodId: expect.anything() }),
      })
    );
  });

  it("13. PATCH edit menghapus mapping (recruitmentPeriodId: null) pada periode aktif -> Reject HTTP 400", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-active",
      name: "Active Exam",
      isActive: true,
      isExamOpen: true,
      recruitmentPeriodId: "rec-1",
      recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
      _count: { attempts: 0, attendances: 0 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-active",
        action: "edit",
        recruitmentPeriodId: null,
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("pada periode yang sedang aktif");
  });

  it("14. Unauthorized request -> Reject HTTP 401", async () => {
    const req = new Request("http://localhost/api/admin/period", {
      method: "GET",
      headers: { "x-admin-key": "wrong-key" },
    });

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
  });

  it("15. Multiple active period policy (POST create-and-activate deactivates previous active period)", async () => {
    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue({
      id: "rec-1",
      code: "XLI-01",
      name: "Gel 1",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.examPeriod.create).mockResolvedValue({
      id: "exam-new",
      name: "New Active Exam",
      recruitmentPeriodId: "rec-1",
      isActive: true,
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "New Active Exam",
        recruitmentPeriodId: "rec-1",
        draftMode: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("16. GET response kompatibel dengan CandidatesTab (includes recruitmentPeriod & recruitmentPeriods)", async () => {
    vi.mocked(prisma.examPeriod.findMany).mockResolvedValue([
      {
        id: "exam-1",
        name: "Exam 1",
        isActive: true,
        recruitmentPeriodId: "rec-1",
        recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
        _count: { attempts: 1, attendances: 1 },
        attempts: [],
        attendances: [],
      } as any,
    ]);

    vi.mocked(prisma.recruitmentPeriod.findMany).mockResolvedValue([
      { id: "rec-1", code: "XLI-01", name: "Gel 1", isActive: true },
    ] as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "GET",
      headers: reqHeaders,
    });

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.periods).toBeDefined();
    expect(json.recruitmentPeriods).toBeDefined();
    expect(json.periods[0].recruitmentPeriod).toEqual({
      id: "rec-1",
      code: "XLI-01",
      name: "Gel 1",
      deletedAt: null,
    });
  });

  it("17. POST invalid parent -> zero partial writes", async () => {
    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue(null);

    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "Invalid Parent",
        recruitmentPeriodId: "rec-none",
        draftMode: false,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.examPeriod.create).not.toHaveBeenCalled();
  });

  it("18. POST activation uses transaction path", async () => {
    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue({
      id: "rec-1",
      code: "XLI-01",
      name: "Gel 1",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.examPeriod.create).mockResolvedValue({
      id: "exam-new",
      name: "New Active Exam",
      recruitmentPeriodId: "rec-1",
      isActive: true,
      isExamOpen: false,
      isAttendanceOpen: false,
      seed: 12345,
      mcqCount: 15,
      essayCount: 5,
      passThreshold: 70,
      examStartTime: null,
      examEndTime: null,
      openedAt: new Date(),
      closedAt: null,
      deletedAt: null,
      description: "",
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "New Active Exam",
        recruitmentPeriodId: "rec-1",
        draftMode: false,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    // create() dipanggil via tx (argumen sama dengan prisma.examPeriod pada mock),
    // sehingga jalur non-transactional create() tidak boleh terpakai.
    expect(prisma.examPeriod.create).toHaveBeenCalledTimes(1);
    expect(prisma.examPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recruitmentPeriodId: "rec-1",
          name: "New Active Exam",
        }),
      })
    );
    // Deactivate periode lama harus terjadi di dalam transaksi yang sama.
    expect(prisma.examPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        data: { isActive: false, closedAt: expect.any(Date) },
      })
    );
  });

  it("19. reopen invalid mapping -> zero mutations", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-unmapped",
      name: "Unmapped Exam Period",
      recruitmentPeriodId: null,
      recruitmentPeriod: null,
      _count: { attempts: 0, attendances: 0 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-unmapped",
        action: "reopen",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("belum terhubung dengan Periode Pendaftaran");
    expect(prisma.examPeriod.updateMany).not.toHaveBeenCalled();
    expect(prisma.examPeriod.update).not.toHaveBeenCalled();
  });

  it("20. reopen valid transactional path", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-mapped",
      name: "Mapped Exam Period",
      recruitmentPeriodId: "rec-1",
      recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
      _count: { attempts: 0, attendances: 0 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-mapped",
        action: "reopen",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.examPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, NOT: { id: "exam-mapped" } },
        data: { isActive: false, closedAt: expect.any(Date) },
      })
    );
    expect(prisma.examPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exam-mapped" },
        data: { closedAt: null, isActive: true },
      })
    );
  });

  it("21. edit mapping with Attempt -> 409", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-has-attempts",
      name: "Exam Has Attempts",
      recruitmentPeriodId: "rec-1",
      recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
      _count: { attempts: 5, attendances: 0 },
    } as any);

    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue({
      id: "rec-2",
      code: "XLI-02",
      name: "Gel 2",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-has-attempts",
        action: "edit",
        recruitmentPeriodId: "rec-2",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("telah memiliki data historis");
    expect(prisma.examPeriod.update).not.toHaveBeenCalled();
  });

  it("22. edit mapping with Attendance -> 409", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-has-attendance",
      name: "Exam Has Attendance",
      recruitmentPeriodId: "rec-1",
      recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
      _count: { attempts: 0, attendances: 3 },
    } as any);

    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue({
      id: "rec-2",
      code: "XLI-02",
      name: "Gel 2",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-has-attendance",
        action: "edit",
        recruitmentPeriodId: "rec-2",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("telah memiliki data historis");
    expect(prisma.examPeriod.update).not.toHaveBeenCalled();
  });

  it("23. successful edit mapping after transactional checks", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-clean",
      name: "Clean Exam",
      recruitmentPeriodId: "rec-1",
      recruitmentPeriod: { id: "rec-1", code: "XLI-01", name: "Gel 1", deletedAt: null },
      _count: { attempts: 0, attendances: 0 },
    } as any);

    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue({
      id: "rec-2",
      code: "XLI-02",
      name: "Gel 2",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.examPeriod.update).mockResolvedValue({
      id: "exam-clean",
      name: "Clean Exam",
      recruitmentPeriodId: "rec-2",
      isActive: false,
      isExamOpen: false,
      isAttendanceOpen: false,
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-clean",
        action: "edit",
        recruitmentPeriodId: "rec-2",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.examPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recruitmentPeriodId: "rec-2" }),
      })
    );
  });

  it("24. delete empty period -> success", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-empty",
      name: "Empty Exam",
      recruitmentPeriodId: null,
      _count: { attempts: 0, attendances: 0 },
    } as any);

    vi.mocked(prisma.examPeriod.delete).mockResolvedValue({
      id: "exam-empty",
      name: "Empty Exam",
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-empty",
        action: "delete",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(prisma.examPeriod.delete).toHaveBeenCalledWith({
      where: { id: "exam-empty" },
    });
  });

  it("25. delete with Attempt -> 409 PERIOD_HAS_HISTORICAL_DATA", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-with-attempts",
      name: "Exam With Attempts",
      recruitmentPeriodId: "rec-1",
      _count: { attempts: 2, attendances: 0 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-with-attempts",
        action: "delete",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("data historis");
    expect(prisma.examPeriod.delete).not.toHaveBeenCalled();
  });

  it("26. delete with Attendance -> 409 PERIOD_HAS_HISTORICAL_DATA", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-with-attendance",
      name: "Exam With Attendance",
      recruitmentPeriodId: "rec-1",
      _count: { attempts: 0, attendances: 4 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-with-attendance",
        action: "delete",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("data historis");
    expect(prisma.examPeriod.delete).not.toHaveBeenCalled();
  });

  it("27. delete with ExamResult through Attempt -> blocked transitively", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-with-results",
      name: "Exam With Results",
      recruitmentPeriodId: "rec-1",
      _count: { attempts: 1, attendances: 0 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-with-results",
        action: "delete",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(prisma.examResult.deleteMany).not.toHaveBeenCalled();
    expect(prisma.examAttempt.deleteMany).not.toHaveBeenCalled();
    expect(prisma.examPeriod.delete).not.toHaveBeenCalled();
  });

  it("28. reset without confirmReset:true -> 400 RESET_CONFIRMATION_REQUIRED", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-to-reset",
      name: "Exam To Reset",
      recruitmentPeriodId: "rec-1",
      _count: { attempts: 3, attendances: 2 },
    } as any);

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-to-reset",
        action: "reset",
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("konfirmasi eksplisit");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("29. reset with confirmReset:true -> success", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-to-reset",
      name: "Exam To Reset",
      recruitmentPeriodId: "rec-1",
      _count: { attempts: 3, attendances: 2 },
    } as any);

    vi.mocked(prisma.examResult.deleteMany).mockResolvedValue({ count: 2 });
    vi.mocked(prisma.examAttempt.deleteMany).mockResolvedValue({ count: 3 });

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-to-reset",
        action: "reset",
        confirmReset: true,
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toContain("3 attempt, 2 hasil");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.examResult.deleteMany).toHaveBeenCalledWith({
      where: { attempt: { periodId: "exam-to-reset" } },
    });
    expect(prisma.examAttempt.deleteMany).toHaveBeenCalledWith({
      where: { periodId: "exam-to-reset" },
    });
  });

  it("30. failed validation -> zero partial mutation", async () => {
    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "Invalid MCQ Count",
        recruitmentPeriodId: "rec-1",
        draftMode: false,
        mcqCount: 999,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("tidak valid");
    expect(prisma.examPeriod.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("31. Create dengan autoCreateRecruitment -> auto generate RecruitmentPeriod and Success HTTP 200", async () => {
    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.recruitmentPeriod.create).mockResolvedValue({
      id: "rec-auto-43",
      code: "AK-43",
      name: "Rekrutmen Angkatan 43",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.examPeriod.create).mockResolvedValue({
      id: "exam-43",
      name: "Rekrutmen Angkatan 43",
      description: "",
      recruitmentPeriodId: "rec-auto-43",
      isActive: true,
      isExamOpen: false,
      isAttendanceOpen: false,
      seed: 12345,
      mcqCount: 15,
      essayCount: 5,
      passThreshold: 70,
      examStartTime: null,
      examEndTime: null,
      openedAt: new Date(),
      closedAt: null,
      deletedAt: null,
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({
        name: "Rekrutmen Angkatan 43",
        autoCreateRecruitment: true,
        draftMode: false,
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toContain("berhasil dibuka");
  });

  it("32. Reopen draft dengan autoCreateRecruitment -> auto generate and link RecruitmentPeriod", async () => {
    vi.mocked(prisma.examPeriod.findUnique).mockResolvedValue({
      id: "exam-draft-43",
      name: "Rekrutmen Angkatan 43",
      description: "",
      recruitmentPeriodId: null,
      isActive: false,
      isExamOpen: false,
      isAttendanceOpen: false,
      seed: 12345,
      mcqCount: null,
      essayCount: null,
      passThreshold: 70,
      examStartTime: null,
      examEndTime: null,
      openedAt: null,
      closedAt: null,
      deletedAt: null,
      recruitmentPeriod: null,
      _count: { attempts: 0, attendances: 0 },
    } as any);
    vi.mocked(prisma.recruitmentPeriod.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.recruitmentPeriod.create).mockResolvedValue({
      id: "rec-auto-43",
      code: "AK-43",
      name: "Rekrutmen Angkatan 43",
      openedAt: new Date(),
      closedAt: new Date(),
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new Request("http://localhost/api/admin/period", {
      method: "PATCH",
      headers: reqHeaders,
      body: JSON.stringify({
        periodId: "exam-draft-43",
        action: "reopen",
        autoCreateRecruitment: true,
      }),
    });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.message).toContain("berhasil dibuka kembali");
  });
});
