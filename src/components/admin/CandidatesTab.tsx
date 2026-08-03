"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";
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
  mcqScore: number;
  essayScore: number;
  score: number;
  maxScore: number;
  status: string;
  passed: boolean;
  periodName: string;
  submittedAt: string;
  discordMessageId: string | null;
}

function downloadCsv(rows: CandidateRow[]) {
  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const header = [
    "Nama",
    "Username",
    "Profil Roblox",
    "Pangkat",
    "Nilai MCQ",
    "Nilai Essay",
    "Total",
    "Status",
    "Periode",
    "Tanggal",
  ];
  const lines = rows.map((r) =>
    [
      r.displayName,
      r.username,
      r.profileUrl ?? "",
      r.policeGroupRank ?? "",
      r.mcqScore,
      r.essayScore,
      `${r.score}/${r.maxScore}`,
      r.status,
      r.periodName,
      new Date(r.submittedAt).toLocaleString("id-ID"),
    ]
      .map(esc)
      .join(",")
  );
  const csv = "\ufeff" + [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rekap-nilai-${new Date().toISOString().slice(0, 10)}.csv`;
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
  const toast = useToastContext();

  const loadPeriods = useCallback(async () => {
    const res = await fetch("/api/admin/period", { headers });
    if (!res.ok) return;
    const json = await res.json();
    setPeriods((json.periods ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
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
    if (!window.confirm("Hapus rekap ini? Laporan Discord ikut terhapus, dan casis bisa mengikuti ujian kembali pada periode tersebut."))
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
    <Card strong className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-lg font-bold gold-text">Rekap Nilai Casis</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            onClick={() => downloadCsv(rows)}
            disabled={busy || rows.length === 0}
            className="shrink-0"
          >
            Unduh CSV
          </Button>
        </div>
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
              <th className="px-3 py-2">MCQ</th>
              <th className="px-3 py-2">Essay</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Discord</th>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-sm text-zinc-500">
                  {busy ? (
                    <div className="flex items-center justify-center gap-2">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <span>Memuat data...</span>
                    </div>
                  ) : "Belum ada hasil ujian."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
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
                    {r.discordMessageId ? (
                      <Badge tone="gold" title="Laporan Discord tersimpan, akan ikut terhapus">
                        🐦 Terkirim
                      </Badge>
                    ) : (
                      <span className="text-xs text-zinc-600" title="Tanpa ID laporan Discord (rekap lama / kirim gagal)">
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
    </Card>
  );
}
