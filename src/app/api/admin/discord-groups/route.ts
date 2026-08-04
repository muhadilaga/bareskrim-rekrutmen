import { NextResponse } from "next/server";
import { CONFIG, getAdminKey } from "@/lib/constants";

// GET: Lihat server Discord yang diikuti casis (via bot)
// Query: username = Discord username casis
export async function GET(req: Request) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== getAdminKey()) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json(
        { ok: false, message: "username wajib diisi" },
        { status: 400 }
      );
    }

    const botResponse = await fetch(`${CONFIG.discordBotApiUrl}/api/guilds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": CONFIG.discordBotSecret,
      },
      body: JSON.stringify({ userId: username }),
    });

    const result = await botResponse.json();

    if (!botResponse.ok || !result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: result.message ?? "Bot tidak bisa dijangkau. Pastikan bot berjalan di port 3001.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      username: result.username,
      userId: result.userId,
      guilds: result.guilds ?? [],
    });
  } catch (error) {
    console.error("Admin discord groups error:", error);
    return NextResponse.json(
      { ok: false, message: "Bot tidak bisa dijangkau. Pastikan bot berjalan di port 3001." },
      { status: 500 }
    );
  }
}
