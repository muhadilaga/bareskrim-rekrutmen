import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminKey, getSettings, updateSettings } from "@/lib/constants";
import { logAdminAction } from "@/lib/audit";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

function isAdmin(req: Request): boolean {
  return req.headers.get("x-admin-key") === getAdminKey();
}

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const emptyToUndefined = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}, z.string().url().optional());

const anyToString = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  return String(v);
}, z.string().optional());

const anyToNumber = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}, z.number().int().optional());

const anyToStringArray = z.preprocess((v) => {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
  return v;
}, z.array(z.string()).optional());

const SettingsSchema = z.object({
  kkm: anyToNumber,
  examDurationMinutes: anyToNumber,
  minPoliceRank: anyToNumber,
  requiredGroupId: anyToString,
  policeGroupId: anyToString,
  bannedGroupIds: anyToStringArray,
  tahapAkademikRoleId: anyToString,
  tahapInterviewRoleId: anyToString,
  discordBotToken: anyToString,
  discordBotSecret: anyToString,
  discordGuildId: anyToString,
  discordWebhookUrl: emptyToUndefined,
  discordBotApiUrl: emptyToUndefined,
});

export async function GET(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ ok: false, message: "Tidak diizinkan." }, { status: 401 });
  }

  const settings = getSettings();
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

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
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
  if (d.discordWebhookUrl !== undefined) updates.discordWebhookUrl = d.discordWebhookUrl;
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
      settings: updated,
    });
  } catch (e) {
    console.error("Settings update error:", e);
    return NextResponse.json({ ok: false, message: "Gagal memperbarui pengaturan." }, { status: 500 });
  }
}
