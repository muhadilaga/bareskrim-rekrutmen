"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToastContext } from "@/components/ui/Toast";

interface CandidatesTabProps {
  headers: Record<string, string>;
}

interface PeriodOption {
  id: string;
  name: string;
}

interface CandidateRow {
  id: string;
  username: string;
  displayName: string;
  robloxId: number;
  profileUrl: string | null;
  policeGroupRank: string | null;
  discordUsername: string | null;
  mcqScore: number;
  essayScore: number;
  score: number;
  maxScore: number;
  status: string;
  passed: boolean;
  periodName: string;
  submittedAt: string;
  discordMessageId: string | null;
  answersJson: unknown[];
}

function downloadCsv(rows: CandidateRow[], periodName?: string) {
  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

  // Header
  const header = [
    "No",
    "Nama Lengkap",
    "Username Roblox",
    "Roblox ID",
    "Username Discord",
    "Pangkat",
    "PG",
    "Essay",
    "Total Nilai",
    "Persentase",
    "Status",
    "Waktu Submit",
  ];

  // Sort: LULUS dulu, lalu by score desc
  const sorted = [...rows].sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? -1 : 1;
    return b.score - a.score;
  });

  // Data rows
  const lines = sorted.map((r, i) => {
    const pct = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0;
    return [
      i + 1,
      r.displayName,
      r.username,
      r.robloxId ?? "",
      r.discordUsername ?? "",
      r.policeGroupRank ?? "-",
      r.mcqScore,
      r.essayScore,
      `${r.score}/${r.maxScore}`,
      `${pct}%`,
      r.status === "LULUS" ? "LULUS" : "TIDAK LULUS",
      new Date(r.submittedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }),
    ].map(esc).join(";");
  });

  // Summary
  const totalLulus = sorted.filter((r) => r.passed).length;
  const totalTidakLulus = sorted.filter((r) => !r.passed).length;
  const avgScore = sorted.length > 0
    ? Math.round(sorted.reduce((s, r) => s + r.score, 0) / sorted.length)
    : 0;

  const summary = [
    "",
    "RINGKASAN",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ].map(esc).join(";");

  const summaryRows = [
    [`Total Peserta: ${sorted.length}`, "", "", "", "", "", `Lulus: ${totalLulus}`, "", `Tidak Lulus: ${totalTidakLulus}`, "", `Rata-rata: ${avgScore}`, ""].map(esc).join(";"),
  ];

  // Build CSV with BOM for Excel
  const csvContent = "\ufeff" + [
    header.map(esc).join(";"),
    ...lines,
    summary,
    ...summaryRows,
  ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const name = periodName ? periodName.replace(/[^a-zA-Z0-9]/g, "-") : "semua";
  a.download = `rekap-nilai-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CandidatesTab({ headers }: CandidatesTabProps) {
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<CandidateRow | null>(null);
  const pageSize = 15;
  const toast = useToastContext();

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.username.toLowerCase().includes(q) ||
        r.displayName.toLowerCase().includes(q) ||
        (r.policeGroupRank ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, periodId]);

  const loadPeriods = useCallback(async () => {
    const res = await fetch("/api/admin/period", { headers });
    if (!res.ok) return;
    const json = await res.json();
    setPeriods(
      (json.periods ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
    );
  }, [headers]);

  const loadRows = useCallback(async () => {
    setBusy(true);
    const q = periodId ? `?periodId=${encodeURIComponent(periodId)}` : "";
    const res = await fetch(`/api/admin/candidates${q}`, { headers });
    const json = await res.json();
    if (!res.ok) {
      setMsg({ ok: false, text: json.message ?? "Gagal memuat rekap nilai." });
    } else {
      setRows(json.rows ?? []);
      setMsg(null);
    }
    setBusy(false);
  }, [headers, periodId]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  async function deleteRow(id: string) {
    if (
      !window.confirm(
        "Hapus rekap ini? Laporan Discord ikut terhapus, dan casis bisa mengikuti ujian kembali pada periode tersebut.",
      )
    )
      return;
    setDeletingId(id);
    const res = await fetch(`/api/admin/candidates?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    const json = await res.json();
    setMsg({ ok: json.ok, text: json.message ?? (res.ok ? "Rekap dihapus." : "Gagal menghapus.") });
    if (json.ok) toast.success("Rekap berhasil dihapus.");
    else toast.error(json.message ?? "Gagal menghapus.");
    setDeletingId(null);
    if (json.ok) await loadRows();
  }

  return (
    <>
      <Card strong className="p-6">
        <h2 className="font-display text-lg font-bold gold-text">Rekap Nilai Casis</h2>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / username..."
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-gold/60 sm:w-52"
            />
          </div>
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-gold/60"
          >
            <option value="">Semua Periode</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button
            variant="gold"
            onClick={() => {
              const pName = periodId ? periods.find((p) => p.id === periodId)?.name : undefined;
              downloadCsv(filteredRows, pName);
            }}
            disabled={busy || filteredRows.length === 0}
            className="shrink-0"
          >
            Unduh CSV
          </Button>
        </div>

        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2">Nama</th>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Pangkat</th>
                <th className="px-3 py-2">Pilihan Ganda</th>
                <th className="px-3 py-2">Essay</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Detail Jawaban</th>
                <th className="px-3 py-2">Discord</th>
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-sm text-zinc-500">
                    {busy ? (
                      <div className="flex items-center justify-center gap-2">
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <span>Memuat data...</span>
                      </div>
                    ) : "Belum ada hasil ujian."}
                  </td>
                </tr>
              ) : (
                pagedRows.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2 font-medium text-zinc-100">{r.displayName}</td>
                    <td className="px-3 py-2">
                      <a
                        href={r.profileUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold hover:underline"
                      >
                        @{r.username}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{r.policeGroupRank ?? "-"}</td>
                    <td className="px-3 py-2 text-zinc-300">{r.mcqScore}</td>
                    <td className="px-3 py-2 text-zinc-300">{r.essayScore}</td>
                    <td className="px-3 py-2 font-semibold text-zinc-100">
                      {r.score}/{r.maxScore}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.passed ? "green" : "neutral"}>{r.status}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {Array.isArray(r.answersJson) && r.answersJson.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRow(r);
                          }}
                          className="rounded-md border border-gold/40 px-2 py-1 text-xs text-gold transition hover:bg-gold/10"
                        >
                          Detail Jawaban
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.discordMessageId ? (
                        <Badge tone="gold" title="Laporan Discord tersimpan, akan ikut terhapus">
                          🐦 Terkirim
                        </Badge>
                      ) : (
                        <span
                          className="text-xs text-zinc-600"
                          title="Tanpa ID laporan Discord (rekap lama / kirim gagal)"
                        >
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {new Date(r.submittedAt).toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => deleteRow(r.id)}
                        disabled={deletingId === r.id}
                        className="rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {deletingId === r.id ? "..." : "Hapus"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredRows.length > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-xs text-zinc-500">
              Menampilkan {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, filteredRows.length)} dari {filteredRows.length} data
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
              >
                ← Sebelumnya
              </button>
              <span className="font-mono text-xs text-zinc-400">
                {page}/{totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </Card>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[80vh] overflow-auto rounded-xl border border-white/15 bg-[#111] p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-display text-lg font-bold gold-text">
                Detail Jawaban — {selectedRow.displayName}
              </h3>
              <button
                onClick={() => setSelectedRow(null)}
                className="text-zinc-400 hover:text-white"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            <pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-xs text-zinc-300">
              {JSON.stringify(selectedRow.answersJson, null, 2)}
            </pre>
            <div className="mt-4 text-right">
              <button
                onClick={() => setSelectedRow(null)}
                className="rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
