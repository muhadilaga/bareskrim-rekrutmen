import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { ensureSchema } from "@/lib/init-schema";
import { logAdminAction } from "@/lib/audit";

type ExportKind = "attendance" | "results" | "blacklist" | "verdicts";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "tidak_ada_data\n";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

async function exportAttendance() {
  const rows = await prisma.attendance.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      period: true,
      user: true,
    },
  });

  return rows.map((row) => ({
    attendanceId: row.id,
    periodName: row.period?.name ?? "",
    tahap: row.tahap,
    status: row.status,
    robloxUsername: row.user?.username ?? "",
    robloxDisplayName: row.user?.displayName ?? "",
    discordUserId: row.discordUserId ?? "",
    createdAt: row.createdAt.toISOString(),
  }));
}

async function exportResults() {
  const rows = await prisma.examResult.findMany({
    orderBy: { submittedAt: "desc" },
    include: {
      attempt: {
        include: {
          period: true,
          user: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    resultId: row.id,
    periodName: row.attempt?.period?.name ?? "",
    robloxUsername: row.attempt?.user?.username ?? "",
    robloxDisplayName: row.attempt?.user?.displayName ?? "",
    score: row.score,
    maxScore: row.maxScore,
    mcqScore: row.mcqScore,
    essayScore: row.essayScore,
    passed: row.passed ? "YA" : "TIDAK",
    submittedAt: row.submittedAt.toISOString(),
    discordMessageId: row.discordMessageId ?? "",
  }));
}

async function exportBlacklist() {
  const rows = await prisma.blacklistEntry.findMany({
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    blacklistId: row.id,
    username: row.username,
    category: row.category,
    reason: row.reason ?? "",
    createdAt: row.createdAt.toISOString(),
  }));
}

async function exportVerdicts() {
  const rows = await prisma.verdictEntry.findMany({
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    verdictId: row.id,
    username: row.username,
    status: row.status,
    note: row.note ?? "",
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : "",
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function GET(
  req: Request,
  context: { params: Promise<{ kind: ExportKind }> }
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  try {
    await ensureSchema();
    const { kind } = await context.params;
    const today = new Date().toISOString().slice(0, 10);

    let rows: Array<Record<string, unknown>> = [];
    if (kind === "attendance") rows = await exportAttendance();
    else if (kind === "results") rows = await exportResults();
    else if (kind === "blacklist") rows = await exportBlacklist();
    else if (kind === "verdicts") rows = await exportVerdicts();
    else {
      return NextResponse.json({ ok: false, message: "Jenis export tidak dikenal." }, { status: 404 });
    }

    await logAdminAction({
      action: "EXPORT_CSV",
      target: kind,
      detail: { rows: rows.length },
    });

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bareskrim-${kind}-${today}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Gagal export CSV." },
      { status: 500 }
    );
  }
}
