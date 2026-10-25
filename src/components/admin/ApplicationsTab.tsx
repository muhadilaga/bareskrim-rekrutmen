"use client";

// ============================================================
// TASK 03L.2E.4.1D — Admin Application Approval / Rejection
// Tab kelola pendaftaran: daftar Application + aksi Terima/Tolak.
//
// Status label SENGAJA dipetakan ke makna penerimaan (bukan hasil ujian):
//   MENUNGGU_VERIFIKASI -> Menunggu Verifikasi
//   DITERIMA            -> Diterima
//   DITOLAK             -> Ditolak
// Mapping LULUS/TIDAK_LULUS TIDAK PERNAH dipakai di sini — itu milik
// VerdictStatus (hasil ujian), bukan ApplicationStatus (penerimaan).
//
// Semua perubahan status HANYA terjadi lewat POST eksplisit setelah
// confirm. TIDAK ADA mutation otomatis saat render/mount.
// ============================================================

import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToastContext } from "@/components/ui/Toast";

interface ApplicationsTabProps {
  headers: Record<string, string>;
}

type ApplicationStatus = "MENUNGGU_VERIFIKASI" | "DITERIMA" | "DITOLAK";

interface ApplicationRow {
  id: string;
  registrationId: string;
  status: ApplicationStatus;
  fullName: string;
  robloxUsername: string;
  userId: string | null;
  createdAt: string;
  deletedAt: string | null;
  recruitmentPeriod: { code: string; name: string } | null;
  user: { id: string; username: string } | null;
}

// Label status penerimaan — BUKAN LULUS/TIDAK_LULUS.
const STATUS_LABEL: Record<ApplicationStatus, string> = {
  MENUNGGU_VERIFIKASI: "Menunggu Verifikasi",
  DITERIMA: "Diterima",
  DITOLAK: "Ditolak",
};

const STATUS_CLASS: Record<ApplicationStatus, string> = {
  MENUNGGU_VERIFIKASI: "pending",
  DITERIMA: "active",
  DITOLAK: "rejected",
};

export function ApplicationsTab({ headers }: ApplicationsTabProps) {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<"" | ApplicationStatus>("");
  const [search, setSearch] = useState("");
  const toast = useToastContext();

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/applications", { headers });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMsg({ ok: false, text: json.message ?? "Gagal memuat daftar pendaftaran." });
      return;
    }
    const json = await res.json();
    setRows(Array.isArray(json.applications) ? json.applications : []);
    setLoaded(true);
  }, [headers]);

  // Mount: GET saja. Tidak ada mutation otomatis.
  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    let list = Array.isArray(rows) ? rows : [];
    if (filter) {
      list = list.filter((r) => r.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.robloxUsername.toLowerCase().includes(q) ||
          r.registrationId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filter, search]);

  // Satu-satunya jalur perubahan status: POST eksplisit setelah konfirmasi.
  async function changeStatus(row: ApplicationRow, next: ApplicationStatus) {
    const actionLabel =
      next === "DITERIMA"
        ? row.status === "DITOLAK"
          ? "Terima Kembali"
          : "Terima"
        : row.status === "DITERIMA"
          ? "Cabut Penerimaan"
          : "Tolak";

    if (
      !confirm(
        `${actionLabel} pendaftaran "${row.fullName}" (@${row.robloxUsername})?\n\nStatus akan diubah dari ${STATUS_LABEL[row.status]} menjadi ${STATUS_LABEL[next]}.\n\nPerubahan ini tercatat di audit log.`,
      )
    )
      return;

    setBusyId(row.id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/applications", {
        method: "POST",
        headers,
        body: JSON.stringify({ applicationId: row.id, status: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg({ ok: false, text: json.message ?? "Gagal mengubah status." });
        toast.error(json.message ?? "Gagal mengubah status.");
      } else {
        const text = json.unchanged
          ? `Status sudah ${STATUS_LABEL[next]}. Tidak ada perubahan.`
          : `Status "${row.fullName}" berubah menjadi ${STATUS_LABEL[next]}.`;
        setMsg({ ok: true, text });
        toast.success(text);
        // Idempotent same-state: tidak perlu reload karena nilai sudah sama.
        if (!json.unchanged) await load();
      }
    } catch {
      setMsg({ ok: false, text: "Terjadi kesalahan jaringan." });
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setBusyId(null);
    }
  }

  function actionsFor(row: ApplicationRow) {
    if (row.deletedAt) return [];
    if (row.status === "MENUNGGU_VERIFIKASI") {
      return [
        { label: "Terima", next: "DITERIMA" as const, type: "verify" as const },
        { label: "Tolak", next: "DITOLAK" as const, type: "reject" as const },
      ];
    }
    if (row.status === "DITERIMA") {
      return [{ label: "Cabut Penerimaan", next: "DITOLAK" as const, type: "reject" as const }];
    }
    return [{ label: "Terima Kembali", next: "DITERIMA" as const, type: "verify" as const }];
  }

  return (
    <article className="panel-card !p-6 sm:!p-8">
      {/* Panel Heading Prototype */}
      <div className="panel-heading !pb-4">
        <div>
          <span className="section-kicker">APPLICATIONS</span>
          <h2 className="font-serif">Pendaftaran Casis</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Kelola status penerimaan pendaftaran. Keputusan ujian dikelola terpisah di tab Rekap Nilai.
          </p>
        </div>
        <span className="panel-count">{filteredRows?.length ?? 0} peserta</span>
      </div>

      {/* Toolbar Pencarian & Filter */}
      <div className="case-toolbar !mt-4">
        <input
          type="search"
          placeholder="Cari nama, username Roblox, atau ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "" | ApplicationStatus)}
          aria-label="Filter status"
        >
          <option value="">Semua Status</option>
          <option value="MENUNGGU_VERIFIKASI">Menunggu Verifikasi</option>
          <option value="DITERIMA">Diterima</option>
          <option value="DITOLAK">Ditolak</option>
        </select>
        <button
          type="button"
          className="outline-button !min-h-[44px] px-4 text-xs font-semibold shrink-0"
          onClick={load}
        >
          Muat Ulang
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

      {/* Konten Daftar Casis */}
      {!loaded ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="empty-panel !min-h-[220px]">
          <p className="mt-4 text-sm text-[var(--muted)]">
            {(rows?.length ?? 0) === 0
              ? "Belum ada pendaftaran masuk."
              : "Tidak ada pendaftaran dengan status tersebut."}
          </p>
        </div>
      ) : (
        <div className="case-list !mt-4">
          {filteredRows.map((r) => {
            const actions = actionsFor(r);
            const isBusy = busyId === r.id;
            return (
              <article key={r.id} className="case-card">
                <div className="case-top">
                  <div className="case-name">
                    <strong>{r.fullName}</strong>
                    <span>
                      @{r.robloxUsername} · {r.registrationId}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`status-badge ${STATUS_CLASS[r.status]}`}
                      title={`Status: ${STATUS_LABEL[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    {r.deletedAt && <span className="status-badge rejected">Dihapus</span>}
                  </div>
                </div>

                <div className="case-meta">
                  <div>
                    <span>PERIODE</span>
                    <strong>
                      {r.recruitmentPeriod
                        ? `${r.recruitmentPeriod.code} (${r.recruitmentPeriod.name})`
                        : "Tanpa Periode"}
                    </strong>
                  </div>
                  <div>
                    <span>WAKTU DAFTAR</span>
                    <strong>{new Date(r.createdAt).toLocaleString("id-ID")}</strong>
                  </div>
                  <div>
                    <span>AKUN TERHUBUNG</span>
                    <strong>{r.user ? `@${r.user.username}` : "Belum terhubung akun"}</strong>
                  </div>
                  <div>
                    <span>STATUS PENERIMAAN</span>
                    <strong>{STATUS_LABEL[r.status]}</strong>
                  </div>
                </div>

                {actions.length > 0 && (
                  <div className="case-actions">
                    {isBusy ? (
                      <span className="text-xs text-[var(--muted)]">Memproses...</span>
                    ) : (
                      actions.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          disabled={isBusy}
                          onClick={() => changeStatus(r, a.next)}
                          className={a.type === "verify" ? "verify-button" : "reject-button"}
                        >
                          {a.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </article>
  );
}
