import { NextResponse } from "next/server";
import { getSessionUser, signCasisPortalSession, attachCasisSessionCookie } from "@/lib/auth";
import { startExamSession, generateCandidateExamPin } from "@/lib/exam-service";
import { logStudentAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { examPinLimiter } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED", message: "Silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

  if (user.matraBlocked) {
    return NextResponse.json(
      {
        ok: false,
        code: "ALREADY_SUBMITTED",
        message:
          "Mohon maaf, Anda tidak dapat mengakses soal ujian rekrutmen Bareskrim Polri karena terdaftar sebagai anggota matra lain (AD/AL).",
      },
      { status: 403 }
    );
  }

  const result = await startExamSession(user);
  if (!result.ok) {
    const status =
      result.code === "ALREADY_SUBMITTED"
        ? 409
        : result.code === "NO_ATTENDANCE" || result.code === "NO_ROLE" || result.code === "NOT_ELIGIBLE"
          ? 403
          : result.code === "GUARD_UNAVAILABLE"
            ? 503
            : 400;
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status }
    );
  }

   // Catat aksi siswa (best-effort)
   void logStudentAction({
     userId: user.id,
     action: "EXAM_START",
     attemptId: result.attemptId,
     detail: { periodName: result.period.name },
   });

   return NextResponse.json({
     ok: true,
     attemptId: result.attemptId,
     questions: result.questions,
     remainingSeconds: result.remainingSeconds,
     period: result.period,
   });
   }

   /**
   * Autentikasi Ruang Ujian Casis menggunakan PIN 6 Digit (Tahap Akademik).
   * Memverifikasi username Roblox + PIN, mengecek status roleEligible di Attendance.
   */
   export async function POST(req: Request) {
   try {
     const body = await req.json().catch(() => ({}));
     const username = typeof body.username === "string" ? body.username.trim() : "";
     const pin = typeof body.pin === "string" ? body.pin.trim() : "";

     if (!username || !pin) {
       return NextResponse.json(
         { ok: false, message: "Username Roblox dan PIN Ujian wajib diisi." },
         { status: 400 }
       );
     }

     const pinLimiterKey = `pin:${username.toLowerCase()}`;
     const limited = examPinLimiter.check(pinLimiterKey);
     if (!limited.ok) {
       return NextResponse.json(
         { ok: false, message: "Terlalu banyak percobaan PIN. Silakan tunggu 1 menit." },
         { status: 429 }
       );
     }

     const activePeriod = await prisma.examPeriod.findFirst({
       where: { isActive: true, deletedAt: null },
       select: { id: true, name: true, isExamOpen: true },
     });

     if (!activePeriod) {
       return NextResponse.json(
         { ok: false, message: "Tidak ada periode seleksi ujian yang sedang aktif saat ini." },
         { status: 404 }
       );
     }

     if (!activePeriod.isExamOpen) {
       return NextResponse.json(
         { ok: false, message: "Sesi ujian pada periode ini belum dibuka oleh panitia seleksi." },
         { status: 403 }
       );
     }

     const expectedPin = generateCandidateExamPin(username, activePeriod.id);
     if (pin !== expectedPin) {
       return NextResponse.json(
         { ok: false, message: "PIN Ujian salah atau tidak sesuai dengan akun Roblox Anda." },
         { status: 401 }
       );
     }

     const user = await prisma.user.findFirst({
       where: {
         username: { equals: username, mode: "insensitive" },
       },
     });

     if (!user) {
       return NextResponse.json(
         { ok: false, message: "Data Casis tidak ditemukan. Pastikan Anda telah mengisi absensi." },
         { status: 404 }
       );
     }

     if (user.matraBlocked) {
       return NextResponse.json(
         {
           ok: false,
           message: "Mohon maaf, Anda tidak dapat mengakses ujian karena terdaftar sebagai anggota matra lain (AD/AL).",
         },
         { status: 403 }
       );
     }

     const attendance = await prisma.attendance.findFirst({
       where: {
         userId: user.id,
         periodId: activePeriod.id,
         deletedAt: null,
       },
     });

     if (!attendance || !attendance.roleEligible) {
       return NextResponse.json(
         {
           ok: false,
           message: "Anda belum berhak mengikuti ujian. Pastikan absensi dan evaluasi motivasi Anda telah disetujui instruktur.",
         },
         { status: 403 }
       );
     }

     const token = await signCasisPortalSession({
       userId: user.id,
       robloxId: user.robloxId ? Number(user.robloxId) : undefined,
     });

     const response = NextResponse.json({
       ok: true,
       message: "Verifikasi PIN berhasil. Selamat datang di ruang ujian.",
       user: {
         id: user.id,
         username: user.username,
         displayName: user.displayName,
       },
     });

     attachCasisSessionCookie(response, token);

     void logStudentAction({
       userId: user.id,
       action: "PIN_VERIFIED",
       detail: { periodId: activePeriod.id, username: user.username },
     });

     return response;
   } catch (error) {
     console.error("Exam PIN auth error:", error);
     return NextResponse.json(
       { ok: false, message: "Terjadi kesalahan sistem saat memproses verifikasi PIN." },
       { status: 500 }
     );
   }
   }
