import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSchema } from "@/lib/init-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const period = await prisma.examPeriod.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, isAttendanceOpen: true, isExamOpen: true, openedAt: true, closedAt: true },
    });
    if (!period) {
      return NextResponse.json({ ok: true, active: false, period: null });
    }
    const now = new Date();
    // Otomatis hitung isAttendanceOpen berdasarkan tanggal
    const attendanceOpen = period.isAttendanceOpen
      && (!period.openedAt || now >= period.openedAt)
      && (!period.closedAt || now <= period.closedAt);
    return NextResponse.json({
      ok: true,
      active: true,
      period: {
        id: period.id,
        name: period.name,
        isAttendanceOpen: attendanceOpen,
        isExamOpen: period.isExamOpen,
      },
    });
  } catch {
    return NextResponse.json({ ok: true, active: false, period: null });
  }
}
