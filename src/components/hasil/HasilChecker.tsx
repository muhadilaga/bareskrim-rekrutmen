"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ResultCard } from "@/components/result/ResultCard";
import { useToastContext } from "@/components/ui/Toast";
import type { ResultPayload } from "@/types";

interface HasilApiResponse {
  ok: boolean;
  code?: string;
  message?: string;
  result?: ResultPayload;
}

type LoadState = "loading" | "unauthorized" | "empty" | "error" | "ready";

// TASK 03L.2E.4.4 — Halaman hasil TIDAK lagi mencari berdasarkan username bebas.
// Identitas diambil dari sesi Roblox yang terverifikasi di server; klien tidak
// mengirim username/ID apa pun sebagai bukti kepemilikan.
export function HasilChecker({ kkm: defaultKkm }: { kkm: number }) {
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToastContext();

  useEffect(() => {
    let active = true;

    (async () => {
      setState("loading");
      setMessage(null);
      try {
        // Tanpa body: server menentukan pemilik hasil dari sesi, bukan input klien.
        const res = await fetch("/api/hasil", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
        });
        const json: HasilApiResponse = await res
          .json()
          .catch(() => ({ ok: false }) as HasilApiResponse);
        if (!active) return;

        if (res.status === 401) {
          setState("unauthorized");
          return;
        }
        if (json.ok && json.result) {
          setResult(json.result);
          setState("ready");
          return;
        }
        if (json.code === "NO_RESULT") {
          setState("empty");
          return;
        }
        setMessage(json.message ?? "Gagal memuat hasil.");
        setState("error");
        toast.error(json.message ?? "Gagal memuat hasil.");
      } catch {
        if (!active) return;
        setMessage("Terjadi kesalahan jaringan. Coba lagi.");
        setState("error");
        toast.error("Terjadi kesalahan jaringan.");
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Laporan Discord best-effort untuk hasil yang baru disubmit
  useEffect(() => {
    if (!result) return;
    const fresh = Date.now() - new Date(result.submittedAt).getTime() < 5 * 60_000;
    if (!fresh) return;
    fetch("/api/exam/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId: result.id }),
    }).catch(() => {});
  }, [result]);

  return (
    <div className="casis-root">
      {/* Header Pusdik V2 */}
      <header className="student-header">
        <Link href="/dashboard" className="student-brand" aria-label="Portal Casis Bareskrim">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/design-assets/logo-pusdik.png" alt="" width={34} height={34} />
          <div>
            <strong>BARESKRIM POLRI RBX</strong>
            <span>PUSDIK RESERSE</span>
          </div>
        </Link>
        <div className="student-header-right">
          <Link href="/dashboard" className="logout-button">
            DASHBOARD
          </Link>
        </div>
      </header>

      <main id="casis-main" className="casis-main--dashboard" style={{ padding: "40px 0 80px" }}>
        <div className="student-welcome" style={{ maxWidth: "860px", margin: "0 auto 24px" }}>
          <div>
            <span className="casis-eyebrow">PENGUMUMAN HASIL / SELEKSI AKADEMIK</span>
            <h1>
              Hasil Ujian <span>Seleksi Calon Siswa.</span>
            </h1>
            <p className="welcome-copy">
              Rekapitulasi resmi penilaian ujian seleksi akademik Pusdik Reserse Bareskrim Polri RBX.
            </p>
          </div>
        </div>

        {state === "loading" && (
          <div
            style={{
              maxWidth: "500px",
              margin: "40px auto",
              padding: "48px 32px",
              border: "1px solid var(--casis-border)",
              background: "var(--casis-surface)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "36px",
                border: "2px solid rgba(197, 168, 128, 0.2)",
                borderTopColor: "var(--casis-gold)",
                borderRadius: "50%",
                margin: "0 auto 20px",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "15px",
                color: "var(--casis-gold)",
                letterSpacing: "0.06em",
                margin: "0 0 8px",
              }}
            >
              MEMUAT HASIL UJIAN
            </p>
            <p style={{ fontSize: "13px", color: "var(--casis-muted)", margin: 0 }}>
              Menghubungkan ke sistem evaluasi server...
            </p>
          </div>
        )}

        {state === "ready" && result && (
          <ResultCard
            result={result}
            kkm={result.kkm ?? defaultKkm}
            showAnswers={false}
            resultId={result.id}
          />
        )}

        {(state === "unauthorized" || state === "empty" || state === "error") && (
          <div
            style={{
              maxWidth: "520px",
              margin: "40px auto",
              padding: "40px 32px",
              border: "1px solid var(--casis-border)",
              background: "var(--casis-surface)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px",
                height: "48px",
                border:
                  state === "error"
                    ? "1px solid rgba(216, 117, 117, 0.5)"
                    : "1px solid var(--casis-border)",
                background:
                  state === "error"
                    ? "rgba(216, 117, 117, 0.1)"
                    : "rgba(255, 255, 255, 0.04)",
                color: state === "error" ? "#f08a8a" : "var(--casis-gold)",
                fontSize: "20px",
                marginBottom: "20px",
              }}
            >
              {state === "unauthorized" ? "§" : state === "empty" ? "≡" : "!"}
            </div>

            <h2
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "18px",
                fontWeight: 700,
                color: "var(--casis-gold)",
                letterSpacing: "0.06em",
                margin: "0 0 10px",
              }}
            >
              {state === "unauthorized"
                ? "AUTENTIKASI DIPERLUKAN"
                : state === "empty"
                  ? "BELUM ADA HASIL UJIAN"
                  : "GAGAL MEMUAT HASIL"}
            </h2>

            <p
              style={{
                fontSize: "13px",
                color: "var(--casis-muted)",
                lineHeight: "1.6",
                margin: "0 0 28px",
              }}
            >
              {state === "unauthorized"
                ? "Silakan masuk dengan akun Roblox Anda untuk mengakses lembar hasil ujian resmi."
                : state === "empty"
                  ? "Belum ada riwayat hasil ujian untuk akun Anda. Pastikan Anda telah menyelesaikan ujian seleksi."
                  : message ?? "Terjadi kesalahan saat memproses data hasil ujian Anda."}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {state === "unauthorized" && (
                <Link
                  href="/dashboard"
                  style={{
                    display: "block",
                    padding: "14px",
                    border: "1px solid var(--casis-gold)",
                    background: "var(--casis-gold)",
                    color: "#000000",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textDecoration: "none",
                    textTransform: "uppercase",
                  }}
                >
                  Masuk dengan Roblox
                </Link>
              )}

              {state === "empty" && (
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  style={{
                    padding: "14px",
                    border: "1px solid var(--casis-gold)",
                    background: "var(--casis-gold)",
                    color: "#000000",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Muat Ulang
                </button>
              )}

              {state === "error" && (
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  style={{
                    padding: "14px",
                    border: "1px solid var(--casis-gold)",
                    background: "var(--casis-gold)",
                    color: "#000000",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Coba Lagi
                </button>
              )}

              <Link
                href="/dashboard"
                style={{
                  display: "block",
                  padding: "14px",
                  border: "1px solid var(--casis-border)",
                  background: "transparent",
                  color: "var(--casis-text)",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textDecoration: "none",
                  textTransform: "uppercase",
                }}
              >
                Kembali ke Dashboard
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
