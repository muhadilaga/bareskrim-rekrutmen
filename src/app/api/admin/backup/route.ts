import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminKey } from "@/lib/constants";
import { ensureSchema } from "@/lib/init-schema";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

function jsonSafe(value: unknown) {
  return JSON.stringify(
    value,
    (_key, current) => (typeof current === "bigint" ? current.toString() : current),
    2
  );
}

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  try {
    await ensureSchema();
    const [users, attendances, attempts, results, periods, logs] = await Promise.all([
      prisma.user.findMany({ include: { attendances: true, attempts: true } }),
      prisma.attendance.findMany({ include: { period: true, user: true } }),
      prisma.examAttempt.findMany({ include: { period: true, user: true } }),
      prisma.examResult.findMany({ include: { attempt: { include: { period: true, user: true } } } }),
      prisma.examPeriod.findMany({ orderBy: { openedAt: "desc" } }),
      prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    ]);

    const backupData = {
      exportedAt: new Date().toISOString(),
      counts: {
        users: users.length,
        attendances: attendances.length,
        attempts: attempts.length,
        results: results.length,
        periods: periods.length,
        logs: logs.length,
      },
      periods,
      users,
      attendances,
      attempts,
      results,
      logs,
    };

    return new NextResponse(jsonSafe(backupData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bareskrim-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Gagal membuat backup." },
      { status: 500 }
    );
  }
}
