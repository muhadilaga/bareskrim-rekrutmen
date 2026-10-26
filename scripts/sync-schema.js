// scripts/sync-schema.js
// Safe runtime schema synchronizer for production deployment environments.
const { PrismaClient } = require("@prisma/client");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("[sync-schema] DATABASE_URL not set, skipping.");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const u = new URL(process.env.DATABASE_URL);
    console.log("[sync-schema] Connected DB user:", u.username);

    // 1. Ensure ExamPeriod has recruitmentPeriodId
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "ExamPeriod" ADD COLUMN IF NOT EXISTS "recruitmentPeriodId" TEXT;
    `);

    // 2. Ensure enums for Application exist
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ApplicationStatus" AS ENUM ('MENUNGGU_VERIFIKASI', 'DITERIMA', 'DITOLAK');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "Gender" AS ENUM ('L', 'P');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 3. Ensure Application table exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Application" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "recruitmentPeriodId" TEXT NOT NULL DEFAULT '',
        "registrationId" TEXT NOT NULL DEFAULT '',
        "accessTokenHash" TEXT NOT NULL DEFAULT '',
        "fullName" TEXT NOT NULL,
        "robloxUsername" TEXT NOT NULL,
        "robloxUsernameKey" TEXT NOT NULL,
        "discordId" TEXT NOT NULL,
        "birthDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "gender" "Gender" NOT NULL DEFAULT 'L',
        "origin" TEXT NOT NULL DEFAULT '',
        "experience" TEXT NOT NULL DEFAULT '',
        "motivation" TEXT NOT NULL DEFAULT '',
        "agreementAcceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "status" "ApplicationStatus" NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
        "rejectionReason" TEXT,
        "verifiedAt" TIMESTAMP(3),
        "verifiedBy" TEXT,
        "userId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TIMESTAMP(3)
      );
    `);

    // 4. Ensure RecruitmentPeriod table exists and has proper schema
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RecruitmentPeriod" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "code" TEXT NOT NULL DEFAULT 'DEFAULT',
        "name" TEXT NOT NULL DEFAULT 'Angkatan',
        "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "closedAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
        "isActive" BOOLEAN NOT NULL DEFAULT false,
        "deletedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "code" TEXT;
      ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "name" TEXT DEFAULT 'Angkatan';
      ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3) DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days');
      ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT false;
      ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
      ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
      UPDATE "RecruitmentPeriod" SET "code" = id WHERE "code" IS NULL OR "code" = '';
    `);

    console.log("[sync-schema] Schema synchronization completed successfully.");
  } catch (err) {
    console.warn("[sync-schema] Non-fatal notice:", err && err.message ? err.message : err);
  } finally {
    await prisma.$disconnect().catch(() => null);
  }
}

main();
