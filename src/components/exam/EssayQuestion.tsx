"use client";

import type { ClientQuestion } from "@/types";
import { Card } from "@/components/ui/Card";

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
    <Card className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/90 font-display text-sm font-bold text-crimson-950">
          {index + 1}
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-100">{question.prompt}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">
            Uraian / Essay · {question.points} poin
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

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        maxLength={4000}
        placeholder="Tulis jawaban Anda di sini..."
        className="w-full resize-y rounded-lg border border-white/15 bg-black/30 px-4 py-3 text-sm leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold/60 focus:ring-2 focus:ring-gold/20"
      />
      <p className="mt-1 text-right text-[11px] text-zinc-600">
        {value.length}/4000 karakter
      </p>
    </Card>
  );
}
