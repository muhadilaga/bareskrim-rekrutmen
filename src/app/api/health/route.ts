import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Cek database connection
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        database: "disconnected",
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
