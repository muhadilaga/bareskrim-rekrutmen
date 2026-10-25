import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplicationStatus } from '@prisma/client';
import {
  requireCurrentCandidateEligibility,
  CandidateGuardError,
} from '@/lib/candidate-guard';
import { linkApplicationToUser, hashAccessToken } from '@/lib/application-service';

// Mock Prisma Client — updateMany dipakai untuk conditional update (race-safe).
const mockPrisma = {
  application: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn((callback: any) => callback(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// TASK 03L.2E.4.1D — route mengimpor assertVerifiedAdmin dari @/lib/admin-auth.
vi.mock('@/lib/admin-auth', () => ({
  assertVerifiedAdmin: vi.fn(async (req: Request) => {
    const adminKey = req.headers.get('x-admin-key');
    if (adminKey !== 'valid-admin-key') return null;
    return {
      discordUserId: 'discord-admin-1',
      discordUsername: 'StaffAdmin',
      staffRoleId: '1471794305499664426',
    };
  }),
}));

vi.mock('@/lib/audit', () => ({
  logAdminAction: vi.fn(),
}));

describe('Admin Application Status API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((callback: any) => callback(mockPrisma));
  });

  const mockApplication = {
    id: 'app-123',
    registrationId: 'XLI-01-ABC123',
    status: 'MENUNGGU_VERIFIKASI' as ApplicationStatus,
    recruitmentPeriodId: 'rec-001',
    deletedAt: null,
    user: {
      id: 'user-001',
      deletedAt: null,
    },
  };

  function postReq(body: unknown) {
    return new Request('http://localhost/api/admin/applications', {
      method: 'POST',
      headers: {
        'x-admin-key': 'valid-admin-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  it('1. GET rejects unauthorized request with 401', async () => {
    const { GET } = await import('@/app/api/admin/applications/route');
    const req = new Request('http://localhost/api/admin/applications', {
      headers: { 'x-admin-key': 'invalid-key' },
    });
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(mockPrisma.application.findMany).not.toHaveBeenCalled();
  });

  it('2. GET returns list of applications when authorized', async () => {
    mockPrisma.application.findMany.mockResolvedValue([mockApplication]);

    const { GET } = await import('@/app/api/admin/applications/route');
    const req = new Request('http://localhost/api/admin/applications', {
      headers: { 'x-admin-key': 'valid-admin-key' },
    });
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.applications).toHaveLength(1);
    expect(data.applications[0].id).toBe('app-123');
    expect(data.applications[0].status).toBe('MENUNGGU_VERIFIKASI');
  });

  it('3. Admin terverifikasi dapat menerima Application (MENUNGGU_VERIFIKASI -> DITERIMA)', async () => {
    mockPrisma.application.findUnique.mockResolvedValue(mockApplication);
    mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'DITERIMA' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.message).toContain('DITERIMA');
    // Conditional update: where menyertakan status lama + deletedAt null (race-safe).
    expect(mockPrisma.application.updateMany).toHaveBeenCalledWith({
      where: { id: 'app-123', status: 'MENUNGGU_VERIFIKASI', deletedAt: null },
      data: { status: 'DITERIMA' },
    });
  });

  it('4. Admin terverifikasi dapat menolak Application (MENUNGGU_VERIFIKASI -> DITOLAK)', async () => {
    mockPrisma.application.findUnique.mockResolvedValue(mockApplication);
    mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'DITOLAK' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.message).toContain('DITOLAK');
  });

  it('5. Transisi DITERIMA -> DITOLAK diizinkan', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...mockApplication,
      status: 'DITERIMA' as ApplicationStatus,
    });
    mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'DITOLAK' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockPrisma.application.updateMany).toHaveBeenCalledWith({
      where: { id: 'app-123', status: 'DITERIMA', deletedAt: null },
      data: { status: 'DITOLAK' },
    });
  });

  it('6. Transisi DITOLAK -> DITERIMA diizinkan', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...mockApplication,
      status: 'DITOLAK' as ApplicationStatus,
    });
    mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'DITERIMA' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockPrisma.application.updateMany).toHaveBeenCalledWith({
      where: { id: 'app-123', status: 'DITOLAK', deletedAt: null },
      data: { status: 'DITERIMA' },
    });
  });

  it('7. Same-state update aman/idempotent (tanpa write, tanpa error)', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...mockApplication,
      status: 'DITERIMA' as ApplicationStatus,
    });

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'DITERIMA' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.unchanged).toBe(true);
    expect(mockPrisma.application.updateMany).not.toHaveBeenCalled();
  });

  it('8. Application soft-deleted ditolak (400, tanpa write)', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...mockApplication,
      deletedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'DITERIMA' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(data.message).toContain('soft-deleted');
    expect(mockPrisma.application.updateMany).not.toHaveBeenCalled();
  });

  it('9. userId: null tetap dapat di-approve', async () => {
    mockPrisma.application.findUnique.mockResolvedValue({
      ...mockApplication,
      userId: null,
      user: null,
    });
    mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'DITERIMA' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it('10. Invalid applicationId ditolak (400, tanpa query)', async () => {
    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: '', status: 'DITERIMA' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(mockPrisma.application.findUnique).not.toHaveBeenCalled();
  });

  it('11. Status tidak valid ditolak (400, tanpa query)', async () => {
    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'UNKNOWN' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.ok).toBe(false);
    expect(mockPrisma.application.findUnique).not.toHaveBeenCalled();
  });

  it('12. Application tidak ditemukan ditolak (404)', async () => {
    mockPrisma.application.findUnique.mockResolvedValue(null);

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'non-existent', status: 'DITERIMA' }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.ok).toBe(false);
    expect(data.message).toContain('Application not found');
  });

  it('13. Race condition: updateMany count 0 + status berubah -> 409 conflict', async () => {
    mockPrisma.application.findUnique
      .mockResolvedValueOnce(mockApplication)
      .mockResolvedValueOnce({ ...mockApplication, status: 'DITERIMA' as ApplicationStatus });
    mockPrisma.application.updateMany.mockResolvedValue({ count: 0 });

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'DITERIMA' }));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.ok).toBe(false);
    expect(data.message).toContain('DITERIMA');
  });

  it('14. Mutation status tidak mengubah data historis lain (data hanya berisi status)', async () => {
    mockPrisma.application.findUnique.mockResolvedValue(mockApplication);
    mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import('@/app/api/admin/applications/route');
    await POST(postReq({ applicationId: 'app-123', status: 'DITERIMA' }));

    const args = mockPrisma.application.updateMany.mock.calls[0][0];
    expect(Object.keys(args.data)).toEqual(['status']);
    expect(args.data).toEqual({ status: 'DITERIMA' });
    expect(args.data).not.toHaveProperty('userId');
    expect(args.data).not.toHaveProperty('verifiedAt');
    expect(args.data).not.toHaveProperty('rejectionReason');
    expect(args.data).not.toHaveProperty('accessTokenHash');
  });

  it('15. Student Claim tidak mengubah status Application', async () => {
    // Mock tx mengikuti pola linkApplicationToUser: updateMany hanya menulis
    // userId + verifiedAt; status harus tetap MENUNGGU_VERIFIKASI.
    let row = {
      id: 'app-claim',
      userId: null as string | null,
      verifiedAt: null as Date | null,
      status: 'MENUNGGU_VERIFIKASI' as ApplicationStatus,
      deletedAt: null as Date | null,
      robloxUsernameKey: 'casistest',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      recruitmentPeriod: { deletedAt: null },
    };
    const txApplication = {
      findUnique: vi.fn(async () => ({ ...row })),
      updateMany: vi.fn(async ({ data }: any) => {
        row = { ...row, ...data, updatedAt: new Date('2026-02-01T00:00:00.000Z') };
        return { count: 1 };
      }),
    };
    const tx = { application: txApplication };

    const result = await linkApplicationToUser(tx as any, {
      applicationId: 'app-claim',
      userId: 'user-claim',
      robloxUsername: 'CasisTest',
    });

    expect(result.success).toBe(true);
    expect(row.status).toBe('MENUNGGU_VERIFIKASI');
    expect(row.userId).toBe('user-claim');
    expect(row.verifiedAt).not.toBeNull();
    const written = txApplication.updateMany.mock.calls[0][0].data;
    expect(Object.keys(written).sort()).toEqual(['userId', 'verifiedAt']);
    expect(written).not.toHaveProperty('status');

    // Hash token tidak ikut berubah oleh claim.
    expect(hashAccessToken('x')).toHaveLength(64);
  });

  describe('16. Candidate Guard compatibility — guard membaca status terbaru', () => {
    const token = 'SYNTHETIC-GUARD-CREDENTIAL';
    const user = { id: 'user-guard', username: 'CasisGuard', displayName: 'Casis Guard', discordUsername: null };
    const baseApplication = {
      id: 'app-guard',
      registrationId: 'XLI-01-GUARD01',
      recruitmentPeriodId: 'rec-guard',
      verifiedAt: null,
      userId: 'user-guard',
      deletedAt: null,
    };
    const examPeriod = {
      id: 'exam-guard',
      name: 'Periode Ujian Guard',
      recruitmentPeriodId: 'rec-guard',
      isActive: true,
      isAttendanceOpen: true,
      isExamOpen: true,
      examStartTime: null,
      examEndTime: null,
      seed: 42,
      mcqCount: 15,
      essayCount: 5,
      passThreshold: 70,
      openedAt: null,
      closedAt: null,
    };
    const recruitmentPeriod = {
      id: 'rec-guard',
      code: 'XLI-01',
      name: 'Gel 1',
      isActive: true,
      openedAt: new Date('2026-01-01'),
      closedAt: null,
      deletedAt: null,
    };

    function guardDb(status: ApplicationStatus) {
      return {
        examPeriod: { findMany: vi.fn(async () => [examPeriod]) },
        recruitmentPeriod: { findUnique: vi.fn(async () => recruitmentPeriod) },
        application: { findFirst: vi.fn(async () => ({ ...baseApplication, status })) },
        examAttempt: { findFirst: vi.fn() },
        examResult: { findFirst: vi.fn() },
        attendance: { findFirst: vi.fn() },
      } as any;
    }

    it('16a. DITERIMA -> guard melewatkan eligibility (status terbaru terbaca)', async () => {
      const ctx = await requireCurrentCandidateEligibility(guardDb('DITERIMA'), user);
      expect(ctx.application.status).toBe('DITERIMA');
      expect(ctx.application.id).toBe('app-guard');
    });

    it('16b. MENUNGGU_VERIFIKASI -> guard menolak dengan APPLICATION_PENDING', async () => {
      await expect(
        requireCurrentCandidateEligibility(guardDb('MENUNGGU_VERIFIKASI'), user),
      ).rejects.toMatchObject({ code: 'APPLICATION_PENDING' });
    });

    it('16c. DITOLAK -> guard menolak dengan APPLICATION_REJECTED', async () => {
      await expect(
        requireCurrentCandidateEligibility(guardDb('DITOLAK'), user),
      ).rejects.toMatchObject({ code: 'APPLICATION_REJECTED' });
    });

    it('16d. Error guard adalah CandidateGuardError dengan httpStatus 403', async () => {
      try {
        await requireCurrentCandidateEligibility(guardDb('DITOLAK'), user);
        expect.unreachable('harus throw');
      } catch (err) {
        expect(err).toBeInstanceOf(CandidateGuardError);
        expect((err as CandidateGuardError).httpStatus).toBe(403);
      }
    });
  });

  it('17. Approval tidak memberikan akses ujian langsung (tanpa attempt/attendance)', async () => {
    mockPrisma.application.findUnique.mockResolvedValue(mockApplication);
    mockPrisma.application.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import('@/app/api/admin/applications/route');
    const response = await POST(postReq({ applicationId: 'app-123', status: 'DITERIMA' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    // Response hanya berisi status Application — tidak ada attempt/attendance/access token.
    expect(data).not.toHaveProperty('examAttemptId');
    expect(data).not.toHaveProperty('attendanceId');
    expect(data).not.toHaveProperty('accessToken');
    expect(data).not.toHaveProperty('examAccess');
  });
});
