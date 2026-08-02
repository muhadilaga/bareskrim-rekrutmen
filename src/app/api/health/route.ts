import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BUILD_TAG = "v6";

export async function GET() {
  let db: "ok" | "error" = "ok";
  let dbDetail = "";
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'ExamResult'
       ) AS ok`
    );
    const exists = (rows as Array<{ ok: boolean }>)[0]?.ok === true;
    dbDetail = exists ? "tables-ok" : "tables-missing";
  } catch (e) {
    db = "error";
    dbDetail = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  return NextResponse.json({
    ok: true,
    build: BUILD_TAG,
    service: "bareskrim-rekrutmen",
    db,
    dbDetail,
    time: new Date().toISOString(),
  });
}
