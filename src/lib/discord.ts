// ============================================================
// Discord Webhook - Channel Pusdik Instruktur
// Kirim laporan real-time begitu casis submit ujian.
// ============================================================

import { CONFIG } from "@/lib/constants";
import type { GradedAnswerDetail } from "@/lib/grading";

export interface DiscordPayload {
  username?: string;
  avatar_url?: string;
  embeds: Array<Record<string, unknown>>;
}

function chunkText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");
  let current = "";
  for (const line of lines) {
    if ((current + line).length > maxLen) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function buildRekapFields(details: GradedAnswerDetail[]) {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  const mcqLines: string[] = [];
  details
    .filter((d) => d.type === "MCQ")
    .forEach((d, i) => {
      mcqLines.push(
        `**${i + 1}.** ${d.prompt}\n↳ Jawaban: \`${d.userAnswer || "-"}\` ${
          d.isCorrect ? "✅" : `(Benar: ${d.correctKey}) ❌`
        }`
      );
    });

  const essayLines: string[] = [];
  details
    .filter((d) => d.type === "ESSAY")
    .forEach((d, i) => {
      essayLines.push(
        `**${i + 1}.** ${d.prompt}\n↳ ${d.userAnswer || "*(kosong)*"}`
      );
    });

  if (mcqLines.length) {
    chunkText(mcqLines.join("\n"), 1024).forEach((c, i) =>
      fields.push({
        name: i === 0 ? "📝 Pilihan Ganda" : "📝 Pilihan Ganda (lanjutan)",
        value: c,
      })
    );
  }

  if (essayLines.length) {
    chunkText(essayLines.join("\n"), 1024).forEach((c, i) =>
      fields.push({
        name: i === 0 ? "✍️ Essay" : "✍️ Essay (lanjutan)",
        value: c,
      })
    );
  }

  return fields;
}

export interface ExamReportInput {
  username: string;
  displayName: string;
  robloxId: number;
  avatarUrl: string | null;
  policeRank: string | null;
  score: number;
  maxScore: number;
  mcqScore: number;
  essayScore: number;
  status: string;
  periodName: string;
  details: GradedAnswerDetail[];
}

export async function sendDiscordExamReport(report: ExamReportInput): Promise<string | null> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return null;

  const passed = report.status === "LULUS";
  const color = passed ? 0xd4af37 : 0x7b1113;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "🎖️ Pangkat Grup Kepolisian", value: report.policeRank ?? "Tidak terdeteksi", inline: true },
    { name: "📅 Periode", value: report.periodName, inline: true },
    { name: "📊 Skor Akhir", value: `${report.score}/${report.maxScore}`, inline: true },
    {
      name: "✅ Status KKM (75)",
      value: passed
        ? "**LULUS KKM** 🟢"
        : "**TIDAK LULUS** 🔴",
      inline: true,
    },
    { name: "🅰️ Nilai MCQ", value: `${report.mcqScore} poin`, inline: true },
    { name: "✍️ Nilai Essay", value: `${report.essayScore} poin`, inline: true },
  ];

  const embeds: Array<Record<string, unknown>> = [
    {
      title: "🧾 Laporan Hasil Ujian Rekrutmen Bareskrim Polri",
      color,
      description: `${report.displayName} (@${report.username}) telah menyelesaikan ujian.`,
      thumbnail: report.avatarUrl ? { url: report.avatarUrl } : undefined,
      url: `https://www.roblox.com/users/${report.robloxId}/profile`,
      fields,
      footer: { text: "Sistem Rekrutmen Bareskrim Polri | Auto-Grading Server-Side" },
      timestamp: new Date().toISOString(),
    },
  ];

  // Rekap jawaban dalam embed terpisah agar muat
  const rekapFields = buildRekapFields(report.details);
  if (rekapFields.length) {
    embeds.push({
      title: "📋 Rekap Jawaban (Cross-Check Instruktur)",
      color,
      fields: rekapFields,
    });
  }

  const payload: DiscordPayload = {
    username: process.env.DISCORD_BOT_NAME ?? "Sistem Rekrutmen Bareskrim Polri",
    embeds,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    // ?wait=true WAJIB agar Discord mengembalikan objek pesan (berisi id-nya).
    // Tanpa ini Discord membalas 204 No Content (body kosong) sehingga id pesan
    // tidak bisa disimpan dan laporan tidak bisa dihapus nantinya.
    const targetUrl = webhookUrl.includes("?")
      ? `${webhookUrl}&wait=true`
      : `${webhookUrl}?wait=true`;
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("Discord webhook error", res.status, await res.text());
      return null;
    }
    const text = await res.text();
    const data = text ? (JSON.parse(text) as { id?: string }) : null;
    if (data?.id) {
      console.log(`[discord-send] messageId=${data.id} (username=${report.username})`);
    }
    return data?.id ?? null;
  } catch (e) {
    console.error("Discord webhook failed", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Hapus laporan yang sudah dikirim ke channel pusdik.
// Dipanggil saat rekap nilai dihapus di panel admin.
export interface DiscordDeleteResult {
  ok: boolean;
  status?: number;
  note?: string;
}

export async function deleteDiscordExamReport(messageId: string): Promise<DiscordDeleteResult> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || !messageId) {
    return { ok: false, note: "webhook URL atau message ID kosong" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${webhookUrl}/messages/${messageId}`, {
      method: "DELETE",
      signal: controller.signal,
    });
    if (res.status === 204) return { ok: true, status: 204 };
    if (res.status === 404) {
      return {
        ok: true,
        status: 404,
        note: "pesan tidak ditemukan (sudah terhapus, atau pesan dikirim oleh webhook lain)",
      };
    }
    console.error("Discord delete error", res.status, await res.text());
    return { ok: false, status: res.status };
  } catch (e) {
    console.error("Discord delete failed", e);
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
