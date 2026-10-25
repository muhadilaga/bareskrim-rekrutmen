-- ============================================================
-- [LEGACY — DOKUMENTASI SAJA, JANGAN DIJALANKAN DI V2] (TASK 03G)
-- File ini TIDAK dieksekusi oleh aplikasi V2 (src/lib/init-schema.ts
-- kini hanya verifikasi read-only; initSchema() dinonaktifkan).
-- Prisma Migrate adalah penulis skema tunggal V2:
--   prisma/migrations/20261002000000_init_v2_baseline/migration.sql
-- Alasan penghentian penggunaan: dua jalur DDL (legacy idempoten +
-- Prisma Migrate) menyebabkan drift & konflik skema —
-- docs/v2/11-PRISMA-MIGRATION-STRATEGY.md bagian 2 & 3.
-- File dipertahankan sebagai referensi dokumentasi inisialisasi V1.
-- ============================================================

-- ============================================================
-- BARESKRIM REKRUTMEN - init.sql
-- Jalankan file ini SEKALI di PostgreSQL (mis. Supabase -> SQL Editor -> New query -> Run).
-- Bisa juga dilakukan otomatis lewat halaman /admin -> tombol "Initialize Database".
-- Idempoten (aman dijalankan ulang).
-- ============================================================

-- ===== ENUM =====
DO $$ BEGIN
  IF to_regtype('"QuestionType"') IS NULL THEN
    CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'ESSAY');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regtype('"AttemptStatus"') IS NULL THEN
    CREATE TYPE "AttemptStatus" AS ENUM ('LULUS', 'TIDAK_LULUS');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regtype('"BlacklistCategory"') IS NULL THEN
    CREATE TYPE "BlacklistCategory" AS ENUM ('POLRI', 'PENDIDIKAN');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regtype('"VerdictStatus"') IS NULL THEN
    CREATE TYPE "VerdictStatus" AS ENUM ('LULUS', 'TIDAK_LULUS');
  END IF;
END $$;

-- ===== USER (CASIS) =====
CREATE TABLE IF NOT EXISTS "User" (
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
);

-- Kolom tambahan (idempoten untuk DB yang sudah ada)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordUsername" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "policeGroupRankNumber" INTEGER;
ALTER TABLE "ExamResult" ADD COLUMN IF NOT EXISTS "discordMessageId" TEXT;

-- ===== PERIODE REKRUTMEN =====
CREATE TABLE IF NOT EXISTS "ExamPeriod" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "seed" INTEGER NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "ExamPeriod_pkey" PRIMARY KEY ("id")
);

-- ===== BANK SOAL =====
CREATE TABLE IF NOT EXISTS "Question" (
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
);

-- ===== PERCOBAAN UJIAN =====
CREATE TABLE IF NOT EXISTS "ExamAttempt" (
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
);

-- ===== JAWABAN PER SOAL =====
CREATE TABLE IF NOT EXISTS "ExamAnswer" (
  "id" TEXT NOT NULL,
  "attemptId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "isCorrect" BOOLEAN,
  "earnedPoints" INTEGER,
  CONSTRAINT "ExamAnswer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExamAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ===== HASIL UJIAN =====
CREATE TABLE IF NOT EXISTS "ExamResult" (
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
);

-- ===== DAFTAR HITAM (BLACKLIST POLRI / PENDIDIKAN) =====
CREATE TABLE IF NOT EXISTS "BlacklistEntry" (
  "id" TEXT NOT NULL,
  "category" "BlacklistCategory" NOT NULL,
  "username" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlacklistEntry_pkey" PRIMARY KEY ("id")
);

-- ===== PUTUSAN SIDANG =====
CREATE TABLE IF NOT EXISTS "VerdictEntry" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "status" "VerdictStatus" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerdictEntry_pkey" PRIMARY KEY ("id")
);

-- ===== INDEX UNIK =====
CREATE UNIQUE INDEX IF NOT EXISTS "User_robloxId_key" ON "User"("robloxId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamPeriod_seed_key" ON "ExamPeriod"("seed");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamAttempt_attemptKey_key" ON "ExamAttempt"("attemptKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamAttempt_periodId_userId_key" ON "ExamAttempt"("periodId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamAnswer_attemptId_questionId_key" ON "ExamAnswer"("attemptId", "questionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamResult_attemptId_key" ON "ExamResult"("attemptId");

-- ===== INDEX PENDUKUNG =====
CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User"("username");
CREATE INDEX IF NOT EXISTS "ExamAttempt_userId_idx" ON "ExamAttempt"("userId");
CREATE INDEX IF NOT EXISTS "ExamResult_submittedAt_idx" ON "ExamResult"("submittedAt");
CREATE INDEX IF NOT EXISTS "ExamPeriod_isActive_idx" ON "ExamPeriod"("isActive");
CREATE INDEX IF NOT EXISTS "Question_type_isActive_idx" ON "Question"("type", "isActive");
CREATE INDEX IF NOT EXISTS "BlacklistEntry_category_idx" ON "BlacklistEntry"("category");
CREATE INDEX IF NOT EXISTS "BlacklistEntry_username_idx" ON "BlacklistEntry"("username");
CREATE INDEX IF NOT EXISTS "VerdictEntry_username_idx" ON "VerdictEntry"("username");
