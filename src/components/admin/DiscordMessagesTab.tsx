"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToastContext } from "@/components/ui/Toast";

interface DiscordMessage {
  id: string;
  content: string;
  author: string;
  embedTitle: string | null;
  embedDescription: string | null;
  timestamp: string;
}

interface Props {
  headers: Record<string, string>;
}

export function DiscordMessagesTab({ headers }: Props) {
  const [messages, setMessages] = useState<DiscordMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fetched, setFetched] = useState(false);
  const toast = useToastContext();

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/discord/messages?limit=50", { headers });
      const data = await res.json();
      if (data.ok) {
        setMessages(data.messages);
        setFetched(true);
        setSelected(new Set());
      } else {
        toast.error(data.message ?? "Gagal mengambil pesan.");
      }
    } catch {
      toast.error("Gagal mengambil pesan.");
    } finally {
      setLoading(false);
    }
  }, [headers, toast]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === messages.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(messages.map((m) => m.id)));
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Hapus ${selected.size} pesan terpilih dari Discord?\n\nPesan yang dihapus tidak bisa dipulihkan dari panel ini.`)) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/admin/discord/messages", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ messageIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message);
        await fetchMessages();
      } else {
        toast.error([data.message, data.hint].filter(Boolean).join(" — ") || "Gagal menghapus pesan.");
      }
    } catch {
      toast.error("Gagal menghapus pesan.");
    } finally {
      setDeleting(false);
    }
  };

  const deleteAll = async () => {
    if (!confirm("Hapus SEMUA pesan bot dari Discord?\n\nSemua pesan bot yang cocok akan dihapus permanen dari channel. Tindakan ini tidak bisa dibatalkan.")) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/admin/discord/messages", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ deleteAll: true }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(data.message);
        await fetchMessages();
      } else {
        toast.error([data.message, data.hint].filter(Boolean).join(" — ") || "Gagal menghapus pesan.");
      }
    } catch {
      toast.error("Gagal menghapus pesan.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card strong className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold gold-text">💬 Pesan Bot Discord</h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={fetchMessages} disabled={loading}>
            {loading ? "Memuat..." : fetched ? "Muat Ulang" : "Ambil Pesan"}
          </Button>
          {messages.length > 0 && (
            <>
              <Button
                variant="ghost"
                onClick={deleteSelected}
                disabled={deleting || selected.size === 0}
                className="text-red-400 hover:text-red-300"
              >
                {deleting ? "Menghapus..." : `Hapus Terpilih (${selected.size})`}
              </Button>
              <Button
                variant="ghost"
                onClick={deleteAll}
                disabled={deleting}
                className="text-red-400 hover:text-red-300"
              >
                Hapus Semua Bot
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="gold-line my-3" />

      {!fetched && !loading && (
        <p className="text-sm text-zinc-500">
          Klik &quot;Ambil Pesan&quot; untuk melihat 50 pesan bot terbaru di channel Discord. Gunakan ini untuk cek hasil kirim atau bersih-bersih pesan lama.
        </p>
      )}

      {loading && (
        <div className="py-8 text-center text-sm text-zinc-400">Memuat pesan dari Discord...</div>
      )}

      {fetched && messages.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">Tidak ada pesan bot di channel. Kalau seharusnya ada, cek diagnostics Discord dan webhook lalu coba kirim ulang laporan.</p>
      )}

      {messages.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={selectAll}
              className="text-xs text-gold/80 hover:text-gold"
            >
              {selected.size === messages.length ? "Batal Pilih Semua" : "Pilih Semua"}
            </button>
            <span className="text-xs text-zinc-500">{messages.length} pesan bot</span>
          </div>
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {messages.map((m) => (
              <div
                key={m.id}
                onClick={() => toggleSelect(m.id)}
                className={`cursor-pointer rounded-lg border p-3 transition ${
                  selected.has(m.id)
                    ? "border-gold/50 bg-gold/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gold">{m.author}</span>
                      <span className="font-mono text-[10px] text-zinc-600">{m.id}</span>
                    </div>
                    {m.embedTitle && (
                      <p className="mt-1 text-sm font-medium text-zinc-200">{m.embedTitle}</p>
                    )}
                    {m.embedDescription && (
                      <p className="mt-0.5 text-xs text-zinc-400 line-clamp-2">{m.embedDescription}</p>
                    )}
                    {!m.embedTitle && m.content && (
                      <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{m.content}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-zinc-600">
                    {new Date(m.timestamp).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
