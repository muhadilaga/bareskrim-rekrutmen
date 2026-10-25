import crypto from "node:crypto";
import { z } from "zod";

// ============================================================
// TASK 03B.2 — Registration Backend Hardening
// Credential generator: cryptographically secure, ≥128-bit
// entropi, tanpa pemanggilan random lemah. Raw token tidak pernah disimpan
// di database maupun log — hanya hash SHA-256.
// ============================================================

// Batas panjang maksimum input formulir pendaftaran
export const INPUT_LIMITS = {
  fullName: { min: 3, max: 100 },
  robloxUsername: { min: 3, max: 40 },
  discordId: { min: 2, max: 32 },
  origin: { min: 2, max: 100 },
  experience: { min: 10, max: 2000 },
  motivation: { min: 10, max: 2000 },
} as const;

// Alphabet base32 tanpa karakter ambiguitas (tidak ada 0/O/1/I)
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Strips invisible zero-width characters (copy-paste artifact discipline)
export function stripInvisibleCharacters(val: string): string {
  return val.replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
}

// Strips leading @ from usernames
export function stripLeadingAt(val: string): string {
  return val.replace(/^@+/, "").trim();
}

// Validasi tanggal lahir: harus valid, tidak di masa depan, bukan masa lalu ekstrem
export function isValidBirthDate(val: string): boolean {
  const d = new Date(val);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const min = new Date("1950-01-01");
  return d <= now && d >= min;
}

// Deteksi error Prisma unique constraint (P2002) tanpa membocorkan detail
export function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

// Zod Schema untuk pendaftaran (validasi server-side penuh)
export const applicationSubmitSchema = z.object({
  fullName: z
    .string()
    .transform(stripInvisibleCharacters)
    .pipe(
      z
        .string()
        .min(INPUT_LIMITS.fullName.min, "Nama lengkap minimal 3 karakter")
        .max(INPUT_LIMITS.fullName.max, "Nama lengkap maksimal 100 karakter")
    ),
  robloxUsername: z
    .string()
    .transform(stripInvisibleCharacters)
    .transform(stripLeadingAt)
    .pipe(
      z
        .string()
        .min(INPUT_LIMITS.robloxUsername.min, "Username Roblox minimal 3 karakter")
        .max(INPUT_LIMITS.robloxUsername.max, "Username Roblox maksimal 40 karakter")
        .regex(
          /^[a-zA-Z0-9_]+$/,
          "Username Roblox hanya boleh berisi huruf, angka, dan underscore"
        )
    ),
  discordId: z
    .string()
    .transform(stripInvisibleCharacters)
    .transform(stripLeadingAt)
    .pipe(
      z
        .string()
        .min(INPUT_LIMITS.discordId.min, "Discord Username minimal 2 karakter")
        .max(INPUT_LIMITS.discordId.max, "Discord Username maksimal 32 karakter")
    ),
  birthDate: z
    .string()
    .refine(isValidBirthDate, "Tanggal lahir tidak valid"),
  gender: z.enum(["L", "P"], {
    errorMap: () => ({ message: "Jenis kelamin harus L atau P" }),
  }),
  origin: z
    .string()
    .transform(stripInvisibleCharacters)
    .pipe(
      z
        .string()
        .min(INPUT_LIMITS.origin.min, "Asal domisili minimal 2 karakter")
        .max(INPUT_LIMITS.origin.max, "Asal domisili maksimal 100 karakter")
    ),
  experience: z
    .string()
    .transform(stripInvisibleCharacters)
    .pipe(
      z
        .string()
        .min(INPUT_LIMITS.experience.min, "Pengalaman roleplay minimal 10 karakter")
        .max(INPUT_LIMITS.experience.max, "Pengalaman roleplay maksimal 2000 karakter")
    ),
  motivation: z
    .string()
    .transform(stripInvisibleCharacters)
    .pipe(
      z
        .string()
        .min(INPUT_LIMITS.motivation.min, "Motivasi pendaftaran minimal 10 karakter")
        .max(INPUT_LIMITS.motivation.max, "Motivasi pendaftaran maksimal 2000 karakter")
    ),
  agreement: z.boolean().refine((val) => val === true, {
    message: "Pernyataan kebenaran data wajib disetujui",
  }),
});

export type ApplicationSubmitInput = z.infer<typeof applicationSubmitSchema>;

// ============================================================
// Registration ID: {code}-{6 karakter base32} (contoh visual:
// XLI-02-K8M2N4 — contoh format, bukan nilai nyata).
// TASK 03F: perluasan 4 digit → 6 karakter kriptografis.
// FUNGSI TERPISAH dari access token — hanya identitas referensi
// visual, bukan kredensial. 6 × 5 bit = 30 bit entropi
// (~1,07 miliar ruang) — bukan untuk sekuritas, untuk
// mengurangi collision di gelombang besar.
// crypto.randomBytes(4) → 32 bit, 2 bit terakhir dibuang
// (30 bit dipakai) — tanpa modulo bias.
// Alphabet sama dengan token (tanpa 0/O/1/I).
// Uniqueness dijamin DB: Application.registrationId @unique.
// Prefix dinamis dari RecruitmentPeriod.code.
// ============================================================
export function generateRegistrationId(code = "XLI-02"): string {
  // 30 bit = 6 char base32 tepat; 4 byte = 32 bit, ambil 30 bit atas
  const bytes = crypto.randomBytes(4);
  const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const bits30 = value >>> 2; // buang 2 bit terakhir → tanpa bias
  let out = "";
  for (let i = 5; i >= 0; i--) {
    out += TOKEN_ALPHABET[(bits30 >>> (i * 5)) & 31];
  }
  return `${code}-${out}`;
}

// ============================================================
// Access Token: minimal 128-bit entri kriptografis (diimplementasi
// 160 bit / 20 byte crypto.randomBytes → 32 char base32 = tepat
// 160 bit tanpa modulo bias).
//
// FORMAT DESAIN DIUBAH (keamanan > kemewahan tampilan):
//   Lama : XLI-02-XXXX-XXXX        (64 bit, TIDAK AMAN)
//   Baru : XLI-02-XXXXXXXX-...-XX  (32 char, 160 bit)
// Gaya visual dipertahankan: prefix angkatan, grup 4 karakter
// dipisah tanda hubung, kapital tanpa karakter ambiguitas.
//
// Fungsi TERPISAH dari generateRegistrationId().
// Raw token hanya dikembalikan ke client sekali saat pendaftaran
// berhasil; database hanya menyimpan hash SHA-256-nya.
// ============================================================
export function generateRawAccessToken(code = "XLI-02"): string {
  // 20 byte = 160 bit; 160 / 5 = 32 char base32 tepat tanpa sisa
  const bytes = crypto.randomBytes(20);
  let out = "";
  let bitBuffer = 0;
  let bitCount = 0;
  for (const b of bytes) {
    bitBuffer = (bitBuffer << 8) | b;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      out += TOKEN_ALPHABET[(bitBuffer >>> bitCount) & 31];
    }
  }
  // Kelompokkan per 4 karakter: 32 char = 8 grup
  const groups = out.match(/.{1,4}/g) ?? [out];
  return `${code}-${groups.join("-")}`;
}

// Hash Access Token menggunakan SHA-256.
// Metode sesuai untuk entri ≥128 bit: token berentropi tinggi
// tidak memerlukan salt/bcrypt — brute force tidak masuk akal.
// Hanya hash yang disimpan di DB; hash tidak pernah dicetak.
export function hashAccessToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// ============================================================
// TASK 03L.1 — Student Claim Service & Credential Verification
// ============================================================

// Verifikasi timing-safe antara raw token dan hash yang tersimpan di DB.
export function verifyAccessTokenCredential(rawToken: string, expectedHash: string): boolean {
  const validHash = /^[a-fA-F0-9]{64}$/.test(expectedHash);
  const computed = crypto.createHash("sha256").update(rawToken.trim()).digest();
  const expected = validHash ? Buffer.from(expectedHash, "hex") : Buffer.alloc(32);
  const matches = crypto.timingSafeEqual(computed, expected);
  return validHash && rawToken.trim().length > 0 && matches;
}

export type StudentClaimErrorCode =
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_ALREADY_CLAIMED"
  | "ROBLOX_USERNAME_MISMATCH"
  | "INVALID_CREDENTIALS"
  | "APPLICATION_INELIGIBLE"
  | "APPLICATION_CHANGED";

export class StudentClaimError extends Error {
  constructor(public code: StudentClaimErrorCode, message: string) {
    super(message);
    this.name = "StudentClaimError";
  }
}

export interface LinkApplicationParams {
  applicationId: string;
  userId: string;
  robloxUsername: string;
  // Supplied by the claim service after credential verification in the same transaction.
  expectedUpdatedAt?: Date;
}

export interface LinkApplicationResult {
  success: boolean;
  isAlreadyLinked: boolean;
}

/**
 * Tautkan Application dengan User dalam transaksi Prisma.
 * Menjamin atomisitas, pencegahan account takeover, dan race condition (concurrency).
 * PENTING: Status Application (ApplicationStatus) TIDAK DIUBAH menjadi DITERIMA secara otomatis.
 */
export async function linkApplicationToUser(
  tx: {
    application: {
      findUnique: (args: any) => Promise<any>;
      updateMany: (args: any) => Promise<{ count: number }>;
    };
  },
  params: LinkApplicationParams
): Promise<LinkApplicationResult> {
  const { applicationId, userId, robloxUsername } = params;

  // 1) Fetch application di dalam transaksi
  const app = await tx.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true, userId: true, robloxUsernameKey: true, verifiedAt: true,
      deletedAt: true, updatedAt: true, recruitmentPeriod: { select: { deletedAt: true } },
    },
  });

  if (!app) {
    throw new StudentClaimError("APPLICATION_NOT_FOUND", "Aplikasi pendaftaran tidak ditemukan.");
  }

  if (app.deletedAt || app.recruitmentPeriod?.deletedAt || (app.userId === null && app.verifiedAt)) {
    throw new StudentClaimError("APPLICATION_INELIGIBLE", "Claim ditolak.");
  }
  if (params.expectedUpdatedAt && app.updatedAt?.getTime() !== params.expectedUpdatedAt.getTime()) {
    throw new StudentClaimError("APPLICATION_CHANGED", "Claim ditolak.");
  }
  // Existing ownership survives username changes. The API service verifies the token first.
  if (app.userId === userId) return { success: true, isAlreadyLinked: true };

  // 2) Validasi kesesuaian username Roblox (case-insensitive key match)
  const normalizedRoblox = robloxUsername.trim().toLowerCase();
  if (normalizedRoblox !== app.robloxUsernameKey) {
    throw new StudentClaimError(
      "ROBLOX_USERNAME_MISMATCH",
      "Username Roblox akun Anda tidak cocok dengan data pendaftaran."
    );
  }

  // 3) Cek Idempotensi & Konflik Akun Lain
  if (app.userId === userId) {
    return { success: true, isAlreadyLinked: true };
  }

  if (app.userId !== null && app.userId !== userId) {
    throw new StudentClaimError(
      "APPLICATION_ALREADY_CLAIMED",
      "Pendaftaran ini sudah diklaim oleh akun Roblox lain."
    );
  }

  // 4) Update atomis dengan conditional update (userId harus masih null)
  const updated = await tx.application.updateMany({
    where: {
      id: applicationId,
      userId: null,
      verifiedAt: null,
      deletedAt: null,
      robloxUsernameKey: normalizedRoblox,
      ...(params.expectedUpdatedAt ? { updatedAt: params.expectedUpdatedAt } : {}),
      recruitmentPeriod: { deletedAt: null },
    },
    data: {
      userId: userId,
      verifiedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    // The public service must re-verify credentials against the winning version.
    if (params.expectedUpdatedAt) {
      throw new StudentClaimError("APPLICATION_CHANGED", "Claim ditolak.");
    }
    // Race condition: jika klaim paralel lain mengupdate userId bersamaan
    const rechecked = await tx.application.findUnique({ where: { id: applicationId } });
    if (rechecked?.userId === userId) {
      return { success: true, isAlreadyLinked: true };
    }
    throw new StudentClaimError(
      "APPLICATION_ALREADY_CLAIMED",
      "Pendaftaran ini telah diklaim oleh akun lain."
    );
  }

  return { success: true, isAlreadyLinked: false };
}

// ============================================================
// Auto-enroll / ensure Application terhubung ke user tanpa token/claim manual
// ============================================================
export async function ensureCandidateApplication(
  prismaClient: any,
  user: { id: string; username: string; displayName?: string | null; discordUsername?: string | null },
  recruitmentPeriodId?: string | null
) {
  if (!user?.id || !user.username) return null;

  try {
    let targetPeriodId = recruitmentPeriodId;
    if (!targetPeriodId) {
      const activeExam = await prismaClient.examPeriod.findFirst({
        where: { isActive: true, deletedAt: null },
        select: { recruitmentPeriodId: true },
      });
      targetPeriodId = activeExam?.recruitmentPeriodId;
    }
    if (!targetPeriodId) {
      const activeRec = await prismaClient.recruitmentPeriod.findFirst({
        where: { isActive: true, deletedAt: null },
        select: { id: true },
      });
      targetPeriodId = activeRec?.id;
    }
    if (!targetPeriodId) return null;

    // 1. Cek apakah user sudah punya application di periode ini
    const existing = await prismaClient.application.findFirst({
      where: {
        userId: user.id,
        recruitmentPeriodId: targetPeriodId,
        deletedAt: null,
      },
      include: { recruitmentPeriod: { select: { name: true } } },
    });
    if (existing) return existing;

    // 2. Cek apakah ada application unlinked dengan robloxUsername yang cocok
    const normUser = user.username.trim().toLowerCase();
    const unlinked = await prismaClient.application.findFirst({
      where: {
        robloxUsernameKey: normUser,
        recruitmentPeriodId: targetPeriodId,
        deletedAt: null,
      },
      include: { recruitmentPeriod: { select: { name: true } } },
    });

    if (unlinked) {
      return await prismaClient.application.update({
        where: { id: unlinked.id },
        data: {
          userId: user.id,
          status: "DITERIMA",
          verifiedAt: new Date(),
        },
        include: { recruitmentPeriod: { select: { name: true } } },
      });
    }

    // 3. Auto-enroll casis
    const regId = `CASIS-${user.username.toUpperCase()}`;
    return await prismaClient.application.create({
      data: {
        userId: user.id,
        registrationId: regId,
        fullName: user.displayName || user.username,
        robloxUsername: user.username,
        robloxUsernameKey: normUser,
        discordId: user.discordUsername || "casis_discord",
        birthDate: new Date("2000-01-01"),
        gender: "L",
        origin: "Online",
        experience: "Pusdik Reserse Casis",
        motivation: "Calon Siswa Terdaftar",
        recruitmentPeriodId: targetPeriodId,
        status: "DITERIMA",
        verifiedAt: new Date(),
        accessTokenHash: `AUTO_ENROLLED_${user.id}`,
      },
      include: { recruitmentPeriod: { select: { name: true } } },
    });
  } catch (e) {
    console.warn("Failed in ensureCandidateApplication:", e);
    return null;
  }
}


