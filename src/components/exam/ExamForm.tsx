"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClientQuestion } from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CountdownTimer } from "@/components/exam/CountdownTimer";
import { MCQQuestion } from "@/components/exam/MCQQuestion";
import { EssayQuestion } from "@/components/exam/EssayQuestion";

export function ExamForm({
  attemptId,
  questions,
  periodName,
  durationMinutes,
  remainingSeconds,
}: {
  attemptId: string;
  questions: ClientQuestion[];
  periodName: string;
  durationMinutes: number;
  remainingSeconds?: number;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = window.localStorage.getItem(`brk_answers_${attemptId}`);
      return saved ? (JSON.parse(saved) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

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

  const durationSeconds = durationMinutes * 60;
  const initialSeconds = remainingSeconds ?? durationSeconds;

  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length,
    [answers, questions]
  );

  async function doSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (json.resultId) {
        fetch("/api/exam/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultId: json.resultId }),
        }).catch(() => {});
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

  const progress = Math.round((answeredCount / questions.length) * 100);

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
          </div>
          <CountdownTimer seconds={initialSeconds} onExpire={onExpire} />
        </div>
      </Card>

      {questions.map((q, i) =>
        q.type === "MCQ" ? (
          <MCQQuestion
            key={q.id}
            question={q}
            index={i}
            value={answers[q.id] ?? ""}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
          />
        ) : (
          <EssayQuestion
            key={q.id}
            question={q}
            index={i}
            value={answers[q.id] ?? ""}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
          />
        )
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
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
