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
    console.log("[sync-schema] Database user in env:", u.username);
    const tables = await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log("[sync-schema] Tables in DB:", tables.map(t => t.table_name).join(", "));
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
