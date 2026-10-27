"use client";

import Link from "next/link";
import type { ResultPayload } from "@/types";

export function ResultCard({
  result,
  kkm,
  showAnswers = true,
  resultId,
}: {
  result: ResultPayload;
  kkm?: number;
  showAnswers?: boolean;
  resultId?: string;
}) {
  const passed = result.passed;
  const details = result.answersJson;
  const scorePercent = Math.min(100, Math.max(0, (result.score / (result.maxScore || 100)) * 100));

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto" }}>
      {/* Ringkasan Nilai V2 */}
      <div
        style={{
          border: "1px solid var(--casis-border)",
          background: "var(--casis-surface)",
          padding: "36px 28px",
          textAlign: "center",
          marginBottom: "24px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--casis-muted)",
            fontWeight: 700,
          }}
        >
          Hasil Ujian Akademik
        </span>
        <div
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "64px",
            fontWeight: 700,
            color: passed ? "var(--casis-gold)" : "#f08a8a",
            lineHeight: 1.1,
            marginTop: "12px",
          }}
        >
          {result.score}
        </div>
        <p style={{ fontSize: "13px", color: "var(--casis-muted)", marginTop: "6px" }}>
          dari {result.maxScore} poin maksimal
        </p>

        <div style={{ marginTop: "16px", display: "inline-block" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 16px",
              border: passed
                ? "1px solid rgba(80, 170, 120, 0.5)"
                : "1px solid rgba(216, 117, 117, 0.5)",
              background: passed ? "rgba(80, 170, 120, 0.12)" : "rgba(216, 117, 117, 0.12)",
              color: passed ? "#62c799" : "#f08a8a",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.12em",
            }}
          >
            {passed ? "✓ LOLOS TAHAP AKADEMIK (MENUJU TAHAP INTERVIEW)" : "✓ MENYELESAIKAN TAHAP AKADEMIK"}
          </span>
        </div>

        <div
          style={{
            maxWidth: "280px",
            height: "4px",
            margin: "24px auto 0",
            background: "rgba(255, 255, 255, 0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${scorePercent}%`,
              background: passed ? "var(--casis-gold)" : "#f08a8a",
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {/* 4 Detail Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
            marginTop: "32px",
            paddingTop: "24px",
            borderTop: "1px solid var(--casis-border)",
            textAlign: "left",
          }}
        >
          <div
            style={{
              border: "1px solid var(--casis-border)",
              background: "#080909",
              padding: "14px 16px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--casis-muted)",
                display: "block",
                fontWeight: 700,
              }}
            >
              Pilihan Ganda
            </span>
            <strong
              style={{
                display: "block",
                marginTop: "6px",
                fontSize: "14px",
                color: "var(--casis-text)",
              }}
            >
              {result.mcqScore} poin
            </strong>
          </div>

          <div
            style={{
              border: "1px solid var(--casis-border)",
              background: "#080909",
              padding: "14px 16px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--casis-muted)",
                display: "block",
                fontWeight: 700,
              }}
            >
              Penilaian Esai
            </span>
            <strong
              style={{
                display: "block",
                marginTop: "6px",
                fontSize: "14px",
                color: "var(--casis-text)",
              }}
            >
              {result.essayScore} poin
            </strong>
          </div>

          <div
            style={{
              border: "1px solid var(--casis-border)",
              background: "#080909",
              padding: "14px 16px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--casis-muted)",
                display: "block",
                fontWeight: 700,
              }}
            >
              Pangkat Casis
            </span>
            <strong
              style={{
                display: "block",
                marginTop: "6px",
                fontSize: "14px",
                color: "var(--casis-text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {result.attempt.user.policeGroupRank ?? "-"}
            </strong>
          </div>

          <div
            style={{
              border: "1px solid var(--casis-border)",
              background: "#080909",
              padding: "14px 16px",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--casis-muted)",
                display: "block",
                fontWeight: 700,
              }}
            >
              Periode Seleksi
            </span>
            <strong
              style={{
                display: "block",
                marginTop: "6px",
                fontSize: "14px",
                color: "var(--casis-gold)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {result.attempt.period.name}
            </strong>
          </div>
        </div>
      </div>

      {/* Rekap Jawaban */}
      {showAnswers && (
        <div style={{ marginBottom: "24px" }}>
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
            REKAPITULASI JAWABAN ANDA
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {details.map((d, i) => (
              <div
                key={d.questionId}
                style={{
                  border: "1px solid var(--casis-border)",
                  background: "var(--casis-surface)",
                  padding: "20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "24px",
                      height: "24px",
                      border:
                        d.isCorrect === true
                          ? "1px solid rgba(80, 170, 120, 0.5)"
                          : d.isCorrect === false
                            ? "1px solid rgba(216, 117, 117, 0.5)"
                            : "1px solid var(--casis-gold)",
                      background:
                        d.isCorrect === true
                          ? "rgba(80, 170, 120, 0.15)"
                          : d.isCorrect === false
                            ? "rgba(216, 117, 117, 0.15)"
                            : "rgba(173, 149, 100, 0.15)",
                      color:
                        d.isCorrect === true
                          ? "#62c799"
                          : d.isCorrect === false
                            ? "#f08a8a"
                            : "var(--casis-gold)",
                      fontSize: "11px",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {d.isCorrect === true ? "✓" : d.isCorrect === false ? "✕" : i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "var(--casis-text)",
                          lineHeight: "1.6",
                          margin: 0,
                        }}
                      >
                        {i + 1}. {d.prompt}
                      </p>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--casis-gold)",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {d.earned} poin
                      </span>
                    </div>

                    {d.type === "MCQ" ? (
                      <div style={{ marginTop: "12px", fontSize: "13px" }}>
                        <p style={{ color: "var(--casis-muted)", margin: "0 0 6px" }}>
                          Jawaban Anda:{" "}
                          <strong
                            style={{
                              color: d.isCorrect ? "#62c799" : "#f08a8a",
                            }}
                          >
                            {d.userAnswer ? `Opsi ${d.userAnswer}` : "Tidak dijawab"}
                          </strong>
                        </p>
                        {d.correctKey && (
                          <p style={{ color: "var(--casis-muted)", margin: "0 0 10px" }}>
                            Kunci jawaban:{" "}
                            <span style={{ color: "var(--casis-gold)", fontWeight: 600 }}>
                              Opsi {d.correctKey}
                            </span>
                          </p>
                        )}
                        <div style={{ display: "grid", gap: "6px" }}>
                          {(d.options ?? []).map((o) => (
                            <div
                              key={o.key}
                              style={{
                                padding: "8px 12px",
                                fontSize: "12px",
                                border:
                                  o.key === d.correctKey
                                    ? "1px solid rgba(80, 170, 120, 0.5)"
                                    : o.key === d.userAnswer
                                      ? "1px solid rgba(216, 117, 117, 0.5)"
                                      : "1px solid var(--casis-border)",
                                background:
                                  o.key === d.correctKey
                                    ? "rgba(80, 170, 120, 0.1)"
                                    : o.key === d.userAnswer
                                      ? "rgba(216, 117, 117, 0.1)"
                                      : "#080909",
                                color:
                                  o.key === d.correctKey
                                    ? "#b8e2c2"
                                    : o.key === d.userAnswer
                                      ? "#efa3a5"
                                      : "var(--casis-muted)",
                              }}
                            >
                              <strong style={{ marginRight: "6px" }}>{o.key}.</strong> {o.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: "12px", fontSize: "13px" }}>
                        <div
                          style={{
                            padding: "10px 14px",
                            border: "1px solid var(--casis-border)",
                            background: "#080909",
                            color: "var(--casis-text)",
                            lineHeight: "1.6",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {d.userAnswer || (
                            <span style={{ color: "var(--casis-muted)", fontStyle: "italic" }}>
                              Kosong
                            </span>
                          )}
                        </div>
                        {d.matchedKeywords && d.matchedKeywords.length > 0 && (
                          <p
                            style={{
                              marginTop: "8px",
                              fontSize: "11px",
                              color: "var(--casis-muted)",
                            }}
                          >
                            Kata kunci terdeteksi:{" "}
                            <span style={{ color: "var(--casis-gold)" }}>
                              {d.matchedKeywords.join(", ")}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          paddingBottom: "40px",
        }}
      >
        <Link
          href="/dashboard"
          style={{
            flex: 1,
            minWidth: "180px",
            padding: "14px",
            textAlign: "center",
            textDecoration: "none",
            border: "1px solid var(--casis-border)",
            background: "transparent",
            color: "var(--casis-text)",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            transition: "all 0.15s ease",
          }}
        >
          Kembali ke Dashboard
        </Link>
        {resultId && (
          <Link
            href={`/review/${resultId}`}
            style={{
              flex: 1,
              minWidth: "180px",
              padding: "14px",
              textAlign: "center",
              textDecoration: "none",
              border: "1px solid var(--casis-gold)",
              background: "var(--casis-gold)",
              color: "#000000",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transition: "all 0.15s ease",
            }}
          >
            Review Jawaban
          </Link>
        )}
        <Link
          href="/"
          style={{
            flex: 1,
            minWidth: "180px",
            padding: "14px",
            textAlign: "center",
            textDecoration: "none",
            border: "1px solid var(--casis-border)",
            background: "transparent",
            color: "var(--casis-muted)",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            transition: "all 0.15s ease",
          }}
        >
          Beranda Utama
        </Link>
      </div>
    </div>
  );
}
