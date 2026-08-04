import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { startExamSession } from "@/lib/exam-service";

export async function GET() {
  const user = await getSessionUser();
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
        : result.code === "NO_ATTENDANCE" || result.code === "NO_ROLE"
          ? 403
          : 400;
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status }
    );
  }

  return NextResponse.json({
    ok: true,
    attemptId: result.attemptId,
    questions: result.questions,
    remainingSeconds: result.remainingSeconds,
    period: result.period,
  });
}
