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
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "ExamPeriod" ADD COLUMN IF NOT EXISTS "recruitmentPeriodId" TEXT;
    `);
    console.log("[sync-schema] Checked ExamPeriod.recruitmentPeriodId.");
  } catch (err) {
    console.warn("[sync-schema] Non-fatal notice:", err && err.message ? err.message : err);
  } finally {
    await prisma.$disconnect().catch(() => null);
  }
}

main();
