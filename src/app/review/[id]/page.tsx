"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
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
      <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card strong className="w-full max-w-4xl p-8 space-y-4">
          <Skeleton className="mx-auto h-12 w-12 rounded-full" />
          <Skeleton className="mx-auto h-6 w-48" />
          <Skeleton className="mx-auto h-4 w-64" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="font-display text-xl font-bold text-red-300">Gagal Memuat Review</h1>
          <p className="mt-3 text-sm text-zinc-400">{error}</p>
          <Link href="/hasil" className="mt-6 inline-block">
            <Button variant="ghost">Kembali ke Hasil</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-hero-radial flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Card strong className="w-full max-w-md p-8 text-center animate-scale-in">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
            <span className="text-3xl">📄</span>
          </div>
          <h1 className="font-display text-xl font-bold text-zinc-100">Review Tidak Tersedia</h1>
          <p className="mt-3 text-sm text-zinc-400">Data review untuk hasil ini tidak ditemukan.</p>
          <Link href="/hasil" className="mt-6 inline-block">
            <Button variant="ghost">Kembali ke Hasil</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const correctCount = questions.filter((q) => q.isCorrect).length;
  const totalQuestions = questions.length;

  return (
    <div className="bg-hero-radial min-h-screen px-4 py-12">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <Card strong className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-400">Periode</p>
              <h1 className="font-display text-2xl font-bold gold-text">{summary.periodName}</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-zinc-500">Tanggal Submit</p>
                <p className="font-mono text-sm text-zinc-200">
                  {new Date(summary.submittedAt).toLocaleString("id-ID")}
                </p>
              </div>
              <Badge tone={summary.passed ? "green" : "neutral"} className="text-lg px-4 py-2">
                {summary.status}
              </Badge>
            </div>
          </div>

          {/* Score Summary */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xs text-zinc-500">Total Nilai</p>
              <p className="font-display text-3xl font-bold gold-text">{summary.score}/{summary.maxScore}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xs text-zinc-500">Persentase</p>
              <p className="font-display text-3xl font-bold gold-text">
                {summary.maxScore > 0 ? Math.round((summary.score / summary.maxScore) * 100) : 0}%
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xs text-zinc-500">Pilihan Ganda</p>
              <p className="font-display text-3xl font-bold text-emerald-400">{summary.mcqScore}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xs text-zinc-500">Essay</p>
              <p className="font-display text-3xl font-bold text-gold">{summary.essayScore}</p>
            </div>
          </div>

          <div className="mt-4 text-center">
            <Link href="/hasil">
              <Button variant="ghost">← Kembali ke Rekap</Button>
            </Link>
          </div>
        </Card>

        {/* Questions Review */}
        <Card strong className="p-6">
          <h2 className="font-display text-lg font-bold gold-text mb-4">
            Detail Jawaban ({correctCount}/{totalQuestions} Benar)
          </h2>
          <div className="space-y-6">
            {questions.map((q, idx) => (
              <div key={q.questionId} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <span className="font-mono text-xs text-gold shrink-0">
                    {idx + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100">{q.prompt}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {q.type === "MCQ" ? "Pilihan Ganda" : "Essay"} · {q.points} poin
                    </p>
                  </div>
                  <Badge tone={q.isCorrect ? "green" : "neutral"} className="shrink-0">
                    {q.isCorrect ? "✓ Benar" : "✗ Salah"}
                  </Badge>
                </div>

                {q.type === "MCQ" && q.options && (
                  <div className="space-y-2 ml-6">
                    {q.options.map((opt) => {
                      const isUserAnswer = q.userAnswer === opt.key;
                      const isCorrectAnswer = q.correctKey === opt.key;
                      let tone: "neutral" | "green" | "red" = "neutral";
                      if (isUserAnswer && isCorrectAnswer) tone = "green";
                      else if (isUserAnswer && !isCorrectAnswer) tone = "red";
                      else if (!isUserAnswer && isCorrectAnswer) tone = "green";

                      return (
                        <div
                          key={opt.key}
                          className={`flex items-center gap-2 rounded-lg border p-3 transition ${
                            tone === "green"
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : tone === "red"
                              ? "border-red-500/40 bg-red-500/10"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <span className="font-mono text-sm text-gold shrink-0 w-6">{opt.key}.</span>
                          <span className="text-sm text-zinc-100">{opt.text}</span>
                          {isUserAnswer && (
                            <span className="ml-auto text-xs font-semibold text-emerald-400">Jawaban Anda</span>
                          )}
                          {!isUserAnswer && isCorrectAnswer && (
                            <span className="ml-auto text-xs font-semibold text-emerald-400">Jawaban Benar</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.type === "ESSAY" && (
                  <div className="ml-6 space-y-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="text-xs text-zinc-500 mb-1">Jawaban Anda:</p>
                      <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                        {q.userAnswer || "<i className='text-zinc-600'>Tidak diisi</i>"}
                      </p>
                    </div>
                    {q.keywords && q.keywords.length > 0 && (
                      <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
                        <p className="text-xs text-gold/80 mb-1">Kata kunci penilaian:</p>
                        <div className="flex flex-wrap gap-1">
                          {q.keywords.map((kw) => (
                            <span
                              key={kw}
                              className="rounded bg-gold/20 px-2 py-0.5 text-[11px] font-mono text-gold"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <p className="text-xs text-zinc-500 mb-1">Nilai:</p>
                      <p className="font-display text-lg font-bold gold-text">
                        {q.earnedPoints}/{q.maxPoints}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}