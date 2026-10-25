import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, publicLimiter } from "@/lib/rate-limit";
import {
  applicationSubmitSchema,
  generateRegistrationId,
  generateRawAccessToken,
  hashAccessToken,
  isPrismaUniqueError,
} from "@/lib/application-service";

// Batas ukuran body permintaan (anti-abuse): 10 KB
const MAX_BODY_BYTES = 10_000;

// CSRF/Origin guard: jika Origin dikirim, harus sama dengan Host.
// Mekanisme ini kompatibel dengan endpoint publik non-authenticated
// (endpoint login existing tidak memakai CSRF token, jadi disamakan).
function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser client / same-origin GET-POST tanpa Origin
  const host = req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    // 1. Rate Limiting (in-memory; untuk production multi-instance
    //    diperlukan distributed rate limiter — lihat docs/v2/10)
    const ip = clientIp(req);
    const limit = publicLimiter.check(ip);
    if (!limit.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Terlalu banyak permintaan pendaftaran. Silakan coba lagi beberapa saat.",
        },
        { status: 429 }
      );
    }

    // 2. Origin/CSRF guard
    if (!isOriginAllowed(req)) {
      return NextResponse.json(
        { success: false, error: "Asal permintaan tidak valid." },
        { status: 403 }
      );
    }

    // 3. Validasi ukuran body (sebelum parse JSON)
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: "Data pendaftaran terlalu besar." },
        { status: 413 }
      );
    }

    let body: unknown = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      // fallthrough: ditangani sebagai body tidak valid
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Body permintaan tidak valid" },
        { status: 400 }
      );
    }

    // 4. Validasi Zod server-side (panjang maks, tanggal lahir, dll.)
    const parseResult = applicationSubmitSchema.safeParse(body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        { success: false, error: issue ? issue.message : "Data pendaftaran tidak valid" },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // 5. Database guard (dev tanpa DB → 503; production gagal-closed
    //    di src/lib/prisma.ts, bukan di sini)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("placeholder")) {
      return NextResponse.json(
        {
          success: false,
          error: "Database development belum tersedia. Pendaftaran server-side belum dapat menyimpan data.",
        },
        { status: 503 }
      );
    }

    // 6. Gerbang periode pendaftaran: hanya periode aktif & terbuka
    const now = new Date();
    const period = await prisma.recruitmentPeriod.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        openedAt: { lte: now },
        closedAt: { gte: now },
      },
      select: { id: true, code: true },
    });

    if (!period) {
      return NextResponse.json(
        { success: false, error: "Pendaftaran tidak sedang dibuka. Silakan tunggu periode berikutnya." },
        { status: 403 }
      );
    }

    // 7. Duplikat per periode: pre-check + uniqueness DB-level.
    //    CATATAN: username Roblox masih input teks BELUM TERVERIFIKASI;
    //    verifikasi hanya terjadi di Student Dashboard (TASK 03B.3+).
    const robloxUsernameKey = data.robloxUsername.toLowerCase();
    const existing = await prisma.application.findFirst({
      where: {
        recruitmentPeriodId: period.id,
        robloxUsernameKey,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `Username Roblox "${data.robloxUsername}" sudah terdaftar pada periode pendaftaran ini.`,
        },
        { status: 409 }
      );
    }

    // 8. Simpan dengan retry collision registrationId (max 3x).
    //    Constraint DB (@@unique) menangani race/concurrent submission.
    //    P2002 pada robloxUsernameKey → 409; P2002 lain → 409 generik.
    const rawAccessToken = generateRawAccessToken(period.code);
    const tokenHash = hashAccessToken(rawAccessToken);

    let app: { id: string; registrationId: string; status: string; createdAt: Date } | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const registrationId = generateRegistrationId(period.code);
      try {
        app = await prisma.application.create({
          data: {
            recruitmentPeriodId: period.id,
            registrationId,
            accessTokenHash: tokenHash,
            fullName: data.fullName,
            robloxUsername: data.robloxUsername,
            robloxUsernameKey,
            discordId: data.discordId,
            birthDate: new Date(data.birthDate),
            gender: data.gender,
            origin: data.origin,
            experience: data.experience,
            motivation: data.motivation,
            status: "MENUNGGU_VERIFIKASI",
          },
          select: {
            id: true,
            registrationId: true,
            status: true,
            createdAt: true,
          },
        });
        break;
      } catch (err) {
        lastError = err;
        if (isPrismaUniqueError(err)) {
          const target = (err as { meta?: { target?: string[] } }).meta?.target ?? [];
          // Duplicate concurrent submission pada username periode ini → 409 jelas.
          if (target.includes("recruitmentPeriodId") && target.includes("robloxUsernameKey")) {
            return NextResponse.json(
              {
                success: false,
                error: `Username Roblox "${data.robloxUsername}" sudah terdaftar pada periode pendaftaran ini.`,
              },
              { status: 409 }
            );
          }
          // Collision registrationId (30-bit space, praktis nol) → coba lagi.
          continue;
        }
        // Error tak terduga → jangan bocorkan detail DB ke client.
        console.error("[API Applications] Database error saat pendaftaran:", (err as Error)?.name || "unknown");
        return NextResponse.json(
          {
            success: false,
            error: "Terjadi kesalahan internal saat memproses pendaftaran. Silakan coba lagi.",
          },
          { status: 500 }
        );
      }
    }

    if (!app) {
      // Semua attempt kena P2002 (registrationId collision berturut-turut)
      // atau constraint duplicate — respons konsisten tanpa detail DB.
      void lastError;
      console.error("[API Applications] Pendaftaran gagal: constraint conflict berulang");
      return NextResponse.json(
        {
          success: false,
          error: "Pendaftaran belum dapat diproses karena konflik data. Silakan coba lagi.",
        },
        { status: 409 }
      );
    }

    // 9. Respons sukses: raw token dikembalikan SEKALI, setelah penyimpanan DB sukses.
    return NextResponse.json(
      {
        success: true,
        data: {
          id: app.id,
          registrationId: app.registrationId,
          accessToken: rawAccessToken, // hanya dikirim ke client ini, tidak pernah di-log
          fullName: data.fullName,
          robloxUsername: data.robloxUsername,
          discordId: data.discordId,
          status: app.status,
          registeredAt: app.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    // Error tak terduga (parsing, network internal, dsb.) — generik.
    console.error("[API Applications] Unexpected error:", (error as Error)?.name || "unknown");
    return NextResponse.json(
      {
        success: false,
        error: "Terjadi kesalahan internal saat memproses pendaftaran. Silakan coba lagi.",
      },
      { status: 500 }
    );
  }
}
