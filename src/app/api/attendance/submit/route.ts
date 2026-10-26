import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONFIG } from "@/lib/constants";
import { logStudentAction } from "@/lib/audit";
import { clientIp, createRateLimiter, userSubmitLimiter } from "@/lib/rate-limit";
import { SESSION_COOKIE, getSessionUser, signCasisPortalSession } from "@/lib/auth";
import { assignDiscordRoleAndNickname } from "@/lib/discord-api";
import {
  requireCurrentCandidateEligibility,
  assertEligibilityStillValid,
  type CandidateEligibilityContext,
} from "@/lib/candidate-guard";
import { candidateGuardErrorResponse } from "@/lib/guard-response";
import {
  isExpectedUniqueViolation,
  type ExpectedUniqueConstraint,
} from "@/lib/prisma-unique";
import { evaluateMotivation, verifyCandidateWhitelist } from "@/lib/attendance-eval";
import { getRobloxUserSummary } from "@/lib/roblox";
import { ensureCandidateApplication } from "@/lib/application-service";

// TASK 03L.2E.4.6 — Satu-satunya unique constraint pada Attendance yang relevan
// untuk race absensi (prisma/migrations/.../init_v2_baseline/migration.sql:
// CREATE UNIQUE INDEX "Attendance_userId_periodId_tahap_key"). P2002 dengan
// target lain TIDAK boleh dianggap sebagai "sudah absen".
const ATTENDANCE_UNIQUE_CONFLICTS: readonly ExpectedUniqueConstraint[] = [
  {
    fields: ["userId", "periodId", "tahap"],
    indexNames: ["Attendance_userId_periodId_tahap_key"],
  },
];

const ipLimiter = createRateLimiter({ windowMs: 60_000, max: 3 });

export async function POST(req: Request) {
  const limited = ipLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, message: "Terlalu banyak percobaan. Coba lagi nanti." },
      { status: 429 }
    );
  }

  try {
    const sessionUser = await getSessionUser(req);
    const body = await req.json().catch(() => ({}));

    const robloxUsernameInput =
      typeof body.robloxUsername === "string" ? body.robloxUsername.trim() : null;
    const discordUserId =
      typeof body.discordUsername === "string"
        ? body.discordUsername.trim()
        : typeof body.discordUserId === "string"
        ? body.discordUserId.trim()
        : null;
    const motivationInput =
      typeof body.motivation === "string" ? body.motivation.trim() : "";

    // Jika tidak ada sesi valid DAN tidak ada input username roblox untuk alur portal casis -> 401
    if (!sessionUser && !robloxUsernameInput) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    if (!discordUserId) {
      return NextResponse.json(
        { ok: false, message: "Username Discord wajib diisi" },
        { status: 400 }
      );
    }

    let user = sessionUser;
    let period: { id: string; isAttendanceOpen: boolean; isExamOpen?: boolean; name?: string; recruitmentPeriodId?: string | null };
    let ctx: CandidateEligibilityContext | null = null;

    if (user) {
      const userLimited = userSubmitLimiter.check(user.id);
      if (!userLimited.ok) {
        return NextResponse.json(
          { ok: false, message: `Terlalu banyak percobaan. Coba lagi dalam ${userLimited.retryAfterSeconds} detik.` },
          { status: 429 }
        );
      }

      // Jalankan Candidate Guard untuk session user
      try {
        ctx = await requireCurrentCandidateEligibility(prisma, user);
      } catch (err) {
        const guardResponse = candidateGuardErrorResponse(err);
        if (guardResponse) return guardResponse;
        throw err;
      }

      period = ctx.examPeriod;
    } else {
      // Alur portal publik absensi casis dengan username Roblox
      const whitelistCheck = await verifyCandidateWhitelist(robloxUsernameInput!);
      if (!whitelistCheck.allowed) {
        return NextResponse.json(
          { ok: false, message: whitelistCheck.blockReason || "Akses tidak diizinkan." },
          { status: 403 }
        );
      }

      // Dapatkan atau buat entitas user
      if (whitelistCheck.user) {
        const candidateUser = whitelistCheck.user;
        if (discordUserId && candidateUser.discordUsername !== discordUserId) {
          user = await prisma.user.update({
            where: { id: candidateUser.id },
            data: { discordUsername: discordUserId },
          });
        } else {
          user = candidateUser;
        }
      } else if (whitelistCheck.application) {
        const app = whitelistCheck.application;
        // Cek jika user sudah ada dengan username sama
        const existingDbUser = await prisma.user.findFirst({
          where: {
            username: { equals: app.robloxUsername, mode: "insensitive" },
          },
        });

        if (existingDbUser) {
          user = await prisma.user.update({
            where: { id: existingDbUser.id },
            data: {
              ...(discordUserId ? { discordUsername: discordUserId } : {}),
            },
          });
          await prisma.application.update({
            where: { id: app.id },
            data: { userId: user.id },
          }).catch(() => null);
        } else {
          let robloxId = 0;
          let avatarUrl: string | null = null;
          let policeGroupRank = "CASIS";
          try {
            const summary = await getRobloxUserSummary(app.robloxUsername);
            if (summary) {
              robloxId = summary.id;
              avatarUrl = summary.avatarUrl;
              if (summary.policeGroupRank) policeGroupRank = summary.policeGroupRank;
            }
          } catch {}

          const finalRobloxId = robloxId > 0 ? BigInt(robloxId) : BigInt(-Date.now());
          user = await prisma.user.create({
            data: {
              username: app.robloxUsername,
              displayName: app.fullName || app.robloxUsername,
              discordUsername: discordUserId,
              robloxId: finalRobloxId,
              avatarUrl,
              policeGroupRank,
            },
          });
          await prisma.application.update({
            where: { id: app.id },
            data: { userId: user.id },
          }).catch(() => null);
        }
      } else {
        // Casis baru (auto-register saat absensi)
        let robloxId = 0;
        let avatarUrl: string | null = null;
        let policeGroupRank = "CASIS";
        let displayName = robloxUsernameInput;
        try {
          const summary = await getRobloxUserSummary(robloxUsernameInput);
          if (summary) {
            robloxId = summary.id;
            avatarUrl = summary.avatarUrl;
            if (summary.displayName) displayName = summary.displayName;
            if (summary.policeGroupRank) policeGroupRank = summary.policeGroupRank;
          }
        } catch {}

        const finalRobloxId = robloxId > 0 ? BigInt(robloxId) : BigInt(-Date.now());
        user = await prisma.user.create({
          data: {
            username: robloxUsernameInput,
            displayName,
            discordUsername: discordUserId ? discordUserId.trim() : null,
            robloxId: finalRobloxId,
            avatarUrl,
            policeGroupRank,
          },
        });
      }

      if (user) {
        try {
          const summary = await getRobloxUserSummary(user.username);
          if (summary) {
            const updated = await prisma.user.update({
              where: { id: user.id },
              data: {
                ...(summary.avatarUrl ? { avatarUrl: summary.avatarUrl } : {}),
                ...(summary.policeGroupRank ? { policeGroupRank: summary.policeGroupRank } : {}),
                ...(summary.displayName ? { displayName: summary.displayName } : {}),
                ...(user.robloxId ? {} : { robloxId: BigInt(summary.id) }),
              },
            });
            user = updated;
          }
        } catch {}
      }

      if (!user) {
        return NextResponse.json(
          { ok: false, message: "Gagal memproses data calon siswa." },
          { status: 500 }
        );
      }

      // Ambil periode seleksi aktif
      const activePeriod = await prisma.examPeriod.findFirst({
        where: { isActive: true, deletedAt: null },
        select: {
          id: true,
          name: true,
          isActive: true,
          isAttendanceOpen: true,
          isExamOpen: true,
          examStartTime: true,
          examEndTime: true,
        },
      });
      if (!activePeriod) {
        return NextResponse.json(
          { ok: false, message: "Tidak ada periode seleksi yang sedang aktif." },
          { status: 400 }
        );
      }
      period = activePeriod;
    }

    // Auto-link/ensure candidate application untuk periode ini bila belum melalui candidate guard (alur publik)
    if (!ctx && user && period.recruitmentPeriodId) {
      await ensureCandidateApplication(prisma, user, period.recruitmentPeriodId).catch(() => null);
    }

    if (!period.isAttendanceOpen) {
      return NextResponse.json(
        { ok: false, message: "Absen belum dibuka" },
        { status: 403 }
      );
    }

    // Guard blacklist & verdict tetap dieksekusi untuk keamanan trust boundary
    const [blacklist, verdict] = await Promise.all([
      prisma.blacklistEntry.findFirst({
        where: {
          username: { equals: user.username, mode: "insensitive" },
          category: { in: ["POLRI", "PENDIDIKAN"] },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.verdictEntry.findFirst({
        where: {
          username: { equals: user.username, mode: "insensitive" },
          status: "TIDAK_LULUS",
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (blacklist) {
      const label = blacklist.category === "PENDIDIKAN" ? "blacklist pendidikan" : "blacklist Polri";
      return NextResponse.json(
        { ok: false, message: `Akses ditolak: nama Anda terdaftar dalam ${label}.` },
        { status: 403 }
      );
    }
    if (verdict) {
      return NextResponse.json(
        { ok: false, message: "Akses ditolak: putusan sidang Anda berstatus TIDAK LULUS." },
        { status: 403 }
      );
    }

    // Evaluasi motivasi casis
    const evalResult = motivationInput
      ? evaluateMotivation(motivationInput)
      : {
          status: "REVIEW" as const,
          roleEligible: false,
          reason: "Motivasi belum diisi. Silakan isi motivasi untuk mendapatkan Tahap Akademik.",
        };

    const existing = await prisma.attendance.findUnique({
      where: {
        userId_periodId_tahap: {
          userId: user.id,
          periodId: period.id,
          tahap: "AKADEMIK",
        },
      },
    });

    // Jika absensi sudah ada:
    // Jika casis mengirimkan revisi motivasi, perbarui motivasi tanpa duplikasi
    if (existing) {
      if (motivationInput && existing.motivation !== motivationInput) {
        const updatedAttendance = await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            discordUserId: discordUserId.trim(),
            motivation: motivationInput,
            motivationStatus: evalResult.status,
            roleEligible: evalResult.roleEligible,
            motivationReason: evalResult.reason,
            motivationAttemptCount: { increment: 1 },
          },
        });

        await logStudentAction({
          userId: user.id,
          action: "ATTENDANCE_REVISION",
          periodId: period.id,
          detail: { discordUserId: discordUserId.trim(), motivationStatus: evalResult.status },
        });

        let token: string | null = null;
        try {
          if (typeof signCasisPortalSession === "function") {
            token = await signCasisPortalSession({
              userId: user.id,
              robloxId: Number(user.robloxId || 0),
            });
          }
        } catch {
          // Abaikan bila mock test tidak menyediakan signCasisPortalSession
        }

        const response = NextResponse.json({
          ok: true,
          message: evalResult.roleEligible
            ? "Revisi motivasi berhasil! Motivasi Anda disetujui dan status Tahap Akademik telah aktif. Silakan menunggu jadwal ujian."
            : "Revisi motivasi tercatat. Motivasi dinilai masih kurang oleh sistem dan dialihkan untuk peninjauan lebih lanjut oleh instruktur di Admin Panel.",
          roleEligible: evalResult.roleEligible,
          motivationStatus: evalResult.status,
          motivationReason: evalResult.reason,
          attendance: {
            id: updatedAttendance.id,
            status: updatedAttendance.status,
            motivation: updatedAttendance.motivation,
            motivationStatus: updatedAttendance.motivationStatus,
            roleEligible: updatedAttendance.roleEligible,
            createdAt: updatedAttendance.createdAt.toISOString(),
          },
        });

        if (token && response.cookies) {
          response.cookies.set(SESSION_COOKIE, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24,
          });
        }

        return response;
      }

      return NextResponse.json(
        { ok: false, message: "Anda sudah melakukan absensi" },
        { status: 409 }
      );
    }

    // Jika ada context candidate guard, verifikasi ulang sebelum write
    if (ctx) {
      try {
        await assertEligibilityStillValid(prisma, ctx);
      } catch (err) {
        const guardResponse = candidateGuardErrorResponse(err);
        if (guardResponse) return guardResponse;
        throw err;
      }
    }

    let attendance;
    try {
      attendance = await prisma.attendance.create({
        data: {
          userId: user.id,
          periodId: period.id,
          tahap: "AKADEMIK",
          status: "HADIR",
          discordUserId: discordUserId.trim(),
          motivation: motivationInput || null,
          motivationStatus: evalResult.status,
          roleEligible: evalResult.roleEligible,
          motivationReason: evalResult.reason,
          motivationAttemptCount: 1,
        },
      });
    } catch (err) {
      if (isExpectedUniqueViolation(err, ATTENDANCE_UNIQUE_CONFLICTS)) {
        return NextResponse.json(
          { ok: false, message: "Anda sudah melakukan absensi" },
          { status: 409 }
        );
      }
      throw err;
    }

    let roleAssigned = false;
    let roleError: string | null = null;

    if (CONFIG.discordBotToken && CONFIG.discordGuildId) {
      if (evalResult.roleEligible) {
        const result = await assignDiscordRoleAndNickname(
          discordUserId.trim(),
          "Tahap Akademik",
          `[CASIS] ${user.username}`
        );
        roleAssigned = result.ok;
        roleError = result.ok
          ? result.nicknameOk
            ? null
            : `Role berhasil, tapi nickname gagal diubah: ${result.nicknameMessage}`
          : result.message;
      } else {
        roleError = "Motivasi dinilai kurang oleh sistem dan dalam peninjauan instruktur. Role Tahap Akademik akan diberikan setelah disetujui di Admin Panel.";
      }
    } else {
      roleError = "DISCORD_BOT_TOKEN / DISCORD_GUILD_ID belum dikonfigurasi.";
    }

    await logStudentAction({
      userId: user.id,
      action: "ATTENDANCE",
      periodId: period.id,
      detail: { discordUserId: discordUserId.trim(), motivationStatus: evalResult.status },
    });

    const successMessage = evalResult.roleEligible
      ? "Absensi berhasil! Motivasi Anda disetujui dan status Tahap Akademik telah aktif. Silakan menunggu jadwal ujian yang disepakati bersama instruktur atau personel Pusdik."
      : "Absensi berhasil dicatat! Motivasi Anda dinilai kurang oleh sistem, sehingga otomatis dialihkan untuk ditinjau lebih lanjut oleh instruktur di Admin Panel.";

    let token: string | null = null;
    try {
      if (typeof signCasisPortalSession === "function") {
        token = await signCasisPortalSession({
          userId: user.id,
          robloxId: Number(user.robloxId || 0),
        });
      }
    } catch {
      // Abaikan bila mock test tidak menyediakan signCasisPortalSession
    }

    const response = NextResponse.json({
      ok: true,
      message: successMessage,
      roleAssigned,
      roleError,
      roleEligible: evalResult.roleEligible,
      motivationStatus: evalResult.status,
      motivationReason: evalResult.reason,
      attendance: {
        id: attendance.id,
        status: attendance.status,
        motivation: attendance.motivation,
        motivationStatus: attendance.motivationStatus,
        roleEligible: attendance.roleEligible,
        createdAt: attendance.createdAt.toISOString(),
      },
      user: {
        id: user.id,
        username: user.username,
        discordUsername: user.discordUsername,
      },
    });

    if (token && response.cookies) {
      response.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    return response;
  } catch (error) {
    console.error("Attendance submit error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal menyimpan absensi" },
      { status: 500 }
    );
  }
}
