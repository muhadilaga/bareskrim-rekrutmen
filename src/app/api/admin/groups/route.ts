import { NextResponse } from "next/server";
import { getAdminKey } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { getUserGroups } from "@/lib/roblox";

// GET: Lihat daftar grup yang diikuti casis (berdasarkan robloxId atau userId)
export async function GET(req: Request) {
  try {
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== getAdminKey()) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const robloxId = searchParams.get("robloxId");
    const userId = searchParams.get("userId");

    if (!robloxId && !userId) {
      return NextResponse.json(
        { ok: false, message: "robloxId atau userId wajib diisi" },
        { status: 400 }
      );
    }

    let targetRobloxId = robloxId;
    if (!targetRobloxId && userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { robloxId: true },
      });
      if (!user) {
        return NextResponse.json({ ok: false, message: "User tidak ditemukan." }, { status: 404 });
      }
      targetRobloxId = String(user.robloxId);
    }

    const groups = await getUserGroups(Number(targetRobloxId));

    return NextResponse.json({
      ok: true,
      groups: groups.map((g) => ({
        groupId: g.groupId,
        groupName: g.groupName,
        roleName: g.roleName,
        roleRank: g.roleRank,
        isPrimary: g.isPrimary,
      })),
    });
  } catch (error) {
    console.error("Admin list groups error:", error);
    return NextResponse.json(
      { ok: false, message: "Gagal memuat daftar grup." },
      { status: 500 }
    );
  }
}
