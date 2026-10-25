"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ReviewQuestion {
  questionId: string;
  type: "MCQ" | "ESSAY";
  prompt: string;
  options?: Array<{ key: string; text: string }>;
  correctKey?: string;
  keywords?: string[];
  points: number;
  userAnswer: string;
  isCorrect: boolean;
  earnedPoints: number;
  maxPoints: number;
}

interface ReviewSummary {
  score: number;
  maxScore: number;
  mcqScore: number;
  essayScore: number;
  status: string;
  passed: boolean;
  submittedAt: string;
  periodName: string;
}

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = params as unknown as { id: string };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);

  useEffect(() => {
    async function fetchReview() {
      try {
        const res = await fetch(`/api/exam/review?resultId=${encodeURIComponent(resolvedParams.id)}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.message ?? "Gagal memuat review");
          return;
        }
        setQuestions(json.review);
        setSummary(json.summary);
      } catch {
        setError("Terjadi kesalahan jaringan");
      } finally {
        setLoading(false);
      }
    }
    fetchReview();
  }, [resolvedParams.id]);

  if (loading) {
    return (
      <div className="casis-root">
        <header className="student-header">
          <Link href="/dashboard" className="student-brand" aria-label="Portal Casis Bareskrim">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design-assets/logo-pusdik.png" alt="" width={34} height={34} />
            <div>
              <strong>BARESKRIM POLRI RBX</strong>
              <span>PUSDIK RESERSE</span>
            </div>
          </Link>
        </header>
        <main className="casis-main--dashboard" style={{ padding: "80px 0", textAlign: "center" }}>
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
          <p style={{ fontFamily: "var(--font-cinzel), serif", color: "var(--casis-gold)" }}>
            MEMUAT DETAIL JAWABAN...
          </p>
        </main>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="casis-root">
        <header className="student-header">
          <Link href="/dashboard" className="student-brand" aria-label="Portal Casis Bareskrim">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design-assets/logo-pusdik.png" alt="" width={34} height={34} />
            <div>
              <strong>BARESKRIM POLRI RBX</strong>
              <span>PUSDIK RESERSE</span>
            </div>
          </Link>
        </header>
        <main className="casis-main--dashboard" style={{ padding: "80px 0" }}>
          <div
            style={{
              maxWidth: "500px",
              margin: "0 auto",
              padding: "40px",
              border: "1px solid var(--casis-border)",
              background: "var(--casis-surface)",
              textAlign: "center",
            }}
          >
            <h1
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "18px",
                color: "#f08a8a",
                marginBottom: "12px",
              }}
            >
              GAGAL MEMUAT REVIEW
            </h1>
            <p style={{ fontSize: "13px", color: "var(--casis-muted)", marginBottom: "24px" }}>
              {error || "Data review untuk hasil ujian ini tidak ditemukan."}
            </p>
            <Link
              href="/hasil"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                border: "1px solid var(--casis-gold)",
                background: "var(--casis-gold)",
                color: "#000",
                fontSize: "12px",
                fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "0.08em",
              }}
            >
              Kembali ke Hasil
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const correctCount = questions.filter((q) => q.isCorrect).length;
  const totalQuestions = questions.length;

  return (
    <div className="casis-root">
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
          <Link href="/hasil" className="logout-button">
            HASIL UJIAN
          </Link>
          <Link href="/dashboard" className="logout-button">
            DASHBOARD
          </Link>
        </div>
      </header>

      <main className="casis-main--dashboard" style={{ padding: "40px 0 80px" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          {/* Header Summary Card */}
          <div
            style={{
              border: "1px solid var(--casis-border)",
              background: "var(--casis-surface)",
              padding: "32px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                paddingBottom: "24px",
                borderBottom: "1px solid var(--casis-border)",
              }}
            >
              <div>
                <span className="casis-eyebrow">REVIEW EVALUASI JAWABAN</span>
                <h1
                  style={{
                    fontFamily: "var(--font-cinzel), serif",
                    fontSize: "24px",
                    color: "var(--casis-gold)",
                    margin: "4px 0 0",
                  }}
                >
                  {summary.periodName}
                </h1>
              </div>
              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "6px 14px",
                    border: summary.passed
                      ? "1px solid rgba(80, 170, 120, 0.5)"
                      : "1px solid rgba(216, 117, 117, 0.5)",
                    background: summary.passed
                      ? "rgba(80, 170, 120, 0.12)"
                      : "rgba(216, 117, 117, 0.12)",
                    color: summary.passed ? "#62c799" : "#f08a8a",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                  }}
                >
                  {summary.status}
                </span>
                <p style={{ fontSize: "11px", color: "var(--casis-muted)", margin: "8px 0 0" }}>
                  Diserahkan: {new Date(summary.submittedAt).toLocaleString("id-ID")}
                </p>
              </div>
            </div>

            {/* Score Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <div style={{ border: "1px solid var(--casis-border)", background: "#080909", padding: "14px" }}>
                <span style={{ fontSize: "10px", color: "var(--casis-muted)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block" }}>
                  Total Nilai
                </span>
                <strong style={{ fontSize: "20px", color: "var(--casis-gold)", display: "block", marginTop: "4px" }}>
                  {summary.score} / {summary.maxScore}
                </strong>
              </div>
              <div style={{ border: "1px solid var(--casis-border)", background: "#080909", padding: "14px" }}>
                <span style={{ fontSize: "10px", color: "var(--casis-muted)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block" }}>
                  Persentase
                </span>
                <strong style={{ fontSize: "20px", color: "var(--casis-gold)", display: "block", marginTop: "4px" }}>
                  {summary.maxScore > 0 ? Math.round((summary.score / summary.maxScore) * 100) : 0}%
                </strong>
              </div>
              <div style={{ border: "1px solid var(--casis-border)", background: "#080909", padding: "14px" }}>
                <span style={{ fontSize: "10px", color: "var(--casis-muted)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block" }}>
                  Pilihan Ganda
                </span>
                <strong style={{ fontSize: "20px", color: "#62c799", display: "block", marginTop: "4px" }}>
                  {summary.mcqScore} poin
                </strong>
              </div>
              <div style={{ border: "1px solid var(--casis-border)", background: "#080909", padding: "14px" }}>
                <span style={{ fontSize: "10px", color: "var(--casis-muted)", textTransform: "uppercase", letterSpacing: "0.1em", display: "block" }}>
                  Nilai Esai
                </span>
                <strong style={{ fontSize: "20px", color: "var(--casis-gold)", display: "block", marginTop: "4px" }}>
                  {summary.essayScore} poin
                </strong>
              </div>
            </div>
          </div>

          {/* Question Details */}
          <div style={{ marginBottom: "32px" }}>
            <h2
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--casis-gold)",
                letterSpacing: "0.08em",
                marginBottom: "16px",
              }}
            >
              RINCIAN BUTIR SOAL ({correctCount}/{totalQuestions} BENAR)
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {questions.map((q, idx) => (
                <div
                  key={q.questionId}
                  style={{
                    border: "1px solid var(--casis-border)",
                    background: "var(--casis-surface)",
                    padding: "20px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "14px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "24px",
                        height: "24px",
                        border: q.isCorrect
                          ? "1px solid rgba(80, 170, 120, 0.5)"
                          : "1px solid rgba(216, 117, 117, 0.5)",
                        background: q.isCorrect ? "rgba(80, 170, 120, 0.12)" : "rgba(216, 117, 117, 0.12)",
                        color: q.isCorrect ? "#62c799" : "#f08a8a",
                        fontSize: "11px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--casis-text)", margin: "0 0 4px", lineHeight: "1.6" }}>
                        {q.prompt}
                      </p>
                      <span style={{ fontSize: "11px", color: "var(--casis-muted)" }}>
                        {q.type === "MCQ" ? "Pilihan Ganda" : "Esai"} · Bobot: {q.points} poin
                      </span>
                    </div>
                    <span
                      style={{
                        padding: "3px 8px",
                        border: q.isCorrect
                          ? "1px solid rgba(80, 170, 120, 0.5)"
                          : "1px solid rgba(216, 117, 117, 0.5)",
                        background: q.isCorrect ? "rgba(80, 170, 120, 0.1)" : "rgba(216, 117, 117, 0.1)",
                        color: q.isCorrect ? "#62c799" : "#f08a8a",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {q.isCorrect ? "✓ BENAR" : "✕ SALAH"}
                    </span>
                  </div>

                  {q.type === "MCQ" && q.options && (
                    <div style={{ display: "grid", gap: "6px", marginTop: "12px" }}>
                      {q.options.map((opt) => {
                        const isUserAnswer = q.userAnswer === opt.key;
                        const isCorrectAnswer = q.correctKey === opt.key;
                        const isGreen = isCorrectAnswer;
                        const isRed = isUserAnswer && !isCorrectAnswer;

                        return (
                          <div
                            key={opt.key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "10px 14px",
                              fontSize: "12px",
                              border: isGreen
                                ? "1px solid rgba(80, 170, 120, 0.5)"
                                : isRed
                                  ? "1px solid rgba(216, 117, 117, 0.5)"
                                  : "1px solid var(--casis-border)",
                              background: isGreen
                                ? "rgba(80, 170, 120, 0.1)"
                                : isRed
                                  ? "rgba(216, 117, 117, 0.1)"
                                  : "#080909",
                              color: isGreen
                                ? "#b8e2c2"
                                : isRed
                                  ? "#efa3a5"
                                  : "var(--casis-muted)",
                            }}
                          >
                            <span style={{ fontWeight: 700, color: "var(--casis-gold)" }}>{opt.key}.</span>
                            <span style={{ flex: 1, color: "var(--casis-text)" }}>{opt.text}</span>
                            {isUserAnswer && (
                              <span style={{ fontSize: "10px", fontWeight: 700, color: isGreen ? "#62c799" : "#f08a8a" }}>
                                [JAWABAN ANDA]
                              </span>
                            )}
                            {!isUserAnswer && isCorrectAnswer && (
                              <span style={{ fontSize: "10px", fontWeight: 700, color: "#62c799" }}>
                                [KUNCI JAWABAN]
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === "ESSAY" && (
                    <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
                      <div style={{ border: "1px solid var(--casis-border)", background: "#080909", padding: "12px" }}>
                        <span style={{ fontSize: "10px", color: "var(--casis-muted)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                          Jawaban Anda:
                        </span>
                        <p style={{ fontSize: "13px", color: "var(--casis-text)", margin: 0, whiteSpace: "pre-wrap" }}>
                          {q.userAnswer || <span style={{ fontStyle: "italic", color: "var(--casis-muted)" }}>Tidak diisi</span>}
                        </p>
                      </div>

                      {q.keywords && q.keywords.length > 0 && (
                        <div style={{ fontSize: "11px", color: "var(--casis-muted)" }}>
                          Kata kunci penilaian:{" "}
                          <span style={{ color: "var(--casis-gold)" }}>{q.keywords.join(", ")}</span>
                        </div>
                      )}

                      <div style={{ fontSize: "12px", color: "var(--casis-gold)", fontWeight: 700 }}>
                        Poin diperoleh: {q.earnedPoints} / {q.maxPoints}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Navigation link */}
          <div style={{ display: "flex", gap: "12px" }}>
            <Link
              href="/hasil"
              style={{
                flex: 1,
                padding: "14px",
                border: "1px solid var(--casis-border)",
                background: "transparent",
                color: "var(--casis-text)",
                textAlign: "center",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              ← Kembali ke Hasil
            </Link>
            <Link
              href="/dashboard"
              style={{
                flex: 1,
                padding: "14px",
                border: "1px solid var(--casis-gold)",
                background: "var(--casis-gold)",
                color: "#000",
                textAlign: "center",
                textDecoration: "none",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Dashboard Siswa
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}