import { prisma } from "@/lib/prisma";

export interface MotivationEvaluation {
  status: "APPROVED" | "REVIEW";
  roleEligible: boolean;
  reason: string;
}

/**
 * Menilai kelayakan motivasi casis secara otomatis.
 * Motivasi yang masuk akal dan jelas (panjang memadai, bukan spam berulang)
 * otomatis berhak mendapatkan status Tahap Akademik.
 */
export function evaluateMotivation(text: string): MotivationEvaluation {
  const cleaned = (text ?? "").trim();

  if (cleaned.length < 20) {
    return {
      status: "REVIEW",
      roleEligible: false,
      reason: "Motivasi terlalu singkat (minimal 20 karakter). Jelaskan alasan Anda ingin bergabung.",
    };
  }

  const words = cleaned.split(/\s+/).filter((w) => w.length > 1);
  if (words.length < 4) {
    return {
      status: "REVIEW",
      roleEligible: false,
      reason: "Motivasi kurang lengkap (minimal 4 kata). Jelaskan motivasi Anda dengan lebih detail.",
    };
  }

  // Deteksi pengulangan kata spam (contoh: "tes tes tes tes")
  const lowerWords = words.map((w) => w.toLowerCase());
  const uniqueWords = new Set(lowerWords);
  if (words.length >= 4 && uniqueWords.size <= 2) {
    return {
      status: "REVIEW",
      roleEligible: false,
      reason: "Motivasi terdeteksi berulang. Mohon sampaikan motivasi yang bermakna dan jelas.",
    };
  }

  // Deteksi karakter berulang (contoh: "aaaaaaa", "asdfasdf")
  if (/(.)\1{5,}/.test(cleaned)) {
    return {
      status: "REVIEW",
      roleEligible: false,
      reason: "Motivasi mengandung karakter berulang. Gunakan kalimat yang wajar.",
    };
  }

  return {
    status: "APPROVED",
    roleEligible: true,
    reason: "Motivasi memenuhi kriteria tahap akademik (otomatis).",
  };
}

export interface WhitelistCheckResult {
  allowed: boolean;
  blockReason?: string;
  user?: any;
  application?: any;
}

/**
 * Memeriksa apakah calon siswa terdaftar dalam daftar casis / whitelist
 * dan tidak terhalang oleh Blacklist (POLRI/PENDIDIKAN) atau Putusan Sidang.
 */
export async function verifyCandidateWhitelist(robloxUsername: string): Promise<WhitelistCheckResult> {
  const trimmed = robloxUsername.trim();
  const lowerKey = trimmed.toLowerCase();

  // 1. Cek Blacklist
  const blacklist = await prisma.blacklistEntry.findFirst({
    where: {
      username: { equals: trimmed, mode: "insensitive" },
      category: { in: ["POLRI", "PENDIDIKAN"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (blacklist) {
    const label = blacklist.category === "PENDIDIKAN" ? "blacklist pendidikan" : "blacklist Polri";
    return {
      allowed: false,
      blockReason: `Akses ditolak: nama Anda terdaftar dalam ${label}.`,
    };
  }

  // 2. Cek Verdict TIDAK_LULUS
  const verdict = await prisma.verdictEntry.findFirst({
    where: {
      username: { equals: trimmed, mode: "insensitive" },
      status: "TIDAK_LULUS",
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (verdict) {
    return {
      allowed: false,
      blockReason: "Akses ditolak: putusan sidang Anda berstatus TIDAK LULUS.",
    };
  }

  // 3. Cek User dan Application (daftar casis)
  const [existingUser, existingApp] = await Promise.all([
    prisma.user.findFirst({
      where: {
        username: { equals: trimmed, mode: "insensitive" },
        deletedAt: null,
      },
    }),
    prisma.application.findFirst({
      where: {
        robloxUsernameKey: lowerKey,
        deletedAt: null,
      },
      include: {
        recruitmentPeriod: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!existingUser && !existingApp) {
    return {
      allowed: false,
      blockReason: `Nama Roblox '@${trimmed}' belum terdaftar dalam daftar casis Bareskrim. Pastikan Anda telah terdaftar atau hubungi instruktur/personel Pusdik.`,
    };
  }

  return {
    allowed: true,
    user: existingUser,
    application: existingApp,
  };
}
