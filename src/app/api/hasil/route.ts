import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureSchema } from "@/lib/init-schema";
import { getLatestResult } from "@/lib/exam-service";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

const hasilLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

const HasilSchema = z.object({
  username: z.string().trim().min(2).max(40),
});

// Cek hasil ujian berdasarkan username (tanpa sesi login).
export async function POST(req: Request) {
  const limited = hasilLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: `Terlalu banyak permintaan. Coba lagi dalam ${limited.retryAfterSeconds} detik.`,
      },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = HasilSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Username tidak valid." }, { status: 400 });
  }

  try {
    await ensureSchema();
    const user = await prisma.user.findFirst({
      where: { username: { equals: parsed.data.username, mode: "insensitive" } },
    });

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          code: "USER_NOT_FOUND",
          message:
            "User tidak ditemukan. Pastikan username Roblox benar dan sudah pernah mengikuti ujian.",
        },
        { status: 404 }
      );
    }

    const result = await getLatestResult(user.id);
    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          code: "NO_RESULT",
          message: "Belum ada hasil ujian untuk username ini.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      result: {
        id: result.id,
        score: result.score,
        maxScore: result.maxScore,
        mcqScore: result.mcqScore,
        essayScore: result.essayScore,
        status: result.status,
        passed: result.passed,
        kkm: result.attempt.period.passThreshold ?? 75,
        submittedAt: result.submittedAt.toISOString(),
        answersJson: [] as never,
        attempt: {
          id: result.attemptId,
          user: {
            username: result.attempt.user.username,
            displayName: result.attempt.user.displayName,
            robloxId: Number(result.attempt.user.robloxId),
            avatarUrl: result.attempt.user.avatarUrl,
            policeGroupRank: result.attempt.user.policeGroupRank,
          },
          period: { name: result.attempt.period.name },
        },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json(
        {
          ok: false,
          code: "DB_NOT_READY",
          message: "Database belum diinisialisasi. Hubungi instruktur.",
        },
        { status: 409 }
      );
    }
    console.error("hasil error", e);
    return NextResponse.json(
      { ok: false, message: "Terjadi kesalahan server. Coba lagi." },
      { status: 500 }
    );
  }
}
