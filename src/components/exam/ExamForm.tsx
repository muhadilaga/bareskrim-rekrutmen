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
  const [violations, setViolations] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      const saved = window.localStorage.getItem(`brk_tab_violations_${attemptId}`);
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [warningModalOpen, setWarningModalOpen] = useState(false);
  const autoSubmittedForCheatingRef = useRef(false);
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
        window.localStorage.removeItem(`brk_tab_violations_${attemptId}`);
      } catch {
        // abaikan
      }
      // Kirim laporan Discord di background secara asynchronous (non-blocking)
      // agar casis langsung diarahkan ke /hasil tanpa terhambat latensi Discord.
      if (json.resultId) {
        void fetch("/api/exam/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ resultId: json.resultId }),
        }).catch(() => null);
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

  // Anti-cheat: deteksi saat casis beralih tab atau membuka aplikasi lain
  useEffect(() => {
    if (submittedRef.current) return;

    // Cek apakah sebelumnya sudah mencapai 3 pelanggaran (misal reload halaman)
    try {
      const current = parseInt(window.localStorage.getItem(`brk_tab_violations_${attemptId}`) || "0", 10);
      if (current >= 3 && !submittedRef.current && !autoSubmittedForCheatingRef.current) {
        setViolations(current);
        setWarningModalOpen(true);
        autoSubmittedForCheatingRef.current = true;
        setTimeout(() => {
          void doSubmit();
        }, 1500);
      }
    } catch {
      // ignore
    }

    let leaveTimestamp = 0;

    function handleVisibilityChange() {
      if (submittedRef.current) return;
      if (document.hidden) {
        // Catat kapan casis meninggalkan tab/aplikasi
        leaveTimestamp = Date.now();
      } else {
        // Casis kembali ke tab
        const timeAwayMs = leaveTimestamp > 0 ? Date.now() - leaveTimestamp : 0;
        // False-positive tolerance: Abaikan jika beralih hanya sekejap (< 3000ms),
        // misal notifikasi masuk, keyboard virtual pop-up, atau orientasi layar ponsel
        if (leaveTimestamp > 0 && timeAwayMs < 3000) {
          return;
        }

        try {
          const currentCount = parseInt(window.localStorage.getItem(`brk_tab_violations_${attemptId}`) || "0", 10);
          const newCount = currentCount + 1;
          window.localStorage.setItem(`brk_tab_violations_${attemptId}`, String(newCount));
          setViolations(newCount);
          setWarningModalOpen(true);

          if (newCount >= 3) {
            if (!submittedRef.current && !autoSubmittedForCheatingRef.current) {
              autoSubmittedForCheatingRef.current = true;
              setTimeout(() => {
                void doSubmit();
              }, 1500);
            }
          }
        } catch {
          // ignore
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [attemptId]);

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

      {/* Modal Peringatan Pelanggaran Pindah Tab / Anti-Cheat */}
      {warningModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.88)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              padding: "28px",
              background: "#120a0b",
              border: "2px solid #b52228",
              borderRadius: "8px",
              boxShadow: "0 0 30px rgba(181, 34, 40, 0.5)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠️</div>
            <h3
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "18px",
                fontWeight: 800,
                color: "#ff6b6b",
                letterSpacing: "0.08em",
                margin: 0,
              }}
            >
              {violations >= 3 ? "BATAS PELANGGARAN TERCAPAI" : `PERINGATAN PELANGGARAN (${violations}/3)`}
            </h3>
            <div
              style={{
                height: "1px",
                background: "rgba(181, 34, 40, 0.4)",
                margin: "16px 0",
              }}
            />
            <p
              style={{
                fontSize: "14px",
                lineHeight: "1.7",
                color: "#f3f4f6",
                margin: 0,
              }}
            >
              {violations >= 3 ? (
                <>
                  Anda telah <strong>3 kali</strong> meninggalkan halaman ujian. Sesuai ketentuan anti-cheat Pusdik Reserse,{" "}
                  <span style={{ color: "#ff6b6b", fontWeight: 700 }}>
                    sesi ujian Anda dihentikan dan seluruh jawaban dikirimkan apa adanya ke sistem.
                  </span>
                </>
              ) : (
                <>
                  Sistem mendeteksi Anda <strong>meninggalkan tab/aplikasi ujian</strong>. Dilarang membuka Google, tab lain, atau aplikasi bantuan selama ujian berlangsung!
                  <br />
                  <br />
                  <span style={{ color: "var(--casis-gold)", fontWeight: 700 }}>
                    Sisa toleransi: {Math.max(0, 3 - violations)} kali lagi.
                  </span>
                  <br />
                  Jika mencapai 3 kali, ujian otomatis diselesaikan secara seadanya.
                </>
              )}
            </p>
            {violations < 3 ? (
              <button
                type="button"
                onClick={() => setWarningModalOpen(false)}
                style={{
                  marginTop: "24px",
                  width: "100%",
                  padding: "12px",
                  background: "#b52228",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                }}
              >
                SAYA MENGERTI & KEMBALI MENGERJAKAN
              </button>
            ) : (
              <div style={{ marginTop: "20px", color: "var(--casis-gold)", fontSize: "13px", fontWeight: 700 }}>
                Mengirimkan jawaban seadanya ke server...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Gate form untuk Casis yang belum memiliki sesi saat membuka /ujian.
 * Meminta verifikasi Username Roblox + PIN 6 Digit (Tahap Akademik).
 */
export function ExamPinGate() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanPin = pin.trim();
    if (!cleanUser || !cleanPin) {
      setError("Username Roblox dan PIN 6 digit wajib diisi.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/exam/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUser, pin: cleanPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.location.reload();
      } else {
        setError(data.message || "Gagal memverifikasi PIN ujian.");
      }
    } catch {
      setError("Terjadi kesalahan koneksi. Silakan periksa jaringan Anda.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="attendance-panel animate-scale-in" style={{ maxWidth: 440, margin: "0 auto" }}>
      <div className="attendance-header">
        <span className="attendance-badge">TAHAP AKADEMIK</span>
        <h2>VERIFIKASI PIN UJIAN</h2>
        <p>
          Masukkan Username Roblox dan PIN Ujian 6 digit yang Anda peroleh setelah status absensi terverifikasi.
        </p>
      </div>

      {error && (
        <div className="attendance-feedback error mb-4">
          <p style={{ fontWeight: 700, margin: 0 }}>⚠️ Verifikasi Gagal</p>
          <p style={{ margin: "4px 0 0" }}>{error}</p>
        </div>
      )}

      <form onSubmit={handleVerify}>
        <div className="attendance-form-group">
          <label htmlFor="pinRobloxUsername">Username Roblox</label>
          <input
            id="pinRobloxUsername"
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Contoh: 4DIBERL4G4"
            autoComplete="username"
          />
        </div>

        <div className="attendance-form-group">
          <label htmlFor="examPinInput">PIN Ujian (6 Digit)</label>
          <input
            id="examPinInput"
            type="text"
            required
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Contoh: 582194"
            autoComplete="one-time-code"
            style={{ letterSpacing: "0.25em", fontFamily: "monospace", fontSize: "18px", textAlign: "center" }}
          />
          <small>PIN dapat dilihat pada kartu status absensi Anda di Dashboard Casis.</small>
        </div>

        <button
          type="submit"
          className="attendance-submit-btn w-full"
          disabled={loading}
          style={{ marginTop: "16px" }}
        >
          {loading ? "MEMVERIFIKASI..." : "MASUK RUANG UJIAN →"}
        </button>

        <div className="mt-4 text-center">
          <a
            href="/dashboard"
            className="text-xs text-gray-400 hover:text-white transition-colors"
            style={{ textDecoration: "none" }}
          >
            ← Kembali ke Dashboard untuk Cek PIN
          </a>
        </div>
      </form>
    </div>
  );
}
