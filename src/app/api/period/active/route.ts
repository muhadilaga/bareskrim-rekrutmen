import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSchema } from "@/lib/init-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSchema();
    const period = await prisma.examPeriod.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    return NextResponse.json({ ok: true, active: !!period, period });
  } catch {
    return NextResponse.json({ ok: true, active: false, period: null });
  }
}
