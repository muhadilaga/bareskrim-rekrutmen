// ============================================================
// Inisialisasi Schema Database (tanpa CLI, tanpa migrasi manual)
// Idempoten: aman dijalankan berulang kali.
// Dipakai oleh /api/admin/init agar admin cukup klik dari browser.
// ============================================================

import { prisma } from "@/lib/prisma";

const statements: string[] = [
  // Enum (ada pengecekan agar idempoten)
  `DO $$ BEGIN
     IF to_regtype('"QuestionType"') IS NULL THEN
       CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'ESSAY');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF to_regtype('"AttemptStatus"') IS NULL THEN
       CREATE TYPE "AttemptStatus" AS ENUM ('LULUS', 'TIDAK_LULUS');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF to_regtype('"BlacklistCategory"') IS NULL THEN
       CREATE TYPE "BlacklistCategory" AS ENUM ('POLRI', 'PENDIDIKAN');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF to_regtype('"VerdictStatus"') IS NULL THEN
       CREATE TYPE "VerdictStatus" AS ENUM ('LULUS', 'TIDAK_LULUS');
     END IF;
   END $$;`,

  // ===== User (Casis) =====
  `CREATE TABLE IF NOT EXISTS "User" (
     "id" TEXT NOT NULL,
     "robloxId" BIGINT NOT NULL,
     "username" TEXT NOT NULL,
     "displayName" TEXT NOT NULL,
     "avatarUrl" TEXT,
     "profileUrl" TEXT,
     "requiredGroupId" BIGINT,
     "policeGroupRankId" BIGINT,
     "policeGroupRank" TEXT,
     "bannedGroupIds" JSONB,
     "matraBlocked" BOOLEAN NOT NULL DEFAULT false,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "User_pkey" PRIMARY KEY ("id")
   );`,


  // ===== Periode Rekrutmen =====
  `CREATE TABLE IF NOT EXISTS "ExamPeriod" (
     "id" TEXT NOT NULL,
     "name" TEXT NOT NULL,
     "description" TEXT,
     "isActive" BOOLEAN NOT NULL DEFAULT false,
     "seed" INTEGER NOT NULL,
     "openedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
     "closedAt" TIMESTAMP(3),
     CONSTRAINT "ExamPeriod_pkey" PRIMARY KEY ("id")
   );`,

  // ===== Bank Soal =====
  `CREATE TABLE IF NOT EXISTS "Question" (
     "id" TEXT NOT NULL,
     "type" "QuestionType" NOT NULL,
     "prompt" TEXT NOT NULL,
     "options" JSONB,
     "correctKey" TEXT,
     "points" INTEGER NOT NULL,
     "keywords" JSONB,
     "isActive" BOOLEAN NOT NULL DEFAULT true,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
   );`,

  // ===== Percobaan Ujian =====
  `CREATE TABLE IF NOT EXISTS "ExamAttempt" (
     "id" TEXT NOT NULL,
     "periodId" TEXT NOT NULL,
     "userId" TEXT NOT NULL,
     "attemptKey" TEXT NOT NULL,
     "questionsJson" JSONB NOT NULL,
     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "submittedAt" TIMESTAMP(3),
     CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "ExamAttempt_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ExamPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "ExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
   );`,

  // ===== Jawaban per Soal =====
  `CREATE TABLE IF NOT EXISTS "ExamAnswer" (
     "id" TEXT NOT NULL,
     "attemptId" TEXT NOT NULL,
     "questionId" TEXT NOT NULL,
     "answer" TEXT NOT NULL,
     "isCorrect" BOOLEAN,
     "earnedPoints" INTEGER,
     CONSTRAINT "ExamAnswer_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "ExamAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "ExamAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE
   );`,

  // ===== Hasil Ujian =====
  `CREATE TABLE IF NOT EXISTS "ExamResult" (
     "id" TEXT NOT NULL,
     "attemptId" TEXT NOT NULL,
     "score" INTEGER NOT NULL,
     "maxScore" INTEGER NOT NULL,
     "mcqScore" INTEGER NOT NULL,
     "essayScore" INTEGER NOT NULL,
     "status" "AttemptStatus" NOT NULL,
     "passed" BOOLEAN NOT NULL,
     "answersJson" JSONB NOT NULL,
     "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ExamResult_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "ExamResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE
   );`,

  // ===== Daftar Hitam (Blacklist Polri / Pendidikan) =====
  `CREATE TABLE IF NOT EXISTS "BlacklistEntry" (
     "id" TEXT NOT NULL,
     "category" "BlacklistCategory" NOT NULL,
     "username" TEXT NOT NULL,
     "reason" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "BlacklistEntry_pkey" PRIMARY KEY ("id")
   );`,

  // ===== Putusan Sidang =====
  `CREATE TABLE IF NOT EXISTS "VerdictEntry" (
     "id" TEXT NOT NULL,
     "username" TEXT NOT NULL,
     "status" "VerdictStatus" NOT NULL,
     "note" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "VerdictEntry_pkey" PRIMARY KEY ("id")
   );`,

  // ===== Audit Log Admin =====
  `CREATE TABLE IF NOT EXISTS "AdminLog" (
     "id" TEXT NOT NULL,
     "action" TEXT NOT NULL,
     "target" TEXT,
     "detail" JSONB,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
   );`,

  // ===== Antrean Laporan Discord (retry) =====
  `CREATE TABLE IF NOT EXISTS "PendingDiscordReport" (
     "id" TEXT NOT NULL,
     "resultId" TEXT NOT NULL,
     "payload" JSONB NOT NULL,
     "attempts" INTEGER NOT NULL DEFAULT 0,
     "lastError" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "PendingDiscordReport_pkey" PRIMARY KEY ("id")
   );`,

  // ===== Absensi =====
  `CREATE TABLE IF NOT EXISTS "Attendance" (
     "id" TEXT NOT NULL,
     "userId" TEXT,
     "periodId" TEXT NOT NULL,
     "tahap" TEXT NOT NULL DEFAULT 'AKADEMIK',
     "status" TEXT NOT NULL DEFAULT 'HADIR',
     "discordUserId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id"),
     CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT "Attendance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ExamPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE
   );`,

  // Kolom tambahan untuk DB lama
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordUsername" TEXT;`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "policeGroupRankNumber" INTEGER;`,
  `ALTER TABLE "ExamResult" ADD COLUMN IF NOT EXISTS "discordMessageId" TEXT;`,
  `ALTER TABLE "ExamPeriod" ADD COLUMN IF NOT EXISTS "mcqCount" INTEGER;`,
  `ALTER TABLE "ExamPeriod" ADD COLUMN IF NOT EXISTS "essayCount" INTEGER;`,
  `ALTER TABLE "ExamPeriod" ADD COLUMN IF NOT EXISTS "passThreshold" INTEGER NOT NULL DEFAULT 70;`,
  `ALTER TABLE "ExamPeriod" ADD COLUMN IF NOT EXISTS "isExamOpen" BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE "ExamPeriod" ADD COLUMN IF NOT EXISTS "isAttendanceOpen" BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE "ExamPeriod" ALTER COLUMN "openedAt" DROP NOT NULL;`,

  // ===== Index Unik =====
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_robloxId_key" ON "User"("robloxId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ExamPeriod_seed_key" ON "ExamPeriod"("seed");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ExamAttempt_attemptKey_key" ON "ExamAttempt"("attemptKey");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ExamAttempt_periodId_userId_key" ON "ExamAttempt"("periodId", "userId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ExamAnswer_attemptId_questionId_key" ON "ExamAnswer"("attemptId", "questionId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ExamResult_attemptId_key" ON "ExamResult"("attemptId");`,

  // ===== Index Pendukung =====
  `CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User"("username");`,
  `CREATE INDEX IF NOT EXISTS "ExamAttempt_userId_idx" ON "ExamAttempt"("userId");`,
  `CREATE INDEX IF NOT EXISTS "ExamResult_submittedAt_idx" ON "ExamResult"("submittedAt");`,
  `CREATE INDEX IF NOT EXISTS "ExamPeriod_isActive_idx" ON "ExamPeriod"("isActive");`,
  `CREATE INDEX IF NOT EXISTS "Question_type_isActive_idx" ON "Question"("type", "isActive");`,
  `CREATE INDEX IF NOT EXISTS "BlacklistEntry_category_idx" ON "BlacklistEntry"("category");`,
  `CREATE INDEX IF NOT EXISTS "BlacklistEntry_username_idx" ON "BlacklistEntry"("username");`,
  `CREATE INDEX IF NOT EXISTS "VerdictEntry_username_idx" ON "VerdictEntry"("username");`,
  `CREATE INDEX IF NOT EXISTS "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");`,
  `CREATE INDEX IF NOT EXISTS "AdminLog_action_idx" ON "AdminLog"("action");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PendingDiscordReport_resultId_key" ON "PendingDiscordReport"("resultId");`,
  `CREATE INDEX IF NOT EXISTS "PendingDiscordReport_createdAt_idx" ON "PendingDiscordReport"("createdAt");`,
  `CREATE INDEX IF NOT EXISTS "Attendance_periodId_idx" ON "Attendance"("periodId");`,
  `CREATE INDEX IF NOT EXISTS "Attendance_discordUserId_idx" ON "Attendance"("discordUserId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_userId_periodId_tahap_key" ON "Attendance"("userId", "periodId", "tahap");`,
];

export async function schemaExists(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT (
         (SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('ExamResult', 'BlacklistEntry', 'VerdictEntry', 'Attendance')) = 4
         AND
         (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'User' AND column_name IN ('discordUsername', 'policeGroupRankNumber')) = 2
         AND
         (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'ExamResult' AND column_name = 'discordMessageId') = 1
         AND
         (SELECT COUNT(*) FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'ExamPeriod' AND column_name IN ('isExamOpen', 'isAttendanceOpen')) = 2
       ) AS ok`
    );
    return (rows as Array<{ ok: boolean }>)[0]?.ok === true;
  } catch {
    return false;
  }
}

export async function initSchema(): Promise<void> {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!;
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      throw new Error(`INIT_SCHEMA_FAIL index=${i + 1} head=${stmt.split("\n")[0]} error=${err}`);
    }
  }
}

// Inisialisasi otomatis (lazy): hanya dijalankan saat tabel belum ada,
// lalu di-memoize agar tidak membebani request berikutnya.
let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const exists = await schemaExists();
      if (!exists) {
        await initSchema();
      }
      schemaReady = true;
    })().catch((e) => {
      schemaPromise = null;
      throw e;
    });
  }
  return schemaPromise;
}
