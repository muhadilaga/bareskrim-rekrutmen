"use client";

import type { ClientQuestion } from "@/types";

export function MCQQuestion({
  question,
  index,
  value,
  onChange,
  isBookmarked,
  onToggleBookmark,
  isFlagged,
  onToggleFlag,
}: {
  question: ClientQuestion;
  index: number;
  value: string;
  onChange: (answer: string) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  isFlagged?: boolean;
  onToggleFlag?: () => void;
}) {
  return (
    <article
      id={`question-${question.id}`}
      style={{
        padding: "24px",
        marginBottom: "20px",
        border: isFlagged
          ? "1px solid rgba(224, 148, 64, 0.6)"
          : isBookmarked
            ? "1px solid var(--casis-gold)"
            : "1px solid var(--casis-border)",
        background: "var(--casis-surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--casis-border)",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              border: "1px solid var(--casis-border)",
              background: "#080909",
              color: "var(--casis-gold)",
              fontSize: "12px",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {index + 1}
          </span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.14em",
                  color: "var(--casis-muted)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                Pilihan Ganda
              </span>
              <span style={{ color: "var(--casis-border)" }}>•</span>
              <span
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  color: "var(--casis-gold)",
                  fontWeight: 600,
                }}
              >
                {question.points} POIN
              </span>
            </div>
            <p
              style={{
                marginTop: "8px",
                fontSize: "15px",
                lineHeight: "1.65",
                color: "var(--casis-text)",
                fontWeight: 500,
              }}
            >
              {question.prompt}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {onToggleFlag && (
            <button
              type="button"
              onClick={onToggleFlag}
              aria-label={isFlagged ? "Hapus tanda ragu" : "Tandai ragu"}
              title={isFlagged ? "Hapus tanda ragu" : "Tandai ragu"}
              style={{
                padding: "6px 10px",
                border: isFlagged
                  ? "1px solid rgba(224, 148, 64, 0.6)"
                  : "1px solid var(--casis-border)",
                background: isFlagged ? "rgba(224, 148, 64, 0.15)" : "transparent",
                color: isFlagged ? "#e09440" : "var(--casis-muted)",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s ease",
              }}
            >
              <span>🚩</span>
              <span style={{ fontSize: "10px" }}>RAGU</span>
            </button>
          )}

          {onToggleBookmark && (
            <button
              type="button"
              onClick={onToggleBookmark}
              aria-label={isBookmarked ? "Hapus tanda soal" : "Tandai soal ini"}
              title={isBookmarked ? "Hapus tanda soal" : "Tandai soal ini"}
              style={{
                padding: "6px 10px",
                border: isBookmarked ? "1px solid var(--casis-gold)" : "1px solid var(--casis-border)",
                background: isBookmarked ? "rgba(173, 149, 100, 0.15)" : "transparent",
                color: isBookmarked ? "var(--casis-gold)" : "var(--casis-muted)",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                transition: "all 0.15s ease",
              }}
            >
              <span>⭐</span>
              <span style={{ fontSize: "10px" }}>TANDAI</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {(question.options ?? []).map((opt) => {
          const selected = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "14px",
                padding: "14px 18px",
                border: selected ? "1px solid var(--casis-gold)" : "1px solid var(--casis-border)",
                background: selected ? "rgba(173, 149, 100, 0.12)" : "#080909",
                color: selected ? "#ffffff" : "var(--casis-text)",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                fontSize: "14px",
                lineHeight: "1.6",
                transition: "all 0.15s ease",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "24px",
                  height: "24px",
                  border: selected ? "1px solid var(--casis-gold)" : "1px solid var(--casis-border)",
                  background: selected ? "var(--casis-gold)" : "rgba(255, 255, 255, 0.05)",
                  color: selected ? "#000000" : "var(--casis-muted)",
                  fontSize: "11px",
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                {opt.key}
              </span>
              <span style={{ flex: 1, marginTop: "1px" }}>{opt.text}</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}
