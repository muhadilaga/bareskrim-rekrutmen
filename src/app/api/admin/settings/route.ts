import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminKey, getSettings, updateSettings } from "@/lib/constants";
import { logAdminAction } from "@/lib/audit";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const SettingsSchema = z.object({
  kkm: z.number().int().min(1).max(1000).optional(),
  examDurationMinutes: z.number().int().min(5).max(300).optional(),
  minPoliceRank: z.number().int().min(1).max(255).optional(),
  requiredGroupId: z.string().optional(),
  policeGroupId: z.string().optional(),
  bannedGroupIds: z.array(z.string()).optional(),
  tahapAkademikRoleId: z.string().optional(),
  tahapInterviewRoleId: z.string().optional(),
  discordBotToken: z.string().optional(),
  discordBotSecret: z.string().optional(),
  discordGuildId: z.string().optional(),
  discordWebhookUrl: z.string().url().optional().nullable(),
  discordBotApiUrl: z.string().url().optional(),
});

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const settings = getSettings();
  // Mask sensitive values
  const masked = {
    ...settings,
    discordBotToken: settings.discordBotToken ? "••••••••" : "",
    discordBotSecret: settings.discordBotSecret ? "••••••••" : "",
    discordWebhookUrl: settings.discordWebhookUrl ? "••••••••" : "",
  };

  return NextResponse.json({ ok: true, settings: masked });
}

export async function PATCH(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }
  const limited = adminLimiter.check(clientIp(req));
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, message: "Terlalu banyak permintaan. Coba lagi nanti." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Data pengaturan tidak valid." }, { status: 400 });
  }

  // Bangun objek update secara eksplisit (hindari null pada field string)
  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.kkm !== undefined) updates.kkm = d.kkm;
  if (d.examDurationMinutes !== undefined) updates.examDurationMinutes = d.examDurationMinutes;
  if (d.minPoliceRank !== undefined) updates.minPoliceRank = d.minPoliceRank;
  if (d.requiredGroupId !== undefined) updates.requiredGroupId = Number(d.requiredGroupId);
  if (d.policeGroupId !== undefined) updates.policeGroupId = Number(d.policeGroupId);
  if (d.bannedGroupIds !== undefined) updates.bannedGroupIds = d.bannedGroupIds.map(Number).filter((n) => !Number.isNaN(n));
  if (d.tahapAkademikRoleId !== undefined) updates.tahapAkademikRoleId = d.tahapAkademikRoleId;
  if (d.tahapInterviewRoleId !== undefined) updates.tahapInterviewRoleId = d.tahapInterviewRoleId;
  if (d.discordBotToken !== undefined && d.discordBotToken.length > 0) updates.discordBotToken = d.discordBotToken;
  if (d.discordBotSecret !== undefined && d.discordBotSecret.length > 0) updates.discordBotSecret = d.discordBotSecret;
  if (d.discordGuildId !== undefined) updates.discordGuildId = d.discordGuildId;
  if (d.discordWebhookUrl) updates.discordWebhookUrl = d.discordWebhookUrl;
  if (d.discordBotApiUrl !== undefined) updates.discordBotApiUrl = d.discordBotApiUrl;

  try {
    const oldSettings = getSettings();
    const updated = updateSettings(updates);
    
    await logAdminAction({
      action: "UPDATE_SETTINGS",
      target: "system",
      detail: {
        changed: Object.keys(parsed.data),
        old: {
          kkm: oldSettings.kkm,
          examDurationMinutes: oldSettings.examDurationMinutes,
          minPoliceRank: oldSettings.minPoliceRank,
          requiredGroupId: oldSettings.requiredGroupId,
          policeGroupId: oldSettings.policeGroupId,
          bannedGroupIds: oldSettings.bannedGroupIds,
          tahapAkademikRoleId: oldSettings.tahapAkademikRoleId,
          tahapInterviewRoleId: oldSettings.tahapInterviewRoleId,
          discordBotApiUrl: oldSettings.discordBotApiUrl,
        },
        new: {
          kkm: updated.kkm,
          examDurationMinutes: updated.examDurationMinutes,
          minPoliceRank: updated.minPoliceRank,
          requiredGroupId: updated.requiredGroupId,
          policeGroupId: updated.policeGroupId,
          bannedGroupIds: updated.bannedGroupIds,
          tahapAkademikRoleId: updated.tahapAkademikRoleId,
          tahapInterviewRoleId: updated.tahapInterviewRoleId,
          discordBotApiUrl: updated.discordBotApiUrl,
        },
      },
    });

    return NextResponse.json({ 
      ok: true, 
      message: "Pengaturan berhasil diperbarui. Beberapa perubahan memerlukan restart server.",
      settings: updated 
    });
  } catch (e) {
    console.error("Settings update error:", e);
    return NextResponse.json(
      { ok: false, message: "Gagal memperbarui pengaturan." },
      { status: 500 }
    );
  }
}