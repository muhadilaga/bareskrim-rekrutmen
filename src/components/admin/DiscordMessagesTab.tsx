"use client";

import { useCallback, useState } from "react";
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
    <article className="panel-card !p-6 sm:!p-8">
      {/* Panel Heading Prototype */}
      <div className="panel-heading !pb-4">
        <div>
          <span className="section-kicker">COMMUNICATION</span>
          <h2 className="font-serif">Pesan Bot Discord</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Pantau dan bersihkan pesan bot penerimaan pada channel Discord resmi Pusdik Reserse.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="outline-button !min-h-[40px] px-4 text-xs font-semibold"
            onClick={fetchMessages}
            disabled={loading}
          >
            {loading ? "Memuat..." : fetched ? "Muat Ulang" : "Ambil Pesan"}
          </button>
          {messages.length > 0 && (
            <>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={deleting || selected.size === 0}
                className="reject-button !min-h-[40px] px-4 text-xs font-semibold"
              >
                {deleting ? "Menghapus..." : `Hapus Terpilih (${selected.size})`}
              </button>
              <button
                type="button"
                onClick={deleteAll}
                disabled={deleting}
                className="reject-button !min-h-[40px] px-4 text-xs font-semibold"
              >
                Hapus Semua Bot
              </button>
            </>
          )}
        </div>
      </div>

      {!fetched && !loading && (
        <div className="empty-panel !min-h-[220px]">
          <p className="mt-4 text-sm text-[var(--muted)]">
            Klik &quot;Ambil Pesan&quot; untuk melihat 50 pesan bot terbaru di channel Discord.
            Gunakan fitur ini untuk verifikasi pengiriman laporan atau membersihkan pesan berkala.
          </p>
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-sm text-[var(--muted)]">
          Memuat pesan dari Discord...
        </div>
      )}

      {fetched && messages.length === 0 && (
        <div className="empty-panel !min-h-[200px]">
          <p className="text-sm text-[var(--muted)]">
            Tidak ada pesan bot di channel. Kalau seharusnya ada, cek diagnostics Discord dan webhook lalu coba kirim ulang laporan.
          </p>
        </div>
      )}

      {messages.length > 0 && (
        <>
          <div className="my-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] transition"
            >
              {selected.size === messages.length ? "Batal Pilih Semua" : "Pilih Semua"}
            </button>
            <span className="panel-count">{messages.length} pesan bot</span>
          </div>

          <div className="max-h-[500px] space-y-2.5 overflow-y-auto pr-1">
            {messages.map((m) => (
              <div
                key={m.id}
                onClick={() => toggleSelect(m.id)}
                className={`cursor-pointer rounded-[3px] border p-3.5 transition ${
                  selected.has(m.id)
                    ? "border-[var(--red)]/60 bg-[var(--surface-3)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#68b478]">{m.author}</span>
                      <span className="font-mono text-[10px] text-[var(--muted-2)]">{m.id}</span>
                    </div>
                    {m.embedTitle && (
                      <p className="mt-1 text-sm font-semibold text-[var(--text)]">{m.embedTitle}</p>
                    )}
                    {m.embedDescription && (
                      <p className="mt-0.5 text-xs text-[var(--muted)] line-clamp-2">{m.embedDescription}</p>
                    )}
                    {!m.embedTitle && m.content && (
                      <p className="mt-1 text-xs text-[var(--muted)] line-clamp-2">{m.content}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-[var(--muted-2)]">
                    {new Date(m.timestamp).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
