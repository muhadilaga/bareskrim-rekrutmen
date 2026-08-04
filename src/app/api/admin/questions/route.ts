import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, QuestionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminKey } from "@/lib/constants";
import { logAdminAction } from "@/lib/audit";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

const CreateQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("MCQ"),
    prompt: z.string().trim().min(3),
    options: z.array(z.string().trim().min(1)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    points: z.number().int().min(1).max(10).default(4),
  }),
  z.object({
    type: z.literal("ESSAY"),
    prompt: z.string().trim().min(3),
    keywords: z.array(z.string().trim().min(1)).min(1).max(8).default([]),
    points: z.number().int().min(1).max(10).default(8),
  }),
]);

const letters = ["A", "B", "C", "D", "E", "F"];

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }
  try {
    const questions = await prisma.question.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ ok: true, questions });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      return NextResponse.json({ ok: true, questions: [] });
    }
    throw e;
  }
}

function isTableMissing(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021";
}

export async function POST(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Data soal tidak valid." }, { status: 400 });
  }

  const data = parsed.data;
  if (data.type === "MCQ" && data.correctIndex >= data.options.length) {
    return NextResponse.json({ ok: false, message: "Indeks jawaban benar di luar jangkauan." }, { status: 400 });
  }

  try {
    const question =
      data.type === "MCQ"
        ? await prisma.question.create({
            data: {
              type: QuestionType.MCQ,
              prompt: data.prompt,
              options: data.options.map((text, idx) => ({ key: letters[idx], text })),
              correctKey: letters[data.correctIndex],
              points: data.points,
            },
          })
        : await prisma.question.create({
            data: {
              type: QuestionType.ESSAY,
              prompt: data.prompt,
              keywords: data.keywords,
              points: data.points,
            },
          });

    await logAdminAction({
      action: "TAMBAH_SOAL",
      target: data.type === "MCQ" ? "MCQ" : "ESSAY",
      detail: { points: data.points },
    });

    return NextResponse.json({ ok: true, question });
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
