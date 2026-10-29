"use client";

import { useState, useEffect, useCallback } from "react";

export interface GalleryItem {
  id: string;
  title: string;
  category: "Pendidikan" | "Latihan Taktis" | "Operasional" | "Propaganda" | "Kegiatan";
  src: string;
  caption: string;
}

export const GALLERY_ITEMS: GalleryItem[] = [];

export function GalleryViewer() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const selectedItem =
    selectedIndex !== null && GALLERY_ITEMS[selectedIndex]
      ? GALLERY_ITEMS[selectedIndex]
      : null;

  const handlePrev = useCallback(() => {
    if (selectedIndex === null) return;
    setSelectedIndex((prev) => (prev! > 0 ? prev! - 1 : GALLERY_ITEMS.length - 1));
  }, [selectedIndex]);

  const handleNext = useCallback(() => {
    if (selectedIndex === null) return;
    setSelectedIndex((prev) => (prev! < GALLERY_ITEMS.length - 1 ? prev! + 1 : 0));
  }, [selectedIndex]);

  const handleClose = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIndex, handleClose, handlePrev, handleNext]);

  return (
    <div className="w-full">
      {/* Grid of Images */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {GALLERY_ITEMS.map((item, idx) => (
          <div
            key={item.id}
            onClick={() => setSelectedIndex(idx)}
            className="group relative cursor-pointer overflow-hidden rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0c0d0f] transition duration-200 hover:-translate-y-1 hover:border-[#d4af37]/50 hover:shadow-lg hover:shadow-black/60"
          >
            {/* Image Aspect Box */}
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/60">
              <img
                src={item.src}
                alt={item.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute top-3 left-3">
                <span className="rounded border border-[rgba(212,175,55,0.3)] bg-black/70 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase text-[#d4af37] backdrop-blur">
                  {item.category}
                </span>
              </div>
              <div className="absolute top-3 right-3 font-mono text-[10px] text-[rgba(255,255,255,0.4)]">
                {String(idx + 1).padStart(2, "0")}
              </div>
            </div>

            {/* Caption */}
            <div className="p-4">
              <h3 className="font-display text-sm font-semibold tracking-wide text-white transition group-hover:text-[#d4af37]">
                {item.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs text-[var(--muted,#71717a)]">
                {item.caption}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={handleClose}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[rgba(212,175,55,0.3)] bg-[#0d0e11] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="rounded border border-[#d4af37]/40 bg-[#d4af37]/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#d4af37]">
                  {selectedItem.category}
                </span>
                <span className="font-display text-sm font-semibold text-white">
                  {selectedItem.title}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-[var(--muted,#71717a)]">
                  {selectedIndex! + 1} / {GALLERY_ITEMS.length}
                </span>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex h-7 w-7 items-center justify-center rounded border border-[rgba(255,255,255,0.1)] text-zinc-400 hover:border-white/40 hover:text-white"
                  aria-label="Tutup pratinjau"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Image Area */}
            <div className="relative flex max-h-[68vh] items-center justify-center bg-black/80">
              <img
                src={selectedItem.src}
                alt={selectedItem.title}
                className="max-h-[68vh] w-auto max-w-full object-contain"
              />

              {/* Prev / Next Nav */}
              {GALLERY_ITEMS.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Foto sebelumnya"
                    className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur transition hover:border-[#d4af37] hover:text-[#d4af37]"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Foto berikutnya"
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur transition hover:border-[#d4af37] hover:text-[#d4af37]"
                  >
                    ›
                  </button>
                </>
              )}
            </div>

            {/* Modal Footer Caption */}
            <div className="border-t border-[rgba(255,255,255,0.08)] bg-[#090a0c] px-5 py-3">
              <p className="text-xs text-[var(--muted,#a1a1aa)]">
                {selectedItem.caption}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
