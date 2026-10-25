import { NextResponse } from "next/server";
import { destroySessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await destroySessionCookie();
  const url = new URL("/", req.url);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: Request) {
  await destroySessionCookie();
  const url = new URL("/", req.url);
  return NextResponse.redirect(url, { status: 303 });
}
