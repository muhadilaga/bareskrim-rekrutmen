import React from "react";
import { getSessionUser } from "@/lib/auth";
import { CasisShell } from "@/components/casis/CasisShell";
import { AttendanceChecker } from "@/components/attendance/AttendanceChecker";

export const metadata = {
  title: "Dashboard Casis — Absensi & Hasil Seleksi — BARESKRIM POLRI RBX",
  description:
    "Portal calon siswa Pusdik Reserse Bareskrim Polri RBX untuk absensi mandiri dan pengecekan verifikasi tahap akademik oleh instruktur.",
};
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let user: Awaited<ReturnType<typeof getSessionUser>> = null;
  try {
    user = await getSessionUser();
  } catch {
    user = null;
  }

  const displayName = user?.displayName?.trim() || user?.username || undefined;
  const username = user?.username || undefined;

  return (
    <CasisShell
      variant="dashboard"
      user={user && displayName && username ? { displayName, username } : undefined}
    >
      <AttendanceChecker />
    </CasisShell>
  );
}
