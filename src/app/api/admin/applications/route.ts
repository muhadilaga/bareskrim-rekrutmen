import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
// TASK 03L.2E.4.1D — import yang benar: assertVerifiedAdmin HANYA ada di
// @/lib/admin-auth (bukan @/lib/auth). Versi sebelumnya mengimpor dari
// @/lib/auth sehingga resolver bernilai undefined dan route 500.
import { assertVerifiedAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/audit";

const adminApplicationStatusSchema = z.object({
  applicationId: z.string().min(1),
  status: z.enum(["DITERIMA", "DITOLAK"]),
});

export async function GET(req: Request) {
  // assertVerifiedAdmin adalah async — WAJIB di-await. Tanpa await, Promise
  // selalu truthy sehingga pengecekan 401 tidak pernah terpicu (auth bypass).
  if (!(await assertVerifiedAdmin(req))) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const applications = await prisma.application.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        registrationId: true,
        status: true,
        fullName: true,
        robloxUsername: true,
        userId: true,
        createdAt: true,
        deletedAt: true,
        recruitmentPeriod: {
          select: {
            code: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      applications,
    });
  } catch (error) {
    console.error("Admin applications GET error:", error);
    try {
      const basicApplications = await prisma.application.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          registrationId: true,
          status: true,
          fullName: true,
          robloxUsername: true,
          userId: true,
          createdAt: true,
          deletedAt: true,
        },
      });
      return NextResponse.json({ ok: true, applications: basicApplications });
    } catch {
      return NextResponse.json({ ok: true, applications: [] });
    }
  }
}

export async function POST(req: Request) {
  if (!(await assertVerifiedAdmin(req))) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = adminApplicationStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        ok: false,
        message: parsed.error.errors[0].message,
      }, { status: 400 });
    }

    const { applicationId, status } = parsed.data;

    // Verify application exists and is in valid state
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        recruitmentPeriodId: true,
        deletedAt: true,
        user: {
          select: { deletedAt: true },
        },
      },
    });

    if (!application) {
      return NextResponse.json({
        ok: false,
        message: "Application not found",
      }, { status: 404 });
    }

    if (application.deletedAt !== null) {
      return NextResponse.json({
        ok: false,
        message: "Application has been soft-deleted",
      }, { status: 400 });
    }

    // Idempotent same-state: status yang sama TIDAK ditolak — dikembalikan
    // sukses tanpa write agar retry aman (task 03L.2E.4.1D).
    if (application.status === status) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        message: `Status sudah ${status}. Tidak ada perubahan.`,
      });
    }

    // Determine allowed transitions
    const currentStatus = application.status;
    let allowed = false;

    if (currentStatus === "MENUNGGU_VERIFIKASI") {
      allowed = ["DITERIMA", "DITOLAK"].includes(status);
    } else if (currentStatus === "DITERIMA") {
      allowed = status === "DITOLAK";
    } else if (currentStatus === "DITOLAK") {
      allowed = status === "DITERIMA";
    } else {
      allowed = false;
    }

    if (!allowed) {
      return NextResponse.json({
        ok: false,
        message: `Tidak dapat mengubah status dari ${currentStatus} ke ${status}`,
      }, { status: 403 });
    }

    // Conditional update di dalam transaksi: where menyertakan status lama
    // sehingga update HANYA menangkap row yang belum berubah sejak read.
    // Jika count === 0, race terjadi — re-read untuk menentukan penyebabnya.
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.application.updateMany({
        where: {
          id: applicationId,
          status: currentStatus,
          deletedAt: null,
        },
        // HANYA status yang ditulis. userId/verifiedAt/field historis lain
        // tidak pernah disentuh (Student Claim tetap jalur terpisah).
        data: { status },
      });

      if (updated.count > 0) {
        return { ok: true as const, from: currentStatus };
      }

      // Race: row berubah/dihapus antara findUnique dan updateMany.
      const rechecked = await tx.application.findUnique({
        where: { id: applicationId },
        select: { status: true, deletedAt: true },
      });

      if (!rechecked) {
        return { ok: false as const, reason: "not_found" as const };
      }
      if (rechecked.deletedAt !== null) {
        return { ok: false as const, reason: "soft_deleted" as const };
      }
      return { ok: false as const, reason: "conflict" as const, current: rechecked.status };
    });

    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json({
          ok: false,
          message: "Application not found",
        }, { status: 404 });
      }
      if (result.reason === "soft_deleted") {
        return NextResponse.json({
          ok: false,
          message: "Application has been soft-deleted",
        }, { status: 400 });
      }
      return NextResponse.json({
        ok: false,
        message: `Status berubah bersamaan. Status saat ini: ${result.current}. Silakan coba lagi.`,
      }, { status: 409 });
    }

    logAdminAction({
      action: "UPDATE_APPLICATION_STATUS",
      target: applicationId,
      detail: { from: result.from, to: status },
    });

    return NextResponse.json({
      ok: true,
      message: `Status berubah menjadi ${status}`,
    });
  } catch (error) {
    console.error("Admin application status update error:", error);
    return NextResponse.json({
      ok: false,
      message: "Gagal mengubah status",
    }, { status: 500 });
  }
}
