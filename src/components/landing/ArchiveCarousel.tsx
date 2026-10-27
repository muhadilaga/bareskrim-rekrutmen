"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";

export interface ArchiveItem {
  angkatan: string;
  tahun: string;
  gel: string;
  status?: string;
  sortKey?: number;
}

export function ArchiveCarousel({ items }: { items: ArchiveItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [items]);

  const scroll = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const scrollAmount = 340;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div className="archive-carousel-container">
      <div className="archive-carousel-controls">
        <button
          type="button"
          onClick={() => scroll("left")}
          className="archive-carousel-arrow"
          disabled={!canScrollLeft}
          aria-label="Geser arsip ke kiri"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => scroll("right")}
          className="archive-carousel-arrow"
          disabled={!canScrollRight}
          aria-label="Geser arsip ke kanan"
        >
          ›
        </button>
      </div>

      <div className="archive-grid" ref={containerRef}>
        {items.map((item) => (
          <Link
            href="/arsip"
            className="archive-card"
            key={`${item.angkatan}-${item.gel}-${item.tahun}`}
          >
            <div className="archive-card-top">
              <span>{item.angkatan}</span>
              <span>{item.tahun}</span>
            </div>
            <strong>{item.gel}</strong>
            <div className="archive-card-bottom">
              <small
                style={
                  item.status === "BERLANGSUNG" || item.status === "AKTIF"
                    ? { color: "var(--red-bright)", fontWeight: 700 }
                    : undefined
                }
              >
                {item.status || "SELESAI"}
              </small>
              <span>→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
