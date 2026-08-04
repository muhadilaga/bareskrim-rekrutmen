export const CONFIG = {
  kkm: Number(process.env.KKM ?? 70),
  mcqCount: Number(process.env.MCQ_COUNT ?? 15),
  essayCount: Number(process.env.ESSAY_COUNT ?? 5),
  mcqPoints: Number(process.env.MCQ_POINTS ?? 4),
  essayPoints: Number(process.env.ESSAY_POINTS ?? 8),
  examDurationMinutes: Number(process.env.EXAM_DURATION_MINUTES ?? 45),
  requiredGroupId: Number(process.env.REQUIRED_GROUP_ID ?? 11902409),
  requiredGroupName: process.env.REQUIRED_GROUP_NAME ?? "[RI] Republic Indonesia",
  policeGroupId: Number(process.env.POLICE_GROUP_ID ?? 17166238),
  policeGroupName: process.env.POLICE_GROUP_NAME ?? "Kepolisian",
  minPoliceRank: Number(process.env.MIN_POLICE_RANK ?? 225),
  minPoliceRankName: process.env.MIN_POLICE_RANK_NAME ?? "Bhayangkara Kepala",
  bannedGroupIds: (process.env.BANNED_GROUP_IDS ?? "367050757,34766643")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0),
  bannedGroupNames: (process.env.BANNED_GROUP_NAMES ?? "TNI AD,TNI AL")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // Discord Bot API
  discordBotApiUrl: process.env.DISCORD_BOT_API_URL ?? "http://localhost:3001",
  discordBotSecret: process.env.DISCORD_BOT_SECRET ?? "BareskrimBotSecret2026",
  tahapAkademikRoleId: process.env.TAHAP_AKADEMIK_ROLE_ID ?? "",
  // Discord REST API (langsung dari Vercel, tanpa bot server)
  discordBotToken: process.env.DISCORD_BOT_TOKEN ?? "",
  discordGuildId: process.env.DISCORD_GUILD_ID ?? "",
  discordChannelId: process.env.DISCORD_CHANNEL_ID ?? "",
} as const;

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
