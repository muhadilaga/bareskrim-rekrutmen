import { NextResponse } from "next/server";
import { getSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const content = await getSiteContent();
    return NextResponse.json({
      success: true,
      content,
    });
  } catch (error) {
    console.error("GET /api/public/content error:", error);
    return NextResponse.json(
      { success: false, message: "Gagal mengambil konten website." },
      { status: 500 }
    );
  }
}
