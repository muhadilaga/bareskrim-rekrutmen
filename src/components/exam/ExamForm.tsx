"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ClientQuestion } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
  examStartTime,
  examEndTime,
  serverFlaggedQuestions,
  serverBookmarkedQuestions,
}: {
  attemptId: string;
  questions: ClientQuestion[];
  periodName: string;
  durationMinutes: number;
  remainingSeconds?: number;
  serverSavedAnswers?: Record<string, string> | null;
  examStartTime?: string | null;
  examEndTime?: string | null;
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

   // Cek apakah ujian sudah dimulai / belum berakhir
   const now = Date.now();
   const examStartMs = examStartTime ? new Date(examStartTime).getTime() : null;
   const examEndMs = examEndTime ? new Date(examEndTime).getTime() : null;
   const examNotStarted = examStartMs !== null && now < examStartMs;
   const examAlreadyEnded = examEndMs !== null && now > examEndMs;

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

  // Tampilkan pesan jika ujian belum dimulai
  if (examNotStarted) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card strong className="p-8 text-center animate-scale-in">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/20">
            <span className="text-3xl">⏳</span>
          </div>
          <h1 className="font-display text-xl font-bold text-yellow-300">Ujian Belum Dimulai</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Sesi ujian akan dimulai pada{" "}
            <span className="font-semibold text-gold">
              {examStartTime
                ? new Date(examStartTime).toLocaleString("id-ID")
                : "-"}
            </span>
            . Silakan tunggu.
          </p>
        </Card>
      </div>
    );
  }

  // Tampilkan pesan jika ujian sudah berakhir
  if (examAlreadyEnded) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card strong className="p-8 text-center animate-scale-in">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
            <span className="text-3xl">🔒</span>
          </div>
          <h1 className="font-display text-xl font-bold text-red-300">Ujian Sudah Ditutup</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Sesi ujian sudah berakhir pada{" "}
            <span className="font-semibold text-gold">
              {examEndTime
                ? new Date(examEndTime).toLocaleString("id-ID")
                : "-"}
            </span>
            . Tidak bisa mengakses soal lagi.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card strong className="sticky top-20 z-30 flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Periode</p>
          <p className="font-display text-sm font-bold gold-text">{periodName}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-zinc-500">
              Terjawab <span className="font-bold text-gold">{answeredCount}</span>/{questions.length}
            </p>
            <div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-600" aria-live="polite">
              {saveStatus === "saving" && "Menyimpan..."}
              {saveStatus === "saved" && "Tersimpan"}
              {saveStatus === "error" && (
                <span className="text-red-400" role="alert">Gagal menyimpan</span>
              )}
            </p>
          </div>
          <CountdownTimer seconds={initialSeconds} onExpire={onExpire} />
        </div>
      </Card>

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
      <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-crimson-950/80 p-3 backdrop-blur-sm">
        <span className="mr-2 text-xs font-semibold text-zinc-400">Navigasi:</span>
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
               className={`flex h-8 w-8 items-center justify-center rounded-full border font-mono text-xs font-bold transition ${
                 answered
                   ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                   : isFlagged
                   ? "border-orange-500/40 bg-orange-500/10 text-orange-300"
                   : marked
                     ? "border-gold/40 bg-gold/10 text-gold"
                     : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/30"
               }`}
               title={`Soal ${i + 1}${answered ? " (jawab)" : isFlagged ? " (flag)" : marked ? " (bookmark)" : ""}`}
             >
               {i + 1}
             </button>
           );
         })}
         <div className="ml-2 flex items-center gap-3 text-[10px] text-zinc-500">
           <span className="flex items-center gap-1">
             <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/40" />
             Jawab
           </span>
           <span className="flex items-center gap-1">
             <span className="inline-block h-2 w-2 rounded-full bg-orange-500/40" />
             Flag
           </span>
           <span className="flex items-center gap-1">
             <span className="inline-block h-2 w-2 rounded-full bg-gold/40" />
             Bookmark
           </span>
           <span className="flex items-center gap-1">
             <span className="inline-block h-2 w-2 rounded-full bg-white/10" />
             Kosong
           </span>
         </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="pb-10">
        <Button
          variant="gold"
          className="w-full py-3.5 text-base"
          onClick={() => setConfirmOpen(true)}
          disabled={submitting}
        >
          {submitting ? "Menilai & Mengirim..." : "Submit Ujian Sekarang"}
        </Button>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <Card strong className="w-full max-w-md p-6">
            <h3 className="font-display text-lg font-bold gold-text">Konfirmasi Submit</h3>
            <div className="gold-line my-3" />
            <p className="text-sm leading-relaxed text-zinc-300">
              Anda menjawab <span className="font-bold text-gold">{answeredCount}</span> dari{" "}
              {questions.length} soal. Setelah dikirim, nilai akan langsung dinilai otomatis dan
              <span className="font-bold text-gold"> tidak dapat diulang</span> pada periode ini.
            </p>
            <div className="mt-5 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmOpen(false)}>
                Batal
              </Button>
              <Button variant="gold" className="flex-1" onClick={doSubmit} disabled={submitting}>
                {submitting ? "Mengirim..." : "Ya, Submit"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
