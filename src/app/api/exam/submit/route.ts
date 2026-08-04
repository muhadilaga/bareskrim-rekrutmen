import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { submitExam } from "@/lib/exam-service";
import { clientIp, submitLimiter } from "@/lib/rate-limit";

const SubmitSchema = z.object({
  attemptId: z.string().min(1),
  answers: z.array(z.object({ questionId: z.string().min(1), answer: z.string() })).max(50),
});

export async function POST(req: Request) {
  const limited = submitLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID",
        message: `Terlalu banyak percobaan submit. Coba lagi dalam ${limited.retryAfterSeconds} detik.`,
      },
      { status: 429 }
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED", message: "Silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

  if (user.matraBlocked) {
    return NextResponse.json(
      { ok: false, code: "INVALID", message: "Akses ujian ditolak." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID", message: "Payload tidak valid." },
      { status: 400 }
    );
  }

  const result = await submitExam(user, parsed.data);
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "ALREADY_SUBMITTED"
          ? 409
          : result.code === "EXPIRED"
            ? 410
            : result.code === "NO_ATTENDANCE"
              ? 403
              : 400;
    return NextResponse.json({ ok: false, code: result.code, message: result.message }, { status });
  }

  return NextResponse.json({ ok: true, resultId: result.resultId });
}
