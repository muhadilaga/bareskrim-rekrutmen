import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, VerdictStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminKey } from "@/lib/constants";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

const VerdictSchema = z.object({
  username: z.string().trim().min(1).max(40),
  status: z.enum(["LULUS", "TIDAK_LULUS"]),
  note: z.string().trim().max(500).optional().default(""),
});

// Daftar putusan sidang.
export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  try {
    const entries = await prisma.verdictEntry.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ ok: true, entries });
  } catch (e) {
    console.error("[admin/verdicts] GET error:", e);
    return NextResponse.json({ ok: true, entries: [] });
  }
}

// Tambah satu putusan sidang.
export async function POST(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = VerdictSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Data putusan tidak valid." }, { status: 400 });
  }

  try {
    const entry = await prisma.verdictEntry.create({
      data: {
        username: parsed.data.username,
        status: parsed.data.status as VerdictStatus,
        note: parsed.data.note || null,
      },
    });
    return NextResponse.json({ ok: true, entry });
  } catch (e) {
    if (isTableMissing(e)) {
      return NextResponse.json(
        { ok: false, message: "Database belum diinisialisasi. Klik tombol Initialize Database dulu." },
        { status: 409 }
      );
    }
    throw e;
  }
}

// Hapus putusan (?id=).
export async function DELETE(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, message: "ID tidak valid." }, { status: 400 });
  }

  try {
    await prisma.verdictEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: "Putusan berhasil dihapus." });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ ok: false, message: "Putusan tidak ditemukan." }, { status: 404 });
    }
    if (isTableMissing(e)) {
      return NextResponse.json({ ok: false, message: "Database belum diinisialisasi." }, { status: 409 });
    }
    throw e;
  }
}

function isTableMissing(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021";
}
