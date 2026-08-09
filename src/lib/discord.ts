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
      const shortPrompt = d.prompt.length > 60 ? d.prompt.slice(0, 57) + "..." : d.prompt;
      mcqLines.push(
        `**${i + 1}.** ${shortPrompt}\n↳ \`${d.userAnswer || "-"}\` ${
          d.isCorrect ? "✅" : `(benar: ${d.correctKey}) ❌`
        }`
      );
    });

  const essayLines: string[] = [];
  details
    .filter((d) => d.type === "ESSAY")
    .forEach((d, i) => {
      const shortPrompt = d.prompt.length > 60 ? d.prompt.slice(0, 57) + "..." : d.prompt;
      const shortAnswer = (d.userAnswer || "").length > 40 ? d.userAnswer.slice(0, 37) + "..." : (d.userAnswer || "*(kosong)*");
      essayLines.push(
        `**${i + 1}.** ${shortPrompt}\n↳ ${shortAnswer}`
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
  const targetWebhookUrl = webhookUrl;

  const passed = report.status === "LULUS";
  const color = passed ? 0xd4af37 : 0x7b1113;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "🎖️ Pangkat Grup Kepolisian", value: report.policeRank ?? "Tidak terdeteksi", inline: true },
    { name: "📅 Periode", value: report.periodName, inline: true },
    { name: "📊 Skor Akhir", value: `${report.score}/${report.maxScore}`, inline: true },
    {
      name: `✅ Status KKM (${CONFIG.kkm})`,
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
    // Discord limit: 6000 chars total untuk semua embeds. Sisakan 500 untuk main embed.
    let totalSize = JSON.stringify(embeds).length;
    const allowedRekap = 5500;
    const keptFields: typeof rekapFields = [];
    for (const f of rekapFields) {
      const fieldSize = f.name.length + f.value.length;
      if (totalSize + fieldSize > allowedRekap) break;
      keptFields.push(f);
      totalSize += fieldSize;
    }
    if (keptFields.length) {
      embeds.push({
        title: "📋 Rekap Jawaban (Cross-Check Instruktur)",
        color,
        fields: keptFields,
      });
    }
  }

  const payload: DiscordPayload = {
    username: process.env.DISCORD_BOT_NAME ?? "Sistem Rekrutmen Bareskrim Polri",
    embeds,
  };

  async function postPayload(body: DiscordPayload, signal: AbortSignal) {
    const targetUrl = targetWebhookUrl.includes("?")
      ? `${targetWebhookUrl}&wait=true`
      : `${targetWebhookUrl}?wait=true`;
    return fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    // ?wait=true WAJIB agar Discord mengembalikan objek pesan (berisi id-nya).
    // Tanpa ini Discord membalas 204 No Content (body kosong) sehingga id pesan
    // tidak bisa disimpan dan laporan tidak bisa dihapus nantinya.
    let res = await postPayload(payload, controller.signal);
    if (!res.ok) {
      const errText = await res.text();
      console.error("Discord webhook error", res.status, errText);

      // Fallback aman: jika embed rekap detail ditolak Discord (terlalu besar / invalid),
      // kirim ulang hanya embed utama agar laporan inti tetap masuk channel.
      if (embeds.length > 1 && res.status === 400) {
        const fallbackPayload: DiscordPayload = {
          username: payload.username,
          embeds: [embeds[0]!],
        };
        res = await postPayload(fallbackPayload, controller.signal);
        if (!res.ok) {
          console.error("Discord webhook fallback error", res.status, await res.text());
          return null;
        }
      } else {
        return null;
      }
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

// Kirim notifikasi singkat ke channel instruktur (aksi admin / pengumuman).
// Best-effort: gagal tidak melempar error.
export async function sendAdminNotification(title: string, message: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload: DiscordPayload = {
    username: process.env.DISCORD_BOT_NAME ?? "Sistem Rekrutmen Bareskrim Polri",
    embeds: [
      {
        title,
        description: message,
        color: 0xd4af37,
        timestamp: new Date().toISOString(),
        footer: { text: "Sistem Rekrutmen Bareskrim Polri | Panel Admin" },
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    console.error("Admin notification webhook failed", e);
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
