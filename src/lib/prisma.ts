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

function optimizePrismaUrl(url?: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("pooler.supabase.com")) {
      // 1. Switch port from 5432 (Session mode, limit 15 connections)
      //    to 6543 (Transaction mode, built for serverless, handles 1000+ connections).
      if (parsed.port === "5432") {
        parsed.port = "6543";
      }
      // 2. Transaction mode on PgBouncer requires pgbouncer=true to disable prepared statements.
      parsed.searchParams.set("pgbouncer", "true");
      // 3. In serverless functions, limit connection count to 1 per lambda.
      parsed.searchParams.set("connection_limit", "1");
      if (!parsed.searchParams.has("pool_timeout")) {
        parsed.searchParams.set("pool_timeout", "10");
      }
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
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
            // Production: terjaga oleh guard di atas dan dioptimasi untuk serverless pooler.
            url: optimizePrismaUrl(rawUrl) || "postgresql://placeholder:***@localhost:5432/placeholder",
          },
        },
      });

if (typeof window === "undefined") {
  globalForPrisma.prisma = prisma;
}
