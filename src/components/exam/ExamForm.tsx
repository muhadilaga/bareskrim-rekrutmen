"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ClientQuestion } from "@/types";
import { CountdownTimer } from "@/components/exam/CountdownTimer";
import { MCQQuestion } from "@/components/exam/MCQQuestion";
import { EssayQuestion } from "@/components/exam/EssayQuestion";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ExamForm({
  attemptId,
  questions,
  periodName,
  durationMinutes,
  remainingSeconds,
  serverSavedAnswers,
  serverFlaggedQuestions,
  serverBookmarkedQuestions,
}: {
  attemptId: string;
  questions: ClientQuestion[];
  periodName: string;
  durationMinutes: number;
  remainingSeconds?: number;
  serverSavedAnswers?: Record<string, string> | null;
  serverFlaggedQuestions?: string[];
  serverBookmarkedQuestions?: string[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      // Merge: localStorage (paling recent) > server savedAnswers
      const local = window.localStorage.getItem(`brk_answers_${attemptId}`);
      const localParsed = local ? (JSON.parse(local) as Record<string, string>) : {};
      const server = serverSavedAnswers ?? {};
      // Server sebagai dasar, localStorage overlay di atas
      return { ...server, ...localParsed };
    } catch {
      return serverSavedAnswers ?? {};
    }
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const submittedRef = useRef(false);
  const lastSavedRef = useRef<string>("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleRef = useRef<number>(0);
const [bookmarked, setBookmarked] = useState<Set<string>>(() => {
      if (typeof window === "undefined") return new Set(serverBookmarkedQuestions ?? []);
      try {
        const saved = window.localStorage.getItem(`brk_bookmarks_${attemptId}`);
        let local: string[] = saved ? JSON.parse(saved) : [];
        // Merge server data as base, overlay local (most recent)
        const merged = new Set([...(serverBookmarkedQuestions ?? []), ...local]);
        return merged;
      } catch {
        return new Set(serverBookmarkedQuestions ?? []);
      }
    });
    const [flagged, setFlagged] = useState<Set<string>>(() => {
      if (typeof window === "undefined") return new Set(serverFlaggedQuestions ?? []);
      try {
        const saved = window.localStorage.getItem(`brk_flags_${attemptId}`);
        let local: string[] = saved ? JSON.parse(saved) : [];
        // Merge server data as base, overlay local (most recent)
        const merged = new Set([...(serverFlaggedQuestions ?? []), ...local]);
        return merged;
      } catch {
        return new Set(serverFlaggedQuestions ?? []);
      }
    });

   // Jendela examStartTime/examEndTime hanya menolak attempt BARU di server.
   // Form ini hanya dirender untuk attempt yang sudah berjalan; gerbang submit
   // adalah timer pribadi (remainingSeconds), bukan jam tutup periode.

   // Peringatan saat user mau keluar dari halaman ujian
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Simpan jawaban ke localStorage agar auto-submit saat waktu habis
  // tetap mengirim jawaban asli meskipun halaman di-refresh.
  useEffect(() => {
    try {
      window.localStorage.setItem(`brk_answers_${attemptId}`, JSON.stringify(answers));
    } catch {
      // abaikan bila storage penuh / tidak tersedia
    }
  }, [answers, attemptId]);

  // Simpan bookmark ke localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(
        `brk_bookmarks_${attemptId}`,
        JSON.stringify([...bookmarked])
      );
    } catch {
      // abaikan
    }
  }, [bookmarked, attemptId]);

  // Simpan flag ke localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(
        `brk_flags_${attemptId}`,
        JSON.stringify([...flagged])
      );
    } catch {
      // abaikan
    }
  }, [flagged, attemptId]);

  // Auto-save ke server (debounce 5s, throttle max 1x per 15s)
  const saveToServer = useCallback(
    async (currentAnswers: Record<string, string>, currentFlagged: Set<string>, currentBookmarked: Set<string>) => {
      const snapshot = JSON.stringify({ currentAnswers, currentFlagged: [...currentFlagged], currentBookmarked: [...currentBookmarked] });
      if (snapshot === lastSavedRef.current) return; // tidak ada perubahan

      // Throttle: jangan save jika baru saja save (15 detik)
      const now = Date.now();
      if (now - throttleRef.current < 15_000) return;

      throttleRef.current = now;
      setSaveStatus("saving");
      try {
        const res = await fetch("/api/exam/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            attemptId,
            answers: currentAnswers,
            flaggedQuestions: [...currentFlagged],
            bookmarkedQuestions: [...currentBookmarked],
          }),
        });
        const json = await res.json();
        if (json.ok) {
          lastSavedRef.current = snapshot;
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      } catch {
        setSaveStatus("error");
      }
    },
    [attemptId]
  );

  // Debounce: trigger save 5 detik setelah perubahan terakhir
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToServer(answers, flagged, bookmarked);
    }, 5_000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [answers, flagged, bookmarked, saveToServer]);

  function toggleBookmark(questionId: string) {
    setBookmarked((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  function toggleFlag(questionId: string) {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  const durationSeconds = durationMinutes * 60;
  const initialSeconds = remainingSeconds ?? durationSeconds;

  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length,
    [answers, questions]
  );

  const unansweredCount = questions.length - answeredCount;
  const bookmarkedCount = bookmarked.size;

  const progress = Math.round((answeredCount / questions.length) * 100);

  async function doSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          attemptId,
          answers: questions.map((q) => ({
            questionId: q.id,
            answer: answers[q.id] ?? "",
          })),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.message ?? "Gagal mengirim jawaban.");
        submittedRef.current = false;
        setSubmitting(false);
        return;
      }
      try {
        window.localStorage.removeItem(`brk_answers_${attemptId}`);
      } catch {
        // abaikan
      }
       // Kirim laporan Discord di request terpisah (best-effort) agar
       // respons submit tidak menunggu webhook dan tidak kena timeout.
       // Retry realtime 3x sebelum disimpan untuk cron retry.
       if (json.resultId) {
         const retryDelay = [2000, 4000, 8000];
         let reportOk = false;

         for (let i = 0; i < retryDelay.length; i++) {
           try {
             const res = await fetch("/api/exam/report", {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               credentials: "include",
               body: JSON.stringify({ resultId: json.resultId }),
             });
             const d = await res.json().catch(() => null);
             console.log("[ExamReport] response:", d);
             if (d?.ok || !d?.queued) {
               reportOk = true;
               break;
             }
           } catch {
             // network error, retry
           }
           if (i < retryDelay.length - 1) {
             await new Promise((r) => setTimeout(r, retryDelay[i]));
           }
         }

         if (!reportOk) {
           console.warn("[ExamReport] All retries failed, queued for cron.");
         }
       }
      router.replace("/hasil");
    } catch {
      setError("Kesalahan jaringan saat mengirim. Coba lagi.");
      submittedRef.current = false;
      setSubmitting(false);
    }
  }

  function onExpire() {
    if (!submittedRef.current) void doSubmit();
  }

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto" }}>
      <div
        style={{
          position: "sticky",
          top: "16px",
          zIndex: 30,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          padding: "16px 20px",
          background: "rgba(10, 11, 12, 0.92)",
          backdropFilter: "blur(8px)",
          border: "1px solid var(--casis-border)",
          marginBottom: "24px",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "var(--casis-muted)",
              margin: 0,
              fontWeight: 700,
            }}
          >
            Periode Seleksi
          </p>
          <p
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "14px",
              fontWeight: 700,
              color: "var(--casis-gold)",
              letterSpacing: "0.06em",
              margin: "4px 0 0 0",
            }}
          >
            {periodName}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "11px", color: "var(--casis-muted)", margin: 0 }}>
              Terjawab{" "}
              <strong style={{ color: "var(--casis-gold)" }}>{answeredCount}</strong>/
              {questions.length}
            </p>
            <div
              style={{
                marginTop: "6px",
                height: "4px",
                width: "130px",
                background: "rgba(255, 255, 255, 0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background: "var(--casis-gold)",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
            <p
              style={{
                marginTop: "4px",
                fontSize: "10px",
                color: "var(--casis-muted)",
                margin: "4px 0 0 0",
              }}
              aria-live="polite"
            >
              {saveStatus === "saving" && "Menyimpan draf..."}
              {saveStatus === "saved" && "Draf tersimpan"}
              {saveStatus === "error" && (
                <span style={{ color: "#f08a8a" }} role="alert">
                  Gagal menyimpan draf
                </span>
              )}
            </p>
          </div>
          <CountdownTimer seconds={initialSeconds} onExpire={onExpire} />
        </div>
      </div>

      {questions.map((q, i) => (
        <div id={`question-${q.id}`} key={q.id}>
          {q.type === "MCQ" ? (
            <MCQQuestion
              question={q}
              index={i}
              value={answers[q.id] ?? ""}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              isBookmarked={bookmarked.has(q.id)}
              onToggleBookmark={() => toggleBookmark(q.id)}
              isFlagged={flagged.has(q.id)}
              onToggleFlag={() => toggleFlag(q.id)}
            />
          ) : (
            <EssayQuestion
              question={q}
              index={i}
              value={answers[q.id] ?? ""}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
              isBookmarked={bookmarked.has(q.id)}
              onToggleBookmark={() => toggleBookmark(q.id)}
              isFlagged={flagged.has(q.id)}
              onToggleFlag={() => toggleFlag(q.id)}
            />
          )}
        </div>
      ))}

      {/* Navigation summary */}
      <div
        style={{
          position: "sticky",
          bottom: "16px",
          zIndex: 20,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px",
          padding: "14px 18px",
          background: "rgba(10, 11, 12, 0.95)",
          backdropFilter: "blur(8px)",
          border: "1px solid var(--casis-border)",
          marginBottom: "20px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--casis-muted)",
            textTransform: "uppercase",
            marginRight: "6px",
          }}
        >
          Navigasi:
        </span>
        {questions.map((q, i) => {
          const answered = (answers[q.id] ?? "").trim().length > 0;
          const marked = bookmarked.has(q.id);
          const isFlagged = flagged.has(q.id);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                const el = document.getElementById(`question-${q.id}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              style={{
                width: "30px",
                height: "30px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                border: answered
                  ? "1px solid rgba(80, 170, 120, 0.6)"
                  : isFlagged
                    ? "1px solid rgba(224, 148, 64, 0.6)"
                    : marked
                      ? "1px solid var(--casis-gold)"
                      : "1px solid var(--casis-border)",
                background: answered
                  ? "rgba(80, 170, 120, 0.15)"
                  : isFlagged
                    ? "rgba(224, 148, 64, 0.15)"
                    : marked
                      ? "rgba(173, 149, 100, 0.15)"
                      : "#080909",
                color: answered
                  ? "#62c799"
                  : isFlagged
                    ? "#e09440"
                    : marked
                      ? "var(--casis-gold)"
                      : "var(--casis-muted)",
                transition: "all 0.15s ease",
              }}
              title={`Soal ${i + 1}${answered ? " (jawab)" : isFlagged ? " (flag)" : marked ? " (bookmark)" : ""}`}
            >
              {i + 1}
            </button>
          );
        })}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "10px",
            color: "var(--casis-muted)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "8px", background: "rgba(80, 170, 120, 0.6)" }} />
            Terjawab
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "8px", background: "rgba(224, 148, 64, 0.6)" }} />
            Ragu
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "8px", background: "var(--casis-gold)" }} />
            Ditandai
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <span style={{ width: "8px", height: "8px", background: "var(--casis-border)" }} />
            Kosong
          </span>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            border: "1px solid rgba(216, 117, 117, 0.5)",
            background: "rgba(37, 19, 19, 0.7)",
            padding: "14px 18px",
            fontSize: "13px",
            color: "#f08a8a",
            marginBottom: "20px",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ paddingBottom: "40px" }}>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={submitting}
          style={{
            width: "100%",
            padding: "16px",
            background: "var(--casis-gold)",
            color: "#000000",
            border: "1px solid var(--casis-gold)",
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "14px",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.6 : 1,
            transition: "all 0.2s ease",
          }}
        >
          {submitting ? "Menilai & Mengirim Ujian..." : "Kirim Jawaban Ujian"}
        </button>
      </div>

      {confirmOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.8)",
            backdropFilter: "blur(6px)",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              padding: "28px",
              background: "#0d0e10",
              border: "1px solid var(--casis-border)",
            }}
          >
            <h3
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "18px",
                fontWeight: 700,
                color: "var(--casis-gold)",
                letterSpacing: "0.08em",
                margin: 0,
              }}
            >
              KONFIRMASI PENYERAHAN
            </h3>
            <div
              style={{
                height: "1px",
                background: "var(--casis-border)",
                margin: "16px 0",
              }}
            />
            <p
              style={{
                fontSize: "13px",
                lineHeight: "1.7",
                color: "var(--casis-text)",
                margin: 0,
              }}
            >
              Anda telah menjawab{" "}
              <strong style={{ color: "var(--casis-gold)" }}>{answeredCount}</strong> dari{" "}
              <strong>{questions.length}</strong> butir soal. Setelah dikirim, jawaban akan dinilai oleh sistem dan{" "}
              <span style={{ color: "#f08a8a" }}>tidak dapat diubah atau diulang kembali</span>.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "transparent",
                  color: "var(--casis-muted)",
                  border: "1px solid var(--casis-border)",
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                }}
              >
                BATAL
              </button>
              <button
                type="button"
                onClick={doSubmit}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "var(--casis-gold)",
                  color: "#000000",
                  border: "1px solid var(--casis-gold)",
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "MENGIRIM..." : "YA, SERAHKAN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
