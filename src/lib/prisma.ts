import { PrismaClient } from "@prisma/client";

// ============================================================
// Fail-closed production: DATABASE_URL placeholder/development
// TIDAK PERNAH dipakai di production. Tanpa konfigurasi database
// yang valid, aplikasi gagal start (bukan diam-diam jalan).
// Placeholder hanya untuk runtime development/test non-production.
//
// DATABASE_URL = Supabase Transaction Pooler (runtime)
// DIRECT_URL   = Direct/Session Pooler (Prisma Migrate; tidak dipakai
//                oleh PrismaClient runtime, hanya oleh Prisma CLI)
// ============================================================
const rawUrl = process.env.DATABASE_URL;
const isPlaceholderDb =
  !rawUrl || rawUrl.includes("placeholder") || rawUrl.includes("localhost:5432/placeholder");

if (process.env.NODE_ENV === "production" && isPlaceholderDb) {
  throw new Error(
    "DATABASE_URL tidak valid atau tidak di-set. Konfigurasi database production wajib diisi sebelum aplikasi berjalan."
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    datasources: {
      db: {
        // Dev/test: placeholder aman (tidak pernah menyambung ke host nyata).
        // Production: terjaga oleh guard di atas.
        url: rawUrl || "postgresql://placeholder:***@localhost:5432/placeholder",
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
