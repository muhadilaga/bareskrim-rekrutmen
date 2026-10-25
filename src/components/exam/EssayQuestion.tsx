"use client";

import type { ClientQuestion } from "@/types";

export function EssayQuestion({
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
                Esai Analisis Kasus
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

      <div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="Tuliskan analisis, uraian prosedur, atau landasan yuridis secara terperinci..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "14px 16px",
            border: "1px solid var(--casis-border)",
            background: "#080909",
            color: "var(--casis-text)",
            fontFamily: "inherit",
            fontSize: "14px",
            lineHeight: "1.6",
            outline: "none",
            resize: "vertical",
            transition: "border-color 0.15s ease",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--casis-gold)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--casis-border)";
          }}
        />
        <div
          style={{
            marginTop: "8px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: "11px",
            color: "var(--casis-muted)",
          }}
        >
          <span>Uraian harus memenuhi substansi SOP kepolisian.</span>
          <span>{value.length}/4000 karakter</span>
        </div>
      </div>
    </article>
  );
}
