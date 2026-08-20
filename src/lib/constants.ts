let runtimeSettings: Partial<{
  kkm: number;
  examDurationMinutes: number;
  minPoliceRank: number;
  requiredGroupId: number;
  requiredGroupName: string;
  policeGroupId: number;
  policeGroupName: string;
  bannedGroupIds: number[];
  bannedGroupNames: string[];
  tahapAkademikRoleId: string;
  tahapInterviewRoleId: string;
  discordBotToken: string;
  discordGuildId: string;
  discordChannelId: string;
  discordBotApiUrl: string;
  discordBotSecret: string;
  discordWebhookUrl: string;
  discordBlacklistPendidikanChannelId: string;
}> = {};

function cleanEnvString(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getEnvOrRuntime<T>(key: keyof typeof runtimeSettings, envValue: T): T {
  const runtime = runtimeSettings[key];
  return runtime !== undefined ? (runtime as T) : envValue;
}

function buildConfig() {
  return {
    kkm: getEnvOrRuntime("kkm", Number(process.env.KKM ?? 70)),
    mcqCount: Number(process.env.MCQ_COUNT ?? 15),
    essayCount: Number(process.env.ESSAY_COUNT ?? 5),
    mcqPoints: Number(process.env.MCQ_POINTS ?? 4),
    essayPoints: Number(process.env.ESSAY_POINTS ?? 8),
    examDurationMinutes: getEnvOrRuntime("examDurationMinutes", Number(process.env.EXAM_DURATION_MINUTES ?? 45)),
    requiredGroupId: getEnvOrRuntime("requiredGroupId", Number(process.env.REQUIRED_GROUP_ID ?? 11902409)),
    requiredGroupName: getEnvOrRuntime("requiredGroupName", process.env.REQUIRED_GROUP_NAME ?? "[RI] Republic Indonesia"),
    policeGroupId: getEnvOrRuntime("policeGroupId", Number(process.env.POLICE_GROUP_ID ?? 17166238)),
    policeGroupName: getEnvOrRuntime("policeGroupName", process.env.POLICE_GROUP_NAME ?? "Kepolisian"),
    minPoliceRank: getEnvOrRuntime("minPoliceRank", Number(process.env.MIN_POLICE_RANK ?? 225)),
    minPoliceRankName: process.env.MIN_POLICE_RANK_NAME ?? "Bhayangkara Kepala",
    bannedGroupIds: getEnvOrRuntime("bannedGroupIds", (process.env.BANNED_GROUP_IDS ?? "367050757,34766643")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n) && n > 0)),
    bannedGroupNames: getEnvOrRuntime("bannedGroupNames", (process.env.BANNED_GROUP_NAMES ?? "TNI AD,TNI AL")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)),
    // Discord Bot API
    discordBotApiUrl: getEnvOrRuntime("discordBotApiUrl", cleanEnvString(process.env.DISCORD_BOT_API_URL) || "http://localhost:3001"),
    discordBotSecret: getEnvOrRuntime("discordBotSecret", cleanEnvString(process.env.DISCORD_BOT_SECRET) || "BareskrimBotSecret2026"),
    tahapAkademikRoleId: getEnvOrRuntime("tahapAkademikRoleId", cleanEnvString(process.env.TAHAP_AKADEMIK_ROLE_ID)),
    tahapInterviewRoleId: getEnvOrRuntime("tahapInterviewRoleId", cleanEnvString(process.env.TAHAP_INTERVIEW_ROLE_ID)),
    // Discord REST API (langsung dari server, tanpa bot server)
    discordBotToken: getEnvOrRuntime("discordBotToken", cleanEnvString(process.env.DISCORD_BOT_TOKEN)),
    discordGuildId: getEnvOrRuntime("discordGuildId", cleanEnvString(process.env.DISCORD_GUILD_ID)),
    discordChannelId: getEnvOrRuntime("discordChannelId", cleanEnvString(process.env.DISCORD_CHANNEL_ID)),
    discordWebhookUrl: getEnvOrRuntime("discordWebhookUrl", cleanEnvString(process.env.DISCORD_WEBHOOK_URL)),
    discordBlacklistPendidikanChannelId: getEnvOrRuntime(
      "discordBlacklistPendidikanChannelId",
      cleanEnvString(process.env.DISCORD_BLACKLIST_PENDIDIKAN_CHANNEL_ID)
    ),
  } as const;
}

export function getConfig() {
  return buildConfig();
}

// Backward compatibility - CONFIG object (evaluated at import time, may be stale after settings update)
export const CONFIG = buildConfig();

export const REDIRECT_BLOCKED_MESSAGE =
  "Mohon maaf, Anda tidak dapat mengakses soal ujian rekrutmen Bareskrim Polri karena terdaftar sebagai anggota matra lain (AD/AL).";

// Fallback HANYA untuk pengembangan lokal (dev/test).
// Di production, rahasia WAJIB berasal dari environment variable.
function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

const JWT_SECRET_FALLBACK =
  "RahasiaBareskrimRecruitment2026-9f8a7s6d5f4g3h2j1k0l";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction()) {
    throw new Error("JWT_SECRET wajib diisi (min. 32 karakter) di environment production.");
  }
  return JWT_SECRET_FALLBACK;
}

const ADMIN_KEY_FALLBACK = "AdminBareskrim2026";

export function getAdminKey(): string {
  const key = process.env.ADMIN_KEY;
  if (key && key.length > 0) return key;
  if (isProduction()) {
    throw new Error("ADMIN_KEY wajib diisi di environment production.");
  }
  return ADMIN_KEY_FALLBACK;
}

export function getSettings() {
  const cfg = buildConfig();
  return {
    kkm: cfg.kkm,
    examDurationMinutes: cfg.examDurationMinutes,
    minPoliceRank: cfg.minPoliceRank,
    requiredGroupId: cfg.requiredGroupId,
    requiredGroupName: cfg.requiredGroupName,
    policeGroupId: cfg.policeGroupId,
    policeGroupName: cfg.policeGroupName,
    bannedGroupIds: cfg.bannedGroupIds,
    bannedGroupNames: cfg.bannedGroupNames,
    tahapAkademikRoleId: cfg.tahapAkademikRoleId,
    tahapInterviewRoleId: cfg.tahapInterviewRoleId,
    discordBotToken: cfg.discordBotToken,
    discordGuildId: cfg.discordGuildId,
    discordChannelId: cfg.discordChannelId,
    discordBotApiUrl: cfg.discordBotApiUrl,
    discordBotSecret: cfg.discordBotSecret,
    discordWebhookUrl: cfg.discordWebhookUrl,
    discordBlacklistPendidikanChannelId: cfg.discordBlacklistPendidikanChannelId,
  };
}

export function updateSettings(updates: Record<string, unknown>) {
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    (runtimeSettings as Record<string, unknown>)[key] = value;
  }
  return getSettings();
}