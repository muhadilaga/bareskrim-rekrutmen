"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToastContext } from "@/components/ui/Toast";

interface BlacklistTabProps {
  headers: Record<string, string>;
}

interface BlacklistEntryItem {
  id: string;
  category: "POLRI" | "PENDIDIKAN";
  username: string;
  reason: string | null;
  createdAt: string;
}

interface VerdictItem {
  id: string;
  username: string;
  status: "LULUS" | "TIDAK_LULUS";
  note: string | null;
  createdAt: string;
}

type SubTab = "putusan" | "polri" | "pendidikan";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID");
}

export function BlacklistTab({ headers }: BlacklistTabProps) {
  const [subTab, setSubTab] = useState<SubTab>("putusan");
  const [verdicts, setVerdicts] = useState<VerdictItem[]>([]);
  const [polri, setPolri] = useState<BlacklistEntryItem[]>([]);
  const [pendidikan, setPendidikan] = useState<BlacklistEntryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toast = useToastContext();

  const [channelRefs, setChannelRefs] = useState<{
    guildId: string | null;
    putusan: string | null;
    polri: string | null;
    pendidikan: string | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/channel-refs", { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.ok) setChannelRefs(j);
      })
      .catch(() => {});
  }, [headers]);

  function discordChannelLink(channelId: string | null): string | null {
    if (!channelId || !channelRefs?.guildId) return null;
    return `https://discord.com/channels/${channelRefs.guildId}/${channelId}`;
  }

  const loadAll = useCallback(async () => {
    const [v, p, pd] = await Promise.all([
      fetch("/api/admin/verdicts", { headers }),
      fetch("/api/admin/blacklist?category=POLRI", { headers }),
      fetch("/api/admin/blacklist?category=PENDIDIKAN", { headers }),
    ]);
    const vj = await v.json();
    const pj = await p.json();
    const pdj = await pd.json();
    setVerdicts(vj.entries ?? []);
    setPolri(pj.entries ?? []);
    setPendidikan(pdj.entries ?? []);
  }, [headers]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function run(op: () => Promise<Response>, thenLoad: boolean) {
    setBusy(true);
    setMsg(null);
    const res = await op();
    const json = await res.json();
    setMsg({ ok: json.ok, text: json.message ?? (res.ok ? "Berhasil." : "Terjadi kesalahan.") });
    if (json.ok) {
      toast.success(json.message ?? "Berhasil.");
      if (thenLoad) await loadAll();
    } else {
      toast.error(json.message ?? "Terjadi kesalahan.");
    }
    setBusy(false);
  }

  const addBlacklist = (category: "POLRI" | "PENDIDIKAN") => async (username: string, reason: string) => {
    if (!username.trim()) return;
    await run(
      () =>
        fetch("/api/admin/blacklist", {
          method: "POST",
          headers,
          body: JSON.stringify({ category, username: username.trim(), reason: reason.trim() }),
        }),
      true
    );
  };

  const bulkBlacklist = (category: "POLRI" | "PENDIDIKAN") => async (text: string) => {
    const usernames = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (usernames.length === 0) return;
    await run(
      () =>
        fetch("/api/admin/blacklist/bulk", {
          method: "POST",
          headers,
          body: JSON.stringify({ category, usernames }),
        }),
      true
    );
  };

  const deleteBlacklist = async (id: string) => {
    await run(() => fetch(`/api/admin/blacklist?id=${encodeURIComponent(id)}`, { method: "DELETE", headers }), true);
  };

  const addVerdict = async (username: string, status: "LULUS" | "TIDAK_LULUS", note: string) => {
    if (!username.trim()) return;
    await run(
      () =>
        fetch("/api/admin/verdicts", {
          method: "POST",
          headers,
          body: JSON.stringify({ username: username.trim(), status, note: note.trim() }),
        }),
      true
    );
  };

  const bulkVerdict = async (text: string) => {
    const usernames = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (usernames.length === 0) return;
    await run(
      () =>
        fetch("/api/admin/verdicts/bulk", {
          method: "POST",
          headers,
          body: JSON.stringify({ usernames }),
        }),
      true
    );
  };

  const deleteVerdict = async (id: string) => {
    await run(() => fetch(`/api/admin/verdicts?id=${encodeURIComponent(id)}`, { method: "DELETE", headers }), true);
  };

  return (
    <Card strong className="p-6">
      <h2 className="font-display text-lg font-bold gold-text">Putusan & Blacklist</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Pengganti pembacaan channel Discord: data dikelola di sini. Blacklist Polri & Pendidikan otomatis
        memblokir login casis; putusan sidang bersifat informasional.
      </p>

      <div className="mt-4 grid gap-3 rounded-xl border border-gold/30 bg-black/30 p-4">
        <p className="text-sm font-semibold text-zinc-200">🔎 Cross-check Manual di Channel Discord</p>
        <p className="text-xs text-zinc-500">
          Klik untuk membuka channel Discord terkait, lalu lakukan cross-check manual terhadap nama
          calon siswa pada putusan sidang, blacklist Polri, dan blacklist Pendidikan.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <ChannelButton
            label="⚖️ Buka Putusan Sidang"
            channelId={channelRefs?.putusan ?? null}
            href={discordChannelLink(channelRefs?.putusan ?? null)}
          />
          <ChannelButton
            label="🚫 Buka Blacklist Polri"
            channelId={channelRefs?.polri ?? null}
            href={discordChannelLink(channelRefs?.polri ?? null)}
          />
          <ChannelButton
            label="🎓 Buka Blacklist Pendidikan"
            channelId={channelRefs?.pendidikan ?? null}
            href={discordChannelLink(channelRefs?.pendidikan ?? null)}
          />
        </div>
      </div>

      <div className="mt-4 flex overflow-hidden rounded-lg border border-white/15">
        {(
          [
            ["putusan", "Putusan Sidang"],
            ["polri", "Blacklist Polri"],
            ["pendidikan", "Blacklist Pendidikan"],
          ] as [SubTab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 px-3 py-2 text-sm font-semibold transition ${
              subTab === t ? "bg-crimson-800 text-gold" : "bg-white/5 text-zinc-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      <div className="mt-4">
        {subTab === "putusan" && (
          <VerdictSection
            entries={verdicts}
            busy={busy}
            onAdd={addVerdict}
            onBulk={bulkVerdict}
            onDelete={deleteVerdict}
          />
        )}
        {subTab === "polri" && (
          <BlacklistSection
            entries={polri}
            busy={busy}
            label="Blacklist Polri"
            onAdd={addBlacklist("POLRI")}
            onBulk={bulkBlacklist("POLRI")}
            onDelete={deleteBlacklist}
          />
        )}
        {subTab === "pendidikan" && (
          <BlacklistSection
            entries={pendidikan}
            busy={busy}
            label="Blacklist Pendidikan"
            onAdd={addBlacklist("PENDIDIKAN")}
            onBulk={bulkBlacklist("PENDIDIKAN")}
            onDelete={deleteBlacklist}
          />
        )}
      </div>
    </Card>
  );
}

function BlacklistSection({
  entries,
  busy,
  label,
  onAdd,
  onBulk,
  onDelete,
}: {
  entries: BlacklistEntryItem[];
  busy: boolean;
  label: string;
  onAdd: (username: string, reason: string) => Promise<void>;
  onBulk: (text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? entries.filter((e) => e.username.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-zinc-200">Tambah entri {label}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username Roblox"
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
          />
          <Button
            variant="gold"
            onClick={() => {
              onAdd(username, reason).then(() => {
                setUsername("");
                setReason("");
              });
            }}
            disabled={busy || !username.trim()}
          >
            Tambah
          </Button>
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Alasan (opsional)"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none"
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-zinc-200">Import massal (paste dari Discord)</p>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={4}
          placeholder={"Satu username per baris, contoh:\nuser_a\nuser_b\nuser_c"}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
        />
        <div>
          <Button
            variant="gold"
            onClick={() => {
              onBulk(bulkText).then(() => setBulkText(""));
            }}
            disabled={busy || !bulkText.trim()}
          >
            Import
          </Button>
        </div>
      </div>

      <div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Cari username..."
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
        />
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">Tidak ada entri.</p>
          ) : (
            filtered.map((e) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100">{e.username}</p>
                  {e.reason && <p className="mt-0.5 text-xs text-zinc-500">{e.reason}</p>}
                  <p className="mt-1 text-[11px] text-zinc-600">{fmtDate(e.createdAt)}</p>
                </div>
                <button
                  onClick={() => onDelete(e.id)}
                  disabled={busy}
                  className="shrink-0 rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                >
                  Hapus
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function VerdictSection({
  entries,
  busy,
  onAdd,
  onBulk,
  onDelete,
}: {
  entries: VerdictItem[];
  busy: boolean;
  onAdd: (username: string, status: "LULUS" | "TIDAK_LULUS", note: string) => Promise<void>;
  onBulk: (text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<"LULUS" | "TIDAK_LULUS">("LULUS");
  const [note, setNote] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? entries.filter((e) => e.username.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-zinc-200">Tambah putusan sidang</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username Roblox"
            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "LULUS" | "TIDAK_LULUS")}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            <option value="LULUS">LULUS</option>
            <option value="TIDAK_LULUS">TIDAK LULUS</option>
          </select>
          <Button
            variant="gold"
            onClick={() => {
              onAdd(username, status, note).then(() => {
                setUsername("");
                setNote("");
              });
            }}
            disabled={busy || !username.trim()}
          >
            Tambah
          </Button>
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Catatan (opsional)"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none"
        />
      </div>

      <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-zinc-200">Import massal (status default LULUS)</p>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={4}
          placeholder={"Satu username per baris"}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
        />
        <div>
          <Button
            variant="gold"
            onClick={() => {
              onBulk(bulkText).then(() => setBulkText(""));
            }}
            disabled={busy || !bulkText.trim()}
          >
            Import
          </Button>
        </div>
      </div>

      <div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Cari username..."
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
        />
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">Tidak ada putusan.</p>
          ) : (
            filtered.map((e) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-100">{e.username}</p>
                    <Badge tone={e.status === "LULUS" ? "green" : "red"}>{e.status}</Badge>
                  </div>
                  {e.note && <p className="mt-0.5 text-xs text-zinc-500">{e.note}</p>}
                  <p className="mt-1 text-[11px] text-zinc-600">{fmtDate(e.createdAt)}</p>
                </div>
                <button
                  onClick={() => onDelete(e.id)}
                  disabled={busy}
                  className="shrink-0 rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                >
                  Hapus
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ChannelButton({
  label,
  channelId,
  href,
}: {
  label: string;
  channelId: string | null;
  href: string | null;
}) {
  if (!href || !channelId) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-500"
        title="Channel ID atau ID server belum diset di environment"
      >
        {label} (ID belum diset)
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/20 hover:text-gold-300"
    >
      {label} ↗
    </a>
  );
}
