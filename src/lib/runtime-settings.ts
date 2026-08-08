import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/constants";

type EffectiveSettings = ReturnType<typeof getSettings>;
type PersistedSettings = Partial<EffectiveSettings>;

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "RuntimeSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuntimeSetting_pkey" PRIMARY KEY ("key")
);
`;

async function ensureTable() {
  await prisma.$executeRawUnsafe(TABLE_SQL);
}

export async function getPersistedSettings(): Promise<PersistedSettings> {
  await ensureTable();
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "key", "value" FROM "RuntimeSetting"`
  )) as Array<{ key: string; value: unknown }>;
  const persisted: Record<string, unknown> = {};
  for (const row of rows) persisted[row.key] = row.value;
  return persisted as PersistedSettings;
}

export async function getEffectiveSettings(): Promise<EffectiveSettings> {
  const base = getSettings();
  const persisted = await getPersistedSettings();
  return { ...base, ...persisted };
}

export async function saveSettings(updates: Record<string, unknown>) {
  await ensureTable();
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "RuntimeSetting" ("key", "value", "updatedAt")
       VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT ("key")
       DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP`,
      key,
      JSON.stringify(value)
    );
  }
  return getEffectiveSettings();
}
