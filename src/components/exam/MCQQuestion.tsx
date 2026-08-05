"use client";

import type { ClientQuestion } from "@/types";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

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
    <Card className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-crimson-800/80 font-display text-sm font-bold text-gold">
          {index + 1}
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-100">{question.prompt}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">
            Pilihan Ganda · {question.points} poin
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onToggleFlag && (
            <button
              type="button"
              onClick={onToggleFlag}
              aria-label={isFlagged ? "Hapus flag" : "Tambah flag"}
              className={`shrink-0 text-lg transition ${
                isFlagged ? "text-orange-400" : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {isFlagged ? "🚩" : "🏳️"}
            </button>
          )}
          {onToggleBookmark && (
            <button
              type="button"
              onClick={onToggleBookmark}
              aria-label={isBookmarked ? "Hapus bookmark" : "Tambah bookmark"}
              className={`shrink-0 text-lg transition ${
                isBookmarked ? "text-gold" : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {isBookmarked ? "📌" : "☆"}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-2.5">
        {(question.options ?? []).map((opt) => {
          const selected = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition",
                selected
                  ? "border-gold bg-gold/15 text-gold shadow-glow"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:border-gold/40 hover:bg-white/10"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold",
                  selected ? "border-gold bg-gold text-crimson-950" : "border-white/25 text-zinc-400"
                )}
              >
                {opt.key}
              </span>
              <span className="flex-1">{opt.text}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
