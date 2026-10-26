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

    const additionalStatements = [
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "code" TEXT`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "name" TEXT DEFAULT 'Angkatan'`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "batch" INTEGER DEFAULT 1`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "phase" TEXT DEFAULT 'TAHAP_1'`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'DIBUKA'`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3) DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3) DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT false`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3)`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE "RecruitmentPeriod" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,
      `UPDATE "RecruitmentPeriod" SET "code" = id WHERE "code" IS NULL OR "code" = ''`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "RecruitmentPeriod_code_key" ON "RecruitmentPeriod"("code")`,
      `CREATE TABLE IF NOT EXISTS "RuntimeSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" JSONB NOT NULL DEFAULT '{}'::jsonb, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS "OAuthState" ("id" TEXT NOT NULL PRIMARY KEY, "stateId" TEXT NOT NULL DEFAULT '', "state" TEXT NOT NULL DEFAULT '', "codeVerifier" TEXT NOT NULL DEFAULT '', "nonce" TEXT NOT NULL DEFAULT '', "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'), "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS "BlacklistEntry" ("id" TEXT NOT NULL PRIMARY KEY, "robloxId" TEXT NOT NULL DEFAULT '', "robloxUsername" TEXT NOT NULL DEFAULT '', "reason" TEXT NOT NULL DEFAULT '', "notes" TEXT, "source" TEXT NOT NULL DEFAULT 'MANUAL', "addedBy" TEXT NOT NULL DEFAULT '', "isActive" BOOLEAN NOT NULL DEFAULT true, "revokedAt" TIMESTAMP(3), "revokedBy" TEXT, "revokeReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS "VerdictEntry" ("id" TEXT NOT NULL PRIMARY KEY, "robloxId" TEXT NOT NULL DEFAULT '', "robloxUsername" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT '', "notes" TEXT, "decidedBy" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS "PendingDiscordReport" ("id" TEXT NOT NULL PRIMARY KEY, "channelId" TEXT NOT NULL DEFAULT '', "messageId" TEXT, "payload" JSONB NOT NULL DEFAULT '{}'::jsonb, "retries" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'PENDING', "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS "AdminLog" ("id" TEXT NOT NULL PRIMARY KEY, "action" TEXT NOT NULL DEFAULT '', "admin" TEXT NOT NULL DEFAULT '', "details" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS "StudentActionLog" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL DEFAULT '', "action" TEXT NOT NULL DEFAULT '', "details" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`
    ];

    for (const sql of additionalStatements) {
      try {
        await prisma.$executeRawUnsafe(sql);
      } catch (e) {
        console.warn("[sync-schema] Notice on statement:", sql.slice(0, 40), e?.message || e);
      }
    }

    console.log("[sync-schema] Schema synchronization completed successfully.");
  } catch (err) {
    console.warn("[sync-schema] Non-fatal notice:", err && err.message ? err.message : err);
  } finally {
    await prisma.$disconnect().catch(() => null);
  }
}

main();
