// ============================================================
// Audit Log Admin - mencatat aksi instruktur di panel admin.
// Menggunakan raw SQL agar tidak bergantung pada regenerasi
// prisma client; bila tabel belum ada, aksi tetap diteruskan.
// ============================================================

import { prisma } from "@/lib/prisma";

export interface AdminLogInput {
  action: string;
  target?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function logAdminAction(input: AdminLogInput): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AdminLog" ("id", "action", "target", "detail", "createdAt")
       VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)`,
      // id: buat id sederhana (cuid tidak tersedia di SQL)
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      input.action,
      input.target ?? null,
      JSON.stringify(input.detail ?? {})
    );
  } catch (e) {
    console.error("logAdminAction error (non-fatal):", e);
  }
}

export async function listAdminLogs(limit = 50) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT "id", "action", "target", "detail", "createdAt"
        FROM "AdminLog"
        ORDER BY "createdAt" DESC
        LIMIT ${Math.max(1, Math.min(500, limit))}`
    );
    return rows;
  } catch (e) {
    console.error("listAdminLogs error:", e);
    return [];
  }
}

// Hapus seluruh log audit (bulk delete)
export async function clearAdminLogs(): Promise<{ count: number }> {
  try {
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM "AdminLog"`
    );
    // $executeRawUnsafe returns bigint on PostgreSQL for DELETE
    return { count: Number(result ?? 0) };
  } catch (e) {
    console.error("clearAdminLogs error:", e);
    return { count: 0 };
  }
}

// Audit Log Siswa - mencatat aksi siswa (absen, mulai ujian, submit)
export interface StudentLogInput {
  userId: string;
  action: string;
  periodId?: string | null;
  attemptId?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function logStudentAction(input: StudentLogInput): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "StudentActionLog" ("id", "userId", "action", "periodId", "attemptId", "detail", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, CURRENT_TIMESTAMP)`,
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      input.userId,
      input.action,
      input.periodId ?? null,
      input.attemptId ?? null,
      JSON.stringify(input.detail ?? {})
    );
  } catch (e) {
    console.error("logStudentAction error (non-fatal):", e);
  }
}
