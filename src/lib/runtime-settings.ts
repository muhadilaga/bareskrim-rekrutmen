import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/constants";

type EffectiveSettings = ReturnType<typeof getSettings>;
type PersistedSettings = Partial<EffectiveSettings>;

// ============================================================
// TASK 03G + 03G.1 — Legacy Schema Guard.
// Model RuntimeSetting kini tercakup di prisma/schema.prisma
// dan initial migration (TASK 03G.1). Prisma Migrate = penulis
// skema tunggal V2, jadi modul ini TIDAK menjalankan DDL otomatis.
// Bila tabel belum ada (DB belum di-migrate) → error jelas,
// bukan fallback diam-diam.
// ============================================================
async function assertRuntimeSettingTable(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'RuntimeSetting'
     ) AS present`
  );
  if (rows[0]?.present !== true) {
    throw new Error(
      "RUNTIME_SETTING_TABLE_MISSING: tabel \"RuntimeSetting\" belum ada di database. " +
        "Tambahkan model RuntimeSetting ke prisma/schema.prisma dan jalankan Prisma Migrate " +
        "(docs/v2/11-PRISMA-MIGRATION-STRATEGY.md). DDL otomatis dinonaktifkan (TASK 03G)."
    );
  }
}

export async function getPersistedSettings(): Promise<PersistedSettings> {
  await assertRuntimeSettingTable();
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
  await assertRuntimeSettingTable();
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
