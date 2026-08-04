import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/audit";

// DELETE: Hapus satu absensi beserta attempt/ujian terkait berdasarkan id
export async function DELETE(req: Request) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== getAdminKey()) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, message: "id wajib diisi" }, { status: 400 });
    }

    // Ambil data absensi untuk tahu userId + periodId
    const attendance = await prisma.attendance.findUnique({
      where: { id },
      select: { id: true, userId: true, periodId: true, discordUserId: true },
    });

    if (!attendance) {
      return NextResponse.json({ ok: false, message: "Absensi tidak ditemukan." }, { status: 404 });
    }

    // 1. Hapus attempt + jawaban + hasil ujian untuk user di periode ini
    if (attendance.userId) {
      const attempts = await prisma.examAttempt.findMany({
        where: { userId: attendance.userId, periodId: attendance.periodId },
        select: { id: true },
      });
      const attemptIds = attempts.map((a) => a.id);

      if (attemptIds.length > 0) {
        await prisma.examAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
        await prisma.examResult.deleteMany({ where: { attemptId: { in: attemptIds } } });
      }
      await prisma.examAttempt.deleteMany({
        where: { userId: attendance.userId, periodId: attendance.periodId },
      });
    }

    // 2. Hapus absensi ini
    await prisma.attendance.delete({ where: { id } });

    // 3. Hapus absensi orphan lain dengan discordUserId yang sama di periode ini
    if (attendance.discordUserId) {
      await prisma.attendance.deleteMany({
        where: {
          periodId: attendance.periodId,
          discordUserId: attendance.discordUserId,
          userId: null,
        },
      });
    }

    await logAdminAction({
      action: "HAPUS_ABSENSI",
      target: attendance.discordUserId ?? attendance.userId ?? attendance.id,
      detail: { periodId: attendance.periodId },
    });

    return NextResponse.json({
      ok: true,
      message: "Absensi beserta ujian terkait berhasil dihapus.",
    });
  } catch (error) {
    console.error("Admin delete attendance error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal menghapus absensi." },
      { status: 500 }
    );
  }
}
