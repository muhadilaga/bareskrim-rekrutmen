import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomSeed } from "@/lib/utils";
import { getAdminKey } from "@/lib/constants";
import { logAdminAction } from "@/lib/audit";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const OpenPeriodSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional().default(""),
  mcqCount: z.number().int().min(1).max(50).nullable().optional(),
  essayCount: z.number().int().min(1).max(50).nullable().optional(),
  passThreshold: z.number().int().min(1).max(1000).optional().default(70),
  examStartTime: z.string().datetime().optional().nullable(),
  examEndTime: z.string().datetime().optional().nullable(),
});

// Buka periode rekrutmen baru: periode lama ditutup otomatis,
// seed baru dihasilkan -> bank soal ter-reset & teracak ulang.
export async function POST(req: Request) {
  if (!isAdmin(req)) {
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

  try {
    await prisma.$transaction([
      prisma.examPeriod.updateMany({ where: { isActive: true }, data: { isActive: false, closedAt: new Date() } }),
       prisma.examPeriod.create({
         data: {
           name: parsed.data.name,
           description: parsed.data.description,
           isActive: true,
           seed: randomSeed(),
           mcqCount: parsed.data.mcqCount ?? null,
           essayCount: parsed.data.essayCount ?? null,
           passThreshold: parsed.data.passThreshold ?? 70,
           examStartTime: parsed.data.examStartTime ? new Date(parsed.data.examStartTime) : null,
           examEndTime: parsed.data.examEndTime ? new Date(parsed.data.examEndTime) : null,
         },
       }),
    ]);
  } catch (e) {
    if (isTableMissing(e)) {
      return NextResponse.json(
        { ok: false, message: "Database belum diinisialisasi. Klik tombol Initialize Database dulu." },
        { status: 409 }
      );
    }
    throw e;
  }

  await logAdminAction({ action: "BUKA_PERIODE", target: parsed.data.name, detail: { description: parsed.data.description } });

  return NextResponse.json({ ok: true, message: "Periode baru berhasil dibuka." });
}

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  try {
    const periods = await prisma.examPeriod.findMany({
      include: {
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
    periods.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const aOpened = a.openedAt ? new Date(a.openedAt).getTime() : 0;
      const bOpened = b.openedAt ? new Date(b.openedAt).getTime() : 0;
      if (aOpened !== bOpened) return bOpened - aOpened;
      const aClosed = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const bClosed = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return bClosed - aClosed;
    });
    return NextResponse.json({ ok: true, periods });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json({ ok: true, periods: [] });
    }
    throw e;
  }
}

function isTableMissing(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021";
}

// PATCH: Tutup atau buka periode
export async function PATCH(req: Request) {
  if (!isAdmin(req)) {
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
      select: { name: true },
    });

    if (action === "close") {
      await prisma.examPeriod.update({
        where: { id: periodId },
        data: { closedAt: new Date(), isActive: false },
      });
      await logAdminAction({ action: "TUTUP_PERIODE", target: period?.name ?? periodId });
      return NextResponse.json({ ok: true, message: "Periode berhasil ditutup." });
    } else if (action === "reopen") {
      await prisma.$transaction([
        prisma.examPeriod.updateMany({
          where: { isActive: true, NOT: { id: periodId } },
          data: { isActive: false, closedAt: new Date() },
        }),
        prisma.examPeriod.update({
          where: { id: periodId },
          data: { closedAt: null, isActive: true },
        }),
      ]);
      await logAdminAction({ action: "BUKA_KEMBALI_PERIODE", target: period?.name ?? periodId });
      return NextResponse.json({ ok: true, message: "Periode berhasil dibuka kembali." });
    } else if (action === "reset") {
      // Hapus semua attempt + result + answers untuk periode ini,
      // Tapi jaga attendance (casis tetap absen).
      // Casfis dapat mengikuti ujian kembali pada periode ini.
      const deleted = await prisma.$transaction([
        prisma.examResult.deleteMany({ where: { attempt: { periodId } } }),
        prisma.examAttempt.deleteMany({ where: { periodId } }),
      ]);
      await logAdminAction({
        action: "RESET_UJIAN_PERIODE",
        target: period?.name ?? periodId,
        detail: { deletedResults: deleted[0]?.count ?? 0, deletedAttempts: deleted[1]?.count ?? 0 },
      });
      return NextResponse.json({ ok: true, message: `Reset berhasil. ${deleted[1]?.count ?? 0} attempt, ${deleted[0]?.count ?? 0} hasil dihapus.` });
    } else if (action === "toggleExamOpen") {
      const { isExamOpen } = body ?? {};
      await prisma.examPeriod.update({
        where: { id: periodId },
        data: { isExamOpen: Boolean(isExamOpen) },
      });
      const status = isExamOpen ? "DIBUKA" : "DITUTUP";
      await logAdminAction({
        action: `UJIAN_${status}`,
        target: period?.name ?? periodId,
        detail: { isExamOpen: Boolean(isExamOpen) },
      });
      return NextResponse.json({ ok: true, message: `Akses ujian ${isExamOpen ? "dibuka" : "ditutup"}.` });
    } else if (action === "toggleAttendanceOpen") {
      const { isAttendanceOpen } = body ?? {};
      await prisma.examPeriod.update({
        where: { id: periodId },
        data: { isAttendanceOpen: Boolean(isAttendanceOpen) },
      });
      const status = isAttendanceOpen ? "DIBUKA" : "DITUTUP";
      await logAdminAction({
        action: `ABSEN_${status}`,
        target: period?.name ?? periodId,
        detail: { isAttendanceOpen: Boolean(isAttendanceOpen) },
      });
      return NextResponse.json({ ok: true, message: `Akses absen ${isAttendanceOpen ? "dibuka" : "ditutup"}.` });
    } else if (action === "edit") {
      // Edit periode: tanggal (openedAt/closedAt) dan/atau konfigurasi
      // (mcqCount/essayCount/passThreshold). Semua opsional.
       const { openedAt, closedAt, mcqCount, essayCount, passThreshold, examStartTime, examEndTime } = body ?? {};
      const data: Record<string, unknown> = {};

       if (openedAt !== undefined) {
         if (openedAt === null || openedAt === "") {
           data.openedAt = null;
         } else {
           const d = new Date(openedAt);
           if (Number.isNaN(d.getTime())) {
             return NextResponse.json(
               { ok: false, message: "Format tanggal dibuka tidak valid." },
               { status: 400 }
             );
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
            return NextResponse.json(
              { ok: false, message: "Format tanggal ditutup tidak valid." },
              { status: 400 }
            );
          }
          data.closedAt = d;
        }
      }
      if (mcqCount !== undefined && mcqCount !== null) {
        const n = Number(mcqCount);
        if (!Number.isInteger(n) || n < 1 || n > 50) {
          return NextResponse.json(
            { ok: false, message: "Jumlah soal Pilihan Ganda tidak valid." },
            { status: 400 }
          );
        }
        data.mcqCount = n;
      }
      if (essayCount !== undefined && essayCount !== null) {
        const n = Number(essayCount);
        if (!Number.isInteger(n) || n < 1 || n > 50) {
          return NextResponse.json(
            { ok: false, message: "Jumlah soal essay tidak valid." },
            { status: 400 }
          );
        }
        data.essayCount = n;
      }
       if (passThreshold !== undefined && passThreshold !== null) {
         const n = Number(passThreshold);
         if (!Number.isInteger(n) || n < 1 || n > 1000) {
           return NextResponse.json(
             { ok: false, message: "Nilai KKM tidak valid." },
             { status: 400 }
           );
         }
         data.passThreshold = n;
       }
       if (examStartTime !== undefined) {
         if (examStartTime === null) {
           data.examStartTime = null;
         } else {
           const d = new Date(examStartTime);
           if (Number.isNaN(d.getTime())) {
             return NextResponse.json(
               { ok: false, message: "Format waktu mulai ujian tidak valid." },
               { status: 400 }
             );
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
             return NextResponse.json(
               { ok: false, message: "Format waktu tutup ujian tidak valid." },
               { status: 400 }
             );
           }
           data.examEndTime = d;
         }
       }

       if (Object.keys(data).length === 0) {
        return NextResponse.json(
          { ok: false, message: "Tidak ada perubahan yang dikirim." },
          { status: 400 }
        );
      }

      await prisma.examPeriod.update({ where: { id: periodId }, data });
      await logAdminAction({
        action: "EDIT_PERIODE",
        target: period?.name ?? periodId,
         detail: {
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
        { ok: false, message: "Action harus 'close', 'reopen', 'reset', 'toggleAttendanceOpen', atau 'edit'." },
        { status: 400 }
      );
    }
  } catch (e) {
    console.error("Period update error:", e);
    return NextResponse.json(
      { ok: false, message: "Gagal mengupdate periode." },
      { status: 500 }
    );
  }
}
