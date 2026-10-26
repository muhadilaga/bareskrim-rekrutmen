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

const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build" ||
  Boolean(process.env.VERCEL && !process.env.DATABASE_URL);

if (
  typeof window === "undefined" &&
  process.env.NODE_ENV === "production" &&
  isPlaceholderDb &&
  !isBuildPhase
) {
  throw new Error(
    "DATABASE_URL tidak valid atau tidak di-set. Konfigurasi database production wajib diisi sebelum aplikasi berjalan."
  );
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  typeof window !== "undefined"
    ? (null as unknown as PrismaClient)
    : globalForPrisma.prisma ??
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

if (process.env.NODE_ENV !== "production" && typeof window === "undefined") {
  globalForPrisma.prisma = prisma;
}
