"use client";

import type { ResultPayload } from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function ResultCard({
  result,
  kkm,
  showAnswers = true,
  resultId,
}: {
  result: ResultPayload;
  kkm: number;
  showAnswers?: boolean;
  resultId?: string;
}) {
  const passed = result.passed;
  const details = result.answersJson;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Ringkasan nilai */}
      <Card strong className="overflow-hidden">
        <div
          className={cn(
            "chequered border-b p-8 text-center",
            passed ? "border-gold/30" : "border-red-500/30"
          )}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Hasil Ujian</p>
          <p className="mt-3 font-display text-6xl font-bold gold-text">{result.score}</p>
          <p className="text-sm text-zinc-400">dari {result.maxScore} poin</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Badge tone={passed ? "green" : "red"} className="text-sm">
              {passed ? "LULUS KKM" : "TIDAK LULUS"}
            </Badge>
            <Badge tone="gold">KKM {kkm}</Badge>
          </div>
          <div className="mx-auto mt-6 h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                "h-full rounded-full",
                passed
                  ? "bg-gradient-to-r from-gold-500 to-gold"
                  : "bg-gradient-to-r from-red-700 to-crimson"
              )}
              style={{ width: `${(result.score / result.maxScore) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
          {[
            { label: "Pilihan Ganda", value: `${result.mcqScore} poin` },
            { label: "Essay", value: `${result.essayScore} poin` },
            { label: "Pangkat", value: result.attempt.user.policeGroupRank ?? "-" },
            {
              label: "Periode",
              value: result.attempt.period.name,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">{s.label}</p>
              <p className="mt-1 truncate text-sm font-semibold text-zinc-100">{s.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Rekap jawaban (hanya untuk tampilan dengan showAnswers) */}
      {showAnswers && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold gold-text">Rekap Jawaban Anda</h2>
          <div className="space-y-3">
            {details.map((d, i) => (
              <Card key={d.questionId} className="p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      d.isCorrect === true
                        ? "bg-emerald-500/20 text-emerald-400"
                        : d.isCorrect === false
                          ? "bg-red-500/20 text-red-400"
                          : "bg-gold/20 text-gold"
                    )}
                  >
                    {d.isCorrect === true ? "✓" : d.isCorrect === false ? "✕" : i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-zinc-100">
                        {i + 1}. {d.prompt}
                      </p>
                      <span className="shrink-0 text-xs text-zinc-500">{d.earned} poin</span>
                    </div>

                    {d.type === "MCQ" ? (
                      <div className="mt-2 space-y-1 text-sm">
                        <p className="text-zinc-400">
                          Jawaban Anda:{" "}
                          <span
                            className={cn(
                              "font-semibold",
                              d.isCorrect ? "text-emerald-400" : "text-red-400"
                            )}
                          >
                            {d.userAnswer ? `Opsi ${d.userAnswer}` : "Tidak dijawab"}
                          </span>
                        </p>
                        {d.correctKey && (
                          <p className="text-zinc-500">
                            Kunci jawaban: <span className="text-gold">Opsi {d.correctKey}</span>
                          </p>
                        )}
                        <div className="mt-1.5 grid gap-1.5">
                          {(d.options ?? []).map((o) => (
                            <div
                              key={o.key}
                              className={cn(
                                "rounded border px-3 py-1.5 text-xs",
                                o.key === d.correctKey
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                  : o.key === d.userAnswer
                                    ? "border-red-500/40 bg-red-500/10 text-red-300"
                                    : "border-white/10 bg-white/5 text-zinc-400"
                              )}
                            >
                              <span className="font-mono font-bold">{o.key}.</span> {o.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 text-sm">
                        <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-zinc-300">
                          {d.userAnswer || <span className="italic text-zinc-600">Kosong</span>}
                        </p>
                        {d.matchedKeywords && d.matchedKeywords.length > 0 && (
                          <p className="mt-1.5 text-xs text-zinc-500">
                            Kata kunci terdeteksi:{" "}
                            <span className="text-gold">{d.matchedKeywords.join(", ")}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pb-10">
        <a href="/" className="flex-1">
          <Button variant="ghost" className="w-full">
            Kembali ke Beranda
          </Button>
        </a>
        {resultId && (
          <a href={`/review/${resultId}`} className="flex-1">
            <Button variant="gold" className="w-full">
              Review Jawaban
            </Button>
          </a>
        )}
        <a href="/hasil" className="flex-1">
          <Button variant="gold" className="w-full">
            Cek Hasil Lain
          </Button>
        </a>
      </div>
    </div>
  );
}
