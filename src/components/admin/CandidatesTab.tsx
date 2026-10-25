"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
        "Hapus rekap ini?\n\nLaporan Discord ikut terhapus, dan casis akan bisa mengikuti ujian lagi pada periode ini.",
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
      <article className="panel-card !p-6 sm:!p-8">
        {/* Panel Heading Prototype */}
        <div className="panel-heading !pb-4">
          <div>
            <span className="section-kicker">RESULTS</span>
            <h2 className="font-serif">Rekap Nilai Casis</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Rekapitulasi perolehan nilai ujian seleksi akademik casis Pusdik Reserse.
            </p>
          </div>
          <span className="panel-count">{filteredRows.length} peserta</span>
        </div>

        {/* Toolbar Pencarian & Filter */}
        <div className="case-toolbar !mt-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau username..."
          />
          <select
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            <option value="">Semua Periode</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const pName = periodId ? periods.find((p) => p.id === periodId)?.name : undefined;
              downloadCsv(filteredRows, pName);
            }}
            disabled={busy || filteredRows.length === 0}
            className="primary-button !mt-0 !w-auto !min-h-[44px] px-5 text-xs font-semibold shrink-0"
          >
            Unduh CSV
          </button>
        </div>

        {Boolean(msg?.text) && (
          <div
            className={`mt-4 rounded-[3px] border px-4 py-2.5 text-xs ${
              msg!.ok
                ? "border-[#68b478]/40 bg-[var(--surface-2)] text-[#68b478]"
                : "border-[#d87575]/40 bg-[#1e1313] text-[#d87575]"
            }`}
          >
            {msg!.text}
          </div>
        )}

        <div className="mt-4 overflow-x-auto border-t border-[var(--border)] pt-2">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="px-3 py-3">Nama</th>
                <th className="px-3 py-3">Username</th>
                <th className="px-3 py-3">Pangkat</th>
                <th className="px-3 py-3">Pilihan Ganda</th>
                <th className="px-3 py-3">Essay</th>
                <th className="px-3 py-3">Total</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Detail Jawaban</th>
                <th className="px-3 py-3">Discord</th>
                <th className="px-3 py-3">Tanggal</th>
                <th className="px-3 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-sm text-[var(--muted)]">
                    {busy ? (
                      <div className="flex items-center justify-center gap-2">
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <span>Memuat data...</span>
                      </div>
                    ) : (
                      "Belum ada hasil ujian. Minta casis menyelesaikan ujian atau cek apakah periode dan akses ujian sudah dibuka."
                    )}
                  </td>
                </tr>
              ) : (
                pagedRows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition">
                    <td className="px-3 py-3 font-medium text-[var(--text)]">{r.displayName}</td>
                    <td className="px-3 py-3">
                      <a
                        href={r.profileUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#68b478] hover:underline"
                      >
                        @{r.username}
                      </a>
                    </td>
                    <td className="px-3 py-3 text-[var(--muted)]">{r.policeGroupRank ?? "-"}</td>
                    <td className="px-3 py-3 text-[var(--text)]">{r.mcqScore}</td>
                    <td className="px-3 py-3 text-[var(--text)]">{r.essayScore}</td>
                    <td className="px-3 py-3 font-semibold text-[var(--text)]">
                      {r.score}/{r.maxScore}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`status-badge ${r.passed ? "active" : "rejected"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {Array.isArray(r.answersJson) && r.answersJson.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRow(r);
                          }}
                          className="outline-button !min-h-[30px] !px-2.5 text-xs"
                        >
                          Detail Jawaban
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.discordMessageId ? (
                        <span className="status-badge active text-[10px]" title="Laporan Discord tersimpan">
                          Terkirim
                        </span>
                      ) : (
                        <span
                          className="text-xs text-[var(--muted-2)]"
                          title="Tanpa ID laporan Discord"
                        >
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--muted)]">
                      {new Date(r.submittedAt).toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => deleteRow(r.id)}
                        disabled={deletingId === r.id}
                        className="reject-button !min-h-[30px] !px-2.5 text-xs"
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
          <div className="mt-4 flex items-center justify-between text-sm border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--muted)]">
              Menampilkan {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, filteredRows.length)} dari {filteredRows.length} data
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="outline-button !min-h-[34px] px-3 text-xs disabled:opacity-40"
              >
                ← Sebelumnya
              </button>
              <span className="font-mono text-xs text-[var(--muted)]">
                {page}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="outline-button !min-h-[34px] px-3 text-xs disabled:opacity-40"
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </article>

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl max-h-[80vh] overflow-auto rounded-[3px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="font-serif text-lg font-normal text-[var(--text)]">
                Detail Jawaban — {selectedRow.displayName}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="text-[var(--muted)] hover:text-[var(--text)]"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
            <pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--text)] bg-[var(--surface-2)] p-4 rounded-[3px] border border-[var(--border)]">
              {JSON.stringify(selectedRow.answersJson, null, 2)}
            </pre>
            <div className="mt-4 text-right">
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="outline-button !min-h-[38px] px-4 text-xs font-semibold"
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
