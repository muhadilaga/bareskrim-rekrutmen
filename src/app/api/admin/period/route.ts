import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomSeed } from "@/lib/utils";
import { getAdminKey } from "@/lib/constants";
import { logAdminAction } from "@/lib/audit";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function isAdmin(req: Request): Promise<boolean> {
  if (req.headers.get("x-admin-key") !== getAdminKey()) return false;
  const { assertVerifiedAdmin } = await import("@/lib/admin-auth");
  return !!(await assertVerifiedAdmin(req));
}

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const OpenPeriodSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional().default(""),
  recruitmentPeriodId: z.string().trim().nullable().optional(),
  autoCreateRecruitment: z.boolean().optional().default(false),
  recruitmentCode: z.string().trim().max(50).optional(),
  draftMode: z.boolean().optional().default(false),
  mcqCount: z.number().int().min(1).max(50).nullable().optional(),
  essayCount: z.number().int().min(1).max(50).nullable().optional(),
  passThreshold: z.number().int().min(1).max(1000).optional().default(70),
  examStartTime: z.string().datetime().optional().nullable(),
  examEndTime: z.string().datetime().optional().nullable(),
});

function isTableMissing(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021";
}

async function getOrCreateRecruitmentPeriod(
  tx: Prisma.TransactionClient,
  periodName: string,
  customCode?: string
) {
  let code = (customCode || "").trim().toUpperCase();
  if (!code) {
    const numMatch = periodName.match(/\b\d+\b/);
    if (numMatch) {
      code = `AK-${numMatch[0]}`;
    } else {
      code = periodName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 10);
      if (!code) code = "REC-NEW";
    }
  }

  let candidateCode = code;
  let counter = 1;
  while (await tx.recruitmentPeriod.findUnique({ where: { code: candidateCode }, select: { id: true } })) {
    candidateCode = `${code}-${counter++}`;
  }

  return tx.recruitmentPeriod.create({
    data: {
      code: candidateCode,
      name: periodName,
      openedAt: new Date(),
      closedAt: new Date(Date.now() + 30 * 86400000),
      isActive: true,
    },
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }
  const limited = adminLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, message: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = OpenPeriodSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Nama periode tidak valid." }, { status: 400 });
  }

  const { draftMode, recruitmentPeriodId, autoCreateRecruitment, recruitmentCode } = parsed.data;
  const isAuto = autoCreateRecruitment || recruitmentPeriodId === "auto";

  // Jika mengaktifkan (bukan draft), recruitmentPeriodId wajib terisi & valid KECUALI isAuto
  if (!draftMode && !isAuto) {
    if (!recruitmentPeriodId) {
      return NextResponse.json(
        { ok: false, message: "ExamPeriod tidak dapat diaktifkan tanpa pemetaan RecruitmentPeriod yang valid." },
        { status: 400 }
      );
    }

    const recPeriod = await prisma.recruitmentPeriod.findUnique({
      where: { id: recruitmentPeriodId },
      select: { id: true, deletedAt: true },
    });

    if (!recPeriod || recPeriod.deletedAt !== null) {
      return NextResponse.json(
        { ok: false, message: "Periode Pendaftaran tidak ditemukan atau sudah dihapus." },
        { status: 400 }
      );
    }
  }

  try {
    if (draftMode) {
      // Simpan sebagai Draft (isActive: false)
      let effectiveDraftRecId = recruitmentPeriodId;
      if (effectiveDraftRecId === "auto") effectiveDraftRecId = null;

      const created = await prisma.examPeriod.create({
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          recruitmentPeriodId: effectiveDraftRecId ?? null,
          isActive: false,
          isExamOpen: false,
          isAttendanceOpen: false,
          seed: randomSeed(),
          mcqCount: parsed.data.mcqCount ?? null,
          essayCount: parsed.data.essayCount ?? null,
          passThreshold: parsed.data.passThreshold ?? 70,
          examStartTime: parsed.data.examStartTime ? new Date(parsed.data.examStartTime) : null,
          examEndTime: parsed.data.examEndTime ? new Date(parsed.data.examEndTime) : null,
        },
      });

      await logAdminAction({
        action: "DRAFT_PERIODE",
        target: created.name,
        detail: { description: parsed.data.description, recruitmentPeriodId: created.recruitmentPeriodId },
      });

      return NextResponse.json({ ok: true, message: "Draft periode berhasil dibuat." });
    } else {
      // Buat & Aktifkan: Periode lama ditutup otomatis via transaksi
      const created = await prisma.$transaction(async (tx) => {
        let effectiveRecId = recruitmentPeriodId;

        if (isAuto) {
          const newRec = await getOrCreateRecruitmentPeriod(tx, parsed.data.name, recruitmentCode);
          effectiveRecId = newRec.id;
        } else {
          // Validate recruitmentPeriodId inside transaction
          const recPeriod = await tx.recruitmentPeriod.findUnique({
            where: { id: effectiveRecId! },
            select: { id: true, deletedAt: true },
          });
          if (!recPeriod || recPeriod.deletedAt !== null) {
            throw new Error('INVALID_RECRUITMENT_PERIOD');
          }
        }

        // Deactivate active periods
        await tx.examPeriod.updateMany({
          where: { isActive: true },
          data: { isActive: false, closedAt: new Date() },
        });
        // Create new active period
        return tx.examPeriod.create({
          data: {
            name: parsed.data.name,
            description: parsed.data.description,
            recruitmentPeriodId: effectiveRecId!,
            seed: randomSeed(),
            mcqCount: parsed.data.mcqCount ?? null,
            essayCount: parsed.data.essayCount ?? null,
            passThreshold: parsed.data.passThreshold ?? 70,
            examStartTime: parsed.data.examStartTime ? new Date(parsed.data.examStartTime) : null,
            examEndTime: parsed.data.examEndTime ? new Date(parsed.data.examEndTime) : null,
          },
        });
      });

      await logAdminAction({
        action: "BUKA_PERIODE",
        target: created.name,
        detail: { description: parsed.data.description, recruitmentPeriodId: created.recruitmentPeriodId },
      });

      return NextResponse.json({ ok: true, message: "Periode baru berhasil dibuka." });
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "";
    // Custom client errors from transactional checks
    if (errMsg === 'INVALID_RECRUITMENT_PERIOD') {
      return NextResponse.json({ ok: false, message: "Periode Pendaftaran tidak ditemukan atau sudah dihapus." }, { status: 400 });
    }
    if (errMsg === 'INVALID_RECRUITMENT_PERIOD_FOR_REOPEN') {
      return NextResponse.json({ ok: false, message: "Akses tidak dapat dibuka karena periode ujian belum terhubung dengan Periode Pendaftaran yang valid." }, { status: 400 });
    }
    if (errMsg === 'PERIOD_NOT_FOUND') {
      return NextResponse.json({ ok: false, message: "Periode tidak ditemukan." }, { status: 404 });
    }
    if (errMsg === 'CANNOT_UNMAP_ACTIVE_PERIOD') {
      return NextResponse.json({ ok: false, message: "Pemetaan tidak dapat dihapus pada periode yang sedang aktif." }, { status: 400 });
    }
    if (errMsg === 'INVALID_NEW_RECRUITMENT_PERIOD') {
      return NextResponse.json({ ok: false, message: "Periode Pendaftaran tidak ditemukan atau sudah dihapus." }, { status: 400 });
    }
    if (errMsg === 'HISTORICAL_DATA_PREVENTS_MAPPING_CHANGE') {
      return NextResponse.json({ ok: false, message: "Pemetaan Periode Pendaftaran tidak dapat diubah karena periode ujian ini telah memiliki data historis (attempt/absen)." }, { status: 409 });
    }
    if (errMsg === 'INVALID_OPENED_AT_FORMAT') {
      return NextResponse.json({ ok: false, message: "Format tanggal dibuka tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_CLOSED_AT_FORMAT') {
      return NextResponse.json({ ok: false, message: "Format tanggal ditutup tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_MCQ_COUNT') {
      return NextResponse.json({ ok: false, message: "Jumlah soal Pilihan Ganda tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_ESSAY_COUNT') {
      return NextResponse.json({ ok: false, message: "Jumlah soal essay tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_PASS_THRESHOLD') {
      return NextResponse.json({ ok: false, message: "Nilai KKM tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_EXAM_START_TIME_FORMAT') {
      return NextResponse.json({ ok: false, message: "Format waktu mulai ujian tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_EXAM_END_TIME_FORMAT') {
      return NextResponse.json({ ok: false, message: "Format waktu tutup ujian tidak valid." }, { status: 400 });
    }
    if (isTableMissing(e)) {
      return NextResponse.json({ ok: true, periods: [], recruitmentPeriods: [] });
    }
    throw e;
  }
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  let periods: any[] = [];
  try {
    periods = await prisma.examPeriod.findMany({
      include: {
        recruitmentPeriod: {
          select: { id: true, code: true, name: true, deletedAt: true },
        },
        _count: { select: { attempts: true, attendances: true } },
        attempts: {
          select: {
            id: true,
            submittedAt: true,
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
        attendances: {
          select: {
            id: true,
            discordUserId: true,
            user: { select: { id: true, username: true, displayName: true } },
          },
        },
      },
    });
  } catch (err: any) {
    console.warn("[admin/period] Falling back to basic examPeriod:", err?.message);
    try {
      periods = await prisma.examPeriod.findMany({
        orderBy: { openedAt: "desc" },
      });
    } catch (fallbackErr: any) {
      console.error("[admin/period] Fatal error fetching periods:", fallbackErr?.message);
      return NextResponse.json(
        { ok: false, message: "Gagal memuat data periode dari database.", periods: [], recruitmentPeriods: [] },
        { status: 500 }
      );
    }
  }

  let recruitmentPeriods: any[] = [];
  try {
    recruitmentPeriods = await prisma.recruitmentPeriod.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (err: any) {
    console.warn("[admin/period] Notice on recruitmentPeriod query:", err?.message);
  }

  periods.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const aOpened = a.openedAt ? new Date(a.openedAt).getTime() : 0;
    const bOpened = b.openedAt ? new Date(b.openedAt).getTime() : 0;
    if (aOpened !== bOpened) return bOpened - aOpened;
    const aClosed = a.closedAt ? new Date(a.closedAt).getTime() : 0;
    const bClosed = b.closedAt ? new Date(b.closedAt).getTime() : 0;
    return bClosed - aClosed;
  });

  return NextResponse.json({ ok: true, periods, recruitmentPeriods });
}

export async function PATCH(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }
  const limited = adminLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, message: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const { periodId, action } = body ?? {};

  if (!periodId || !action) {
    return NextResponse.json(
      { ok: false, message: "periodId dan action wajib diisi." },
      { status: 400 }
    );
  }

  try {
    const period = await prisma.examPeriod.findUnique({
      where: { id: periodId },
      include: {
        recruitmentPeriod: { select: { id: true, code: true, name: true, deletedAt: true } },
        _count: { select: { attempts: true, attendances: true } },
      },
    });

    if (!period) {
      return NextResponse.json({ ok: false, message: "Periode tidak ditemukan." }, { status: 404 });
    }

    if (action === "close") {
      await prisma.examPeriod.update({
        where: { id: periodId },
        data: { closedAt: new Date(), isActive: false, isExamOpen: false, isAttendanceOpen: false },
      });
      await logAdminAction({ action: "TUTUP_PERIODE", target: period.name });
      return NextResponse.json({ ok: true, message: "Periode berhasil ditutup." });
    } else if (action === "reopen") {
      await prisma.$transaction(async (tx) => {
        // Read fresh period with recruitmentPeriod
        const freshPeriod = await tx.examPeriod.findUnique({
          where: { id: periodId },
          include: {
            recruitmentPeriod: { select: { id: true, deletedAt: true } },
          },
        });
        if (!freshPeriod) {
          throw new Error('PERIOD_NOT_FOUND');
        }

        let recId = freshPeriod.recruitmentPeriodId;

        // Auto-create or link if provided or if missing and requested
        if (!recId || freshPeriod.recruitmentPeriod?.deletedAt !== null) {
          if (body?.recruitmentPeriodId && body.recruitmentPeriodId !== "auto") {
            const candidateRec = await tx.recruitmentPeriod.findUnique({
              where: { id: body.recruitmentPeriodId },
              select: { id: true, deletedAt: true },
            });
            if (candidateRec && candidateRec.deletedAt === null) {
              recId = candidateRec.id;
              await tx.examPeriod.update({
                where: { id: periodId },
                data: { recruitmentPeriodId: recId },
              });
            }
          } else if (body?.autoCreateRecruitment || body?.recruitmentPeriodId === "auto") {
            const newRec = await getOrCreateRecruitmentPeriod(tx, freshPeriod.name);
            recId = newRec.id;
            await tx.examPeriod.update({
              where: { id: periodId },
              data: { recruitmentPeriodId: recId },
            });
          }
        }

        if (!recId) {
          throw new Error('INVALID_RECRUITMENT_PERIOD_FOR_REOPEN');
        }

        // Deactivate other active periods
        await tx.examPeriod.updateMany({
          where: { isActive: true, NOT: { id: periodId } },
          data: { isActive: false, closedAt: new Date() },
        });
        // Reopen target
        await tx.examPeriod.update({
          where: { id: periodId },
          data: { closedAt: null, isActive: true },
        });
      });
      await logAdminAction({ action: "BUKA_KEMBALI_PERIODE", target: period.name });
      return NextResponse.json({ ok: true, message: "Periode berhasil dibuka kembali." });
    } else if (action === "reset") {
      const { confirmReset } = body ?? {};
      if (confirmReset !== true) {
        return NextResponse.json({
          ok: false,
          message: "Reset membutuhkan konfirmasi eksplisit.",
          }, { status: 400 });
      }
      // Fetch period for logging name
      const periodForLog = await prisma.examPeriod.findUnique({
        where: { id: periodId },
        select: { name: true },
      });
      if (!periodForLog) {
        return NextResponse.json({ ok: false, message: "Periode tidak ditemukan." }, { status: 404 });
      }
      const deleted = await prisma.$transaction([
        prisma.examResult.deleteMany({ where: { attempt: { periodId } } }),
        prisma.examAttempt.deleteMany({ where: { periodId } }),
      ]);
      await logAdminAction({
        action: "RESET_UJIAN_PERIODE",
        target: periodForLog.name,
        detail: {
          deletedResults: deleted[0]?.count ?? 0,
          deletedAttempts: deleted[1]?.count ?? 0,
        },
      });
      return NextResponse.json({
        ok: true,
        message: `Reset berhasil. ${deleted[1]?.count ?? 0} attempt, ${deleted[0]?.count ?? 0} hasil dihapus.`,
      });
    } else if (action === "toggleExamOpen") {
      const { isExamOpen } = body ?? {};
      const targetState = Boolean(isExamOpen);

      if (targetState) {
        if (!period.recruitmentPeriodId || period.recruitmentPeriod?.deletedAt !== null) {
          return NextResponse.json(
            { ok: false, message: "Akses ujian tidak dapat dibuka karena periode belum terhubung dengan Periode Pendaftaran yang valid." },
            { status: 400 }
          );
        }
      }

      await prisma.examPeriod.update({
        where: { id: periodId },
        data: { isExamOpen: targetState },
      });
      const status = targetState ? "DIBUKA" : "DITUTUP";
      await logAdminAction({
        action: `UJIAN_${status}`,
        target: period.name,
        detail: { isExamOpen: targetState },
      });
      return NextResponse.json({ ok: true, message: `Akses ujian ${targetState ? "dibuka" : "ditutup"}.` });
    } else if (action === "toggleAttendanceOpen") {
      const { isAttendanceOpen } = body ?? {};
      const targetState = Boolean(isAttendanceOpen);

      if (targetState) {
        if (!period.recruitmentPeriodId || period.recruitmentPeriod?.deletedAt !== null) {
          return NextResponse.json(
            { ok: false, message: "Akses absen tidak dapat dibuka karena periode belum terhubung dengan Periode Pendaftaran yang valid." },
            { status: 400 }
          );
        }
      }

      await prisma.examPeriod.update({
        where: { id: periodId },
        data: { isAttendanceOpen: targetState },
      });
      const status = targetState ? "DIBUKA" : "DITUTUP";
      await logAdminAction({
        action: `ABSEN_${status}`,
        target: period.name,
        detail: { isAttendanceOpen: targetState },
      });
      return NextResponse.json({ ok: true, message: `Akses absen ${targetState ? "dibuka" : "ditutup"}.` });
    } else if (action === "delete") {
      // period already fetched with _count above
      if (period._count.attempts > 0 || period._count.attendances > 0) {
        return NextResponse.json({
          ok: false,
          message: "Periode memiliki data historis kandidat (peserta atau absensi) dan tidak dapat dihapus.",
          }, { status: 409 });
      }
      const deleted = await prisma.examPeriod.delete({
        where: { id: periodId },
      });
      await logAdminAction({
        action: "HAPUS_PERIODE",
        target: deleted.name,
        detail: {
          periodId,
          attempts: period._count.attempts,
          attendances: period._count.attendances,
        },
      });
      return NextResponse.json({ ok: true, message: `Periode \"${deleted.name}\" berhasil dihapus.` });
    } else if (action === "edit") {
      const { openedAt, closedAt, mcqCount, essayCount, passThreshold, examStartTime, examEndTime, recruitmentPeriodId } = body ?? {};
      const data: Record<string, unknown> = {};

      await prisma.$transaction(async (tx) => {
        // Read fresh period with counts and recruitmentPeriod
        const freshPeriod = await tx.examPeriod.findUnique({
          where: { id: periodId },
          include: {
            _count: { select: { attempts: true, attendances: true } },
            recruitmentPeriod: { select: { id: true, deletedAt: true } },
          },
        });
        if (!freshPeriod) {
          throw new Error('PERIOD_NOT_FOUND');
        }

        // Handle recruitmentPeriodId semantics
        if (recruitmentPeriodId !== undefined) {
          if (recruitmentPeriodId === null || recruitmentPeriodId === "") {
            // Explicit unmap
            if (freshPeriod.isActive || freshPeriod.isExamOpen || freshPeriod.isAttendanceOpen) {
              throw new Error('CANNOT_UNMAP_ACTIVE_PERIOD');
            }
            data.recruitmentPeriodId = null;
          } else if (recruitmentPeriodId === "auto") {
            const newRec = await getOrCreateRecruitmentPeriod(tx, freshPeriod.name);
            data.recruitmentPeriodId = newRec.id;
          } else {
            // String: replace mapping
            const newRecId = String(recruitmentPeriodId).trim();
            const targetRec = await tx.recruitmentPeriod.findUnique({
              where: { id: newRecId },
              select: { id: true, deletedAt: true },
            });
            if (!targetRec || targetRec.deletedAt !== null) {
              throw new Error('INVALID_NEW_RECRUITMENT_PERIOD');
            }
            // Check if mapping actually changes
            const mappingChanged = newRecId !== freshPeriod.recruitmentPeriodId;
            if (mappingChanged) {
              // Historical guard
              if (freshPeriod._count.attempts > 0 || freshPeriod._count.attendances > 0) {
                throw new Error('HISTORICAL_DATA_PREVENTS_MAPPING_CHANGE');
              }
            }
            data.recruitmentPeriodId = newRecId;
          }
        }

        // Other fields validation (same as before, but using freshPeriod for defaults? Actually we just validate input)
        if (openedAt !== undefined) {
          if (openedAt === null || openedAt === "") {
            data.openedAt = null;
          } else {
            const d = new Date(openedAt);
            if (Number.isNaN(d.getTime())) {
              throw new Error('INVALID_OPENED_AT_FORMAT');
            }
            data.openedAt = d;
          }
        }
        if (closedAt !== undefined) {
          if (closedAt === null) {
            data.closedAt = null;
          } else {
            const d = new Date(closedAt);
            if (Number.isNaN(d.getTime())) {
              throw new Error('INVALID_CLOSED_AT_FORMAT');
            }
            data.closedAt = d;
          }
        }
        if (mcqCount !== undefined && mcqCount !== null) {
          const n = Number(mcqCount);
          if (!Number.isInteger(n) || n < 1 || n > 50) {
            throw new Error('INVALID_MCQ_COUNT');
          }
          data.mcqCount = n;
        }
        if (essayCount !== undefined && essayCount !== null) {
          const n = Number(essayCount);
          if (!Number.isInteger(n) || n < 1 || n > 50) {
            throw new Error('INVALID_ESSAY_COUNT');
          }
          data.essayCount = n;
        }
        if (passThreshold !== undefined && passThreshold !== null) {
          const n = Number(passThreshold);
          if (!Number.isInteger(n) || n < 1 || n > 1000) {
            throw new Error('INVALID_PASS_THRESHOLD');
          }
          data.passThreshold = n;
        }
        if (examStartTime !== undefined) {
          if (examStartTime === null) {
            data.examStartTime = null;
          } else {
            const d = new Date(examStartTime);
            if (Number.isNaN(d.getTime())) {
              throw new Error('INVALID_EXAM_START_TIME_FORMAT');
            }
            data.examStartTime = d;
          }
        }
        if (examEndTime !== undefined) {
          if (examEndTime === null) {
            data.examEndTime = null;
          } else {
            const d = new Date(examEndTime);
            if (Number.isNaN(d.getTime())) {
              throw new Error('INVALID_EXAM_END_TIME_FORMAT');
            }
            data.examEndTime = d;
          }
        }

        // If no changes at all, we can early return? But we still need to run update? We'll let update with empty data be no-op.
        // However we want to avoid logging if no changes? We'll still call update; it's fine.
        await tx.examPeriod.update({ where: { id: periodId }, data });
        if (period.recruitmentPeriodId && data.closedAt !== undefined) {
          await tx.recruitmentPeriod.update({
            where: { id: period.recruitmentPeriodId },
            data: {
              closedAt: data.closedAt ?? new Date(Date.now() + 30 * 86400000),
            },
          });
        }
      });

      await logAdminAction({
        action: "EDIT_PERIODE",
        target: period.name,
        detail: {
          recruitmentPeriodId: data.recruitmentPeriodId ?? period.recruitmentPeriodId,
          openedAt: openedAt ?? null,
          closedAt: closedAt ?? null,
          mcqCount: mcqCount ?? null,
          essayCount: essayCount ?? null,
          passThreshold: passThreshold ?? null,
          examStartTime: examStartTime ?? null,
          examEndTime: examEndTime ?? null,
        },
      });
      return NextResponse.json({ ok: true, message: "Periode berhasil diperbarui." });
    } else {
      return NextResponse.json(
        { ok: false, message: "Action harus 'close', 'reopen', 'reset', 'delete', 'toggleAttendanceOpen', atau 'edit'.", status: 400 }
      );
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "";
    // Custom client errors from transactional checks
    if (errMsg === 'INVALID_RECRUITMENT_PERIOD') {
      return NextResponse.json({ ok: false, message: "Periode Pendaftaran tidak ditemukan atau sudah dihapus." }, { status: 400 });
    }
    if (errMsg === 'INVALID_RECRUITMENT_PERIOD_FOR_REOPEN') {
      return NextResponse.json({ ok: false, message: "Akses tidak dapat dibuka karena periode ujian belum terhubung dengan Periode Pendaftaran yang valid." }, { status: 400 });
    }
    if (errMsg === 'PERIOD_NOT_FOUND') {
      return NextResponse.json({ ok: false, message: "Periode tidak ditemukan." }, { status: 404 });
    }
    if (errMsg === 'CANNOT_UNMAP_ACTIVE_PERIOD') {
      return NextResponse.json({ ok: false, message: "Pemetaan tidak dapat dihapus pada periode yang sedang aktif." }, { status: 400 });
    }
    if (errMsg === 'INVALID_NEW_RECRUITMENT_PERIOD') {
      return NextResponse.json({ ok: false, message: "Periode Pendaftaran tidak ditemukan atau sudah dihapus." }, { status: 400 });
    }
    if (errMsg === 'HISTORICAL_DATA_PREVENTS_MAPPING_CHANGE') {
      return NextResponse.json({ ok: false, message: "Pemetaan Periode Pendaftaran tidak dapat diubah karena periode ujian ini telah memiliki data historis (attempt/absen)." }, { status: 409 });
    }
    if (errMsg === 'INVALID_OPENED_AT_FORMAT') {
      return NextResponse.json({ ok: false, message: "Format tanggal dibuka tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_CLOSED_AT_FORMAT') {
      return NextResponse.json({ ok: false, message: "Format tanggal ditutup tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_MCQ_COUNT') {
      return NextResponse.json({ ok: false, message: "Jumlah soal Pilihan Ganda tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_ESSAY_COUNT') {
      return NextResponse.json({ ok: false, message: "Jumlah soal essay tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_PASS_THRESHOLD') {
      return NextResponse.json({ ok: false, message: "Nilai KKM tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_EXAM_START_TIME_FORMAT') {
      return NextResponse.json({ ok: false, message: "Format waktu mulai ujian tidak valid." }, { status: 400 });
    }
    if (errMsg === 'INVALID_EXAM_END_TIME_FORMAT') {
      return NextResponse.json({ ok: false, message: "Format waktu tutup ujian tidak valid." }, { status: 400 });
    }
    if (isTableMissing(e)) {
      return NextResponse.json({ ok: true, periods: [], recruitmentPeriods: [] });
    }
    throw e;
  }
}