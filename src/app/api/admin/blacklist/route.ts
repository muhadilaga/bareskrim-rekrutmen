import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, BlacklistCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminKey } from "@/lib/constants";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

const EntrySchema = z.object({
  category: z.enum(["POLRI", "PENDIDIKAN"]),
  username: z.string().trim().min(1).max(40),
  reason: z.string().trim().max(500).optional().default(""),
});

// Daftar entri blacklist per kategori (POLRI | PENDIDIKAN).
export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  try {
    const entries = await prisma.blacklistEntry.findMany({
      where: category === "POLRI" || category === "PENDIDIKAN" ? { category } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, entries });
  } catch (e) {
    console.error("[admin/blacklist] GET error:", e);
    return NextResponse.json({ ok: true, entries: [] });
  }
}

// Tambah satu entri blacklist.
export async function POST(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = EntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Data blacklist tidak valid." }, { status: 400 });
  }

  try {
    const entry = await prisma.blacklistEntry.create({
      data: {
        category: parsed.data.category as BlacklistCategory,
        username: parsed.data.username,
        reason: parsed.data.reason || null,
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

// Hapus entri blacklist (?id=).
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
    await prisma.blacklistEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: "Entri berhasil dihapus." });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ ok: false, message: "Entri tidak ditemukan." }, { status: 404 });
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
