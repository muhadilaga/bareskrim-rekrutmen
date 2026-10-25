"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { SiteContent } from "@/lib/site-content";
import { defaultSiteContent } from "@/lib/site-content";
import { useToastContext } from "@/components/ui/Toast";

interface ContentSettingsTabProps {
  headers: Record<string, string>;
}

export function ContentSettingsTab({ headers }: ContentSettingsTabProps) {
  const [content, setContent] = useState<SiteContent>(defaultSiteContent);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"hero" | "card" | "intro" | "pillars" | "rekrutmen" | "tentang" | "arsip">("hero");
  const toast = useToastContext();

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/content-settings", { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.content) {
          setContent(json.content);
        }
      }
    } catch {
      toast.error("Gagal memuat pengaturan konten.");
    } finally {
      setLoading(false);
    }
  }, [headers, toast]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleChange = (field: keyof SiteContent, value: string) => {
    setContent((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/content-settings", {
        method: "POST",
        headers,
        body: JSON.stringify(content),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        toast.success("Konten website berhasil diperbarui dan disimpan!");
      } else {
        toast.error(json.message ?? "Gagal menyimpan konten.");
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan saat menyimpan konten.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-panel">
        <div className="empty-icon">⏳</div>
        <h3>Memuat Pengaturan Konten...</h3>
        <p>Mengambil teks konfigurasi website dari database.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <span className="section-kicker">CONTENT MANAGER</span>
          <h2 className="text-xl font-bold font-serif text-[#eeeae2]">Pengaturan Teks & Konten Web</h2>
          <p className="text-xs text-[#918d86]">
            Ubah teks dan detail copy yang tampil pada landing page, rekrutmen, tentang, dan arsip secara langsung.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadContent}
            className="outline-button"
            disabled={saving}
          >
            Reset / Muat Ulang
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={saving}
          >
            {saving ? "Menyimpan..." : "Simpan Perubahan Teks →"}
          </button>
        </div>
      </div>

      {/* Section Subnav */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3 text-xs">
        {[
          { id: "hero", label: "Hero Beranda" },
          { id: "card", label: "Kartu Rekrutmen" },
          { id: "intro", label: "Intro Beranda" },
          { id: "pillars", label: "Nilai & Pilar" },
          { id: "rekrutmen", label: "Halaman Rekrutmen" },
          { id: "tentang", label: "Halaman Tentang" },
          { id: "arsip", label: "Halaman Arsip & Footer" },
        ].map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setActiveSection(sec.id as any)}
            className={`px-3 py-1.5 rounded transition ${
              activeSection === sec.id
                ? "bg-[#b52228] text-white font-semibold"
                : "bg-white/5 text-[#918d86] hover:text-white hover:bg-white/10"
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* Section 1: Hero Beranda */}
      {activeSection === "hero" && (
        <div className="space-y-4">
          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Hero Section (Beranda)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">KICKER / EYEBROW HERO</label>
                <input
                  type="text"
                  value={content.heroKicker}
                  onChange={(e) => handleChange("heroKicker", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL UTAMA HERO</label>
                <input
                  type="text"
                  value={content.heroTitle}
                  onChange={(e) => handleChange("heroTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">DESKRIPSI HERO</label>
                <textarea
                  rows={3}
                  value={content.heroDescription}
                  onChange={(e) => handleChange("heroDescription", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">LABEL TOMBOL UTAMA</label>
                <input
                  type="text"
                  value={content.heroCtaPrimary}
                  onChange={(e) => handleChange("heroCtaPrimary", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">LABEL TOMBOL SEKUNDER</label>
                <input
                  type="text"
                  value={content.heroCtaSecondary}
                  onChange={(e) => handleChange("heroCtaSecondary", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: Kartu Rekrutmen */}
      {activeSection === "card" && (
        <div className="space-y-4">
          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Kartu Rekrutmen Aktif (Sidebar Hero)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">TOPLINE KARTU</label>
                <input
                  type="text"
                  value={content.recruitmentCardTopline}
                  onChange={(e) => handleChange("recruitmentCardTopline", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">TAHUN PENERIMAAN</label>
                <input
                  type="text"
                  value={content.recruitmentYear}
                  onChange={(e) => handleChange("recruitmentYear", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">NAMA ANGKATAN</label>
                <input
                  type="text"
                  value={content.recruitmentTitle}
                  onChange={(e) => handleChange("recruitmentTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">GELOMBANG</label>
                <input
                  type="text"
                  value={content.recruitmentWave}
                  onChange={(e) => handleChange("recruitmentWave", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">STATUS PENDAFTARAN</label>
                <input
                  type="text"
                  value={content.recruitmentStatus}
                  onChange={(e) => handleChange("recruitmentStatus", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">RENTANG TANGGAL DITAMPILKAN</label>
                <input
                  type="text"
                  value={content.recruitmentDates}
                  onChange={(e) => handleChange("recruitmentDates", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Intro Beranda */}
      {activeSection === "intro" && (
        <div className="space-y-4">
          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Bagian Intro & Filosofi Beranda
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">KICKER INTRO</label>
                <input
                  type="text"
                  value={content.introKicker}
                  onChange={(e) => handleChange("introKicker", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL INTRO</label>
                <input
                  type="text"
                  value={content.introTitle}
                  onChange={(e) => handleChange("introTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">PARAGRAF INTRO</label>
                <textarea
                  rows={3}
                  value={content.introBody}
                  onChange={(e) => handleChange("introBody", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">LABEL TOMBOL INTRO</label>
                <input
                  type="text"
                  value={content.introCta}
                  onChange={(e) => handleChange("introCta", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 4: Nilai & Pilar */}
      {activeSection === "pillars" && (
        <div className="space-y-4">
          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Tiga Nilai Dasar Pendidikan
            </h3>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3 border-b border-white/10 pb-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">PILAR 1 (JUDUL)</label>
                  <input
                    type="text"
                    value={content.pilar1Title}
                    onChange={(e) => handleChange("pilar1Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">DESKRIPSI PILAR 1</label>
                  <input
                    type="text"
                    value={content.pilar1Desc}
                    onChange={(e) => handleChange("pilar1Desc", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 border-b border-white/10 pb-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">PILAR 2 (JUDUL)</label>
                  <input
                    type="text"
                    value={content.pilar2Title}
                    onChange={(e) => handleChange("pilar2Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">DESKRIPSI PILAR 2</label>
                  <input
                    type="text"
                    value={content.pilar2Desc}
                    onChange={(e) => handleChange("pilar2Desc", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">PILAR 3 (JUDUL)</label>
                  <input
                    type="text"
                    value={content.pilar3Title}
                    onChange={(e) => handleChange("pilar3Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">DESKRIPSI PILAR 3</label>
                  <input
                    type="text"
                    value={content.pilar3Desc}
                    onChange={(e) => handleChange("pilar3Desc", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Call to Action Penutup (Landing Bawah)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">KICKER PENUTUP</label>
                <input
                  type="text"
                  value={content.closingKicker}
                  onChange={(e) => handleChange("closingKicker", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL PENUTUP</label>
                <input
                  type="text"
                  value={content.closingTitle}
                  onChange={(e) => handleChange("closingTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">DESKRIPSI PENUTUP</label>
                <input
                  type="text"
                  value={content.closingBody}
                  onChange={(e) => handleChange("closingBody", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 5: Halaman Rekrutmen */}
      {activeSection === "rekrutmen" && (
        <div className="space-y-4">
          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Header & Hero Rekrutmen (/rekrutmen)
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#b79b69]">NOMOR ANGKATAN (MISAL: 43 ATAU XLI)</label>
                <input
                  type="text"
                  value={content.rekrutmenAngkatan || ""}
                  onChange={(e) => handleChange("rekrutmenAngkatan", e.target.value)}
                  placeholder="43"
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">KICKER / LABEL HERO</label>
                <input
                  type="text"
                  value={content.rekrutmenKicker}
                  onChange={(e) => handleChange("rekrutmenKicker", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL HALAMAN (TITLE)</label>
                <input
                  type="text"
                  value={content.rekrutmenTitle}
                  onChange={(e) => handleChange("rekrutmenTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">SUBTITLE / PENGANTAR</label>
                <textarea
                  rows={2}
                  value={content.rekrutmenSubtitle}
                  onChange={(e) => handleChange("rekrutmenSubtitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>

          <div className="panel-card p-5">
            <div className="mb-4">
              <h3 className="card-heading text-sm font-bold uppercase tracking-wider text-[#b79b69]">
                Seksi Persyaratan Seleksi
              </h3>
              <p className="text-[11px] text-[#918d86] mt-0.5">
                Bagian tahapan di seksi atas telah dihapus dan disatukan ke seksi Jadwal. Kolom ini kini khusus untuk 4 butir kriteria persyaratan.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 border-b border-white/10 pb-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">SYARAT 1: JUDUL</label>
                  <input
                    type="text"
                    value={content.rekrutmenSyarat1Title}
                    onChange={(e) => handleChange("rekrutmenSyarat1Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                    placeholder="Identitas Peserta"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">SYARAT 1: DESKRIPSI</label>
                  <input
                    type="text"
                    value={content.rekrutmenSyarat1}
                    onChange={(e) => handleChange("rekrutmenSyarat1", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 border-b border-white/10 pb-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">SYARAT 2: JUDUL</label>
                  <input
                    type="text"
                    value={content.rekrutmenSyarat2Title}
                    onChange={(e) => handleChange("rekrutmenSyarat2Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                    placeholder="Kepangkatan"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">SYARAT 2: DESKRIPSI</label>
                  <input
                    type="text"
                    value={content.rekrutmenSyarat2}
                    onChange={(e) => handleChange("rekrutmenSyarat2", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 border-b border-white/10 pb-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">SYARAT 3: JUDUL</label>
                  <input
                    type="text"
                    value={content.rekrutmenSyarat3Title}
                    onChange={(e) => handleChange("rekrutmenSyarat3Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                    placeholder="Integritas & Afiliasi"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">SYARAT 3: DESKRIPSI</label>
                  <input
                    type="text"
                    value={content.rekrutmenSyarat3}
                    onChange={(e) => handleChange("rekrutmenSyarat3", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">SYARAT 4: JUDUL</label>
                  <input
                    type="text"
                    value={content.rekrutmenSyarat4Title}
                    onChange={(e) => handleChange("rekrutmenSyarat4Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                    placeholder="Kesiapan & Komitmen Seleksi"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">SYARAT 4: DESKRIPSI</label>
                  <input
                    type="text"
                    value={content.rekrutmenSyarat4}
                    onChange={(e) => handleChange("rekrutmenSyarat4", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Seksi Jadwal Seleksi (Schedule)
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">EYEBROW JADWAL</label>
                <input
                  type="text"
                  value={content.rekrutmenJadwalEyebrow}
                  onChange={(e) => handleChange("rekrutmenJadwalEyebrow", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  placeholder="IMPORTANT DATES"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL JADWAL</label>
                <input
                  type="text"
                  value={content.rekrutmenJadwalTitle}
                  onChange={(e) => handleChange("rekrutmenJadwalTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  placeholder="Catat tahapannya."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">DESKRIPSI JADWAL</label>
                <input
                  type="text"
                  value={content.rekrutmenJadwalSubtitle}
                  onChange={(e) => handleChange("rekrutmenJadwalSubtitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>

            <div className="mt-6 border-t border-white/10 pt-4">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#b79b69]">
                Pengaturan 4 Tahap Seleksi
              </h4>
              <div className="space-y-4">
                {[
                  { key: "rekrutmenTahap1", defaultTag: "TAHAP 01", defaultTitle: "Pembukaan Pendaftaran", defaultState: "DIBUKA" },
                  { key: "rekrutmenTahap2", defaultTag: "TAHAP 02", defaultTitle: "Verifikasi Administrasi", defaultState: "TERJADWAL" },
                  { key: "rekrutmenTahap3", defaultTag: "TAHAP 03", defaultTitle: "Pelaksanaan Seleksi", defaultState: "TERJADWAL" },
                  { key: "rekrutmenTahap4", defaultTag: "TAHAP 04", defaultTitle: "Pengumuman Hasil Seleksi", defaultState: "TERJADWAL" },
                ].map((t, idx) => (
                  <div key={t.key} className="grid grid-cols-1 gap-2 rounded border border-white/5 bg-black/20 p-3 sm:grid-cols-4">
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-[#918d86]">TAG TAHAP {idx + 1}</label>
                      <input
                        type="text"
                        value={content[`${t.key}Tag` as keyof typeof content] as string || ""}
                        onChange={(e) => handleChange(`${t.key}Tag` as keyof typeof content, e.target.value)}
                        placeholder={t.defaultTag}
                        className="w-full rounded border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-[#eeeae2] focus:border-[#b79b69]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold text-[#918d86]">NAMA TAHAPAN</label>
                      <input
                        type="text"
                        value={content[`${t.key}Title` as keyof typeof content] as string || ""}
                        onChange={(e) => handleChange(`${t.key}Title` as keyof typeof content, e.target.value)}
                        placeholder={t.defaultTitle}
                        className="w-full rounded border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-[#eeeae2] focus:border-[#b79b69]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-[#918d86]">STATUS BADGE</label>
                      <input
                        type="text"
                        value={content[`${t.key}State` as keyof typeof content] as string || ""}
                        onChange={(e) => handleChange(`${t.key}State` as keyof typeof content, e.target.value)}
                        placeholder={t.defaultState}
                        className="w-full rounded border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-[#eeeae2] focus:border-[#b79b69]"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-[11px] font-semibold text-[#918d86]">
                        TANGGAL / WAKTU (OPSIONAL — KOSONGKAN JIKA TANPA TANGGAL)
                      </label>
                      <input
                        type="text"
                        value={content[`${t.key}Date` as keyof typeof content] as string || ""}
                        onChange={(e) => handleChange(`${t.key}Date` as keyof typeof content, e.target.value)}
                        placeholder="Contoh: 01 - 10 OKTOBER 2026 (kosongkan jika tidak ingin menampilkan angka/tanggal)"
                        className="w-full rounded border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-[#eeeae2] focus:border-[#b79b69]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Call to Action Bawah Rekrutmen
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL CTA</label>
                <input
                  type="text"
                  value={content.rekrutmenCtaTitle}
                  onChange={(e) => handleChange("rekrutmenCtaTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  placeholder="Siap mengambil langkah pertama?"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">SUBTITLE CTA</label>
                <input
                  type="text"
                  value={content.rekrutmenCtaSubtitle}
                  onChange={(e) => handleChange("rekrutmenCtaSubtitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 6: Halaman Tentang */}
      {activeSection === "tentang" && (
        <div className="space-y-4">
          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Header Halaman Tentang (/tentang)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">KICKER / EYEBROW</label>
                <input
                  type="text"
                  value={content.tentangKicker}
                  onChange={(e) => handleChange("tentangKicker", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL INSTITUSI</label>
                <input
                  type="text"
                  value={content.tentangTitle}
                  onChange={(e) => handleChange("tentangTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">DESKRIPSI PENGANTAR</label>
                <textarea
                  rows={2}
                  value={content.tentangSubtitle}
                  onChange={(e) => handleChange("tentangSubtitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>

          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Filosofi Pendidikan
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL FILOSOFI</label>
                <input
                  type="text"
                  value={content.tentangFilosofiTitle}
                  onChange={(e) => handleChange("tentangFilosofiTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  placeholder="Tidak hanya mempersiapkan."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">PARAGRAF 1 FILOSOFI</label>
                <textarea
                  rows={2}
                  value={content.tentangFilosofi1}
                  onChange={(e) => handleChange("tentangFilosofi1", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">PARAGRAF 2 FILOSOFI</label>
                <textarea
                  rows={2}
                  value={content.tentangFilosofi2}
                  onChange={(e) => handleChange("tentangFilosofi2", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>

          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Tiga Nilai Dasar (Principles)
            </h3>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 border-b border-white/10 pb-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">NILAI 1: JUDUL</label>
                  <input
                    type="text"
                    value={content.tentangNilai1Title}
                    onChange={(e) => handleChange("tentangNilai1Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                    placeholder="Disiplin"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">NILAI 1: DESKRIPSI</label>
                  <input
                    type="text"
                    value={content.tentangNilai1Desc}
                    onChange={(e) => handleChange("tentangNilai1Desc", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 border-b border-white/10 pb-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">NILAI 2: JUDUL</label>
                  <input
                    type="text"
                    value={content.tentangNilai2Title}
                    onChange={(e) => handleChange("tentangNilai2Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                    placeholder="Integritas"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">NILAI 2: DESKRIPSI</label>
                  <input
                    type="text"
                    value={content.tentangNilai2Desc}
                    onChange={(e) => handleChange("tentangNilai2Desc", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">NILAI 3: JUDUL</label>
                  <input
                    type="text"
                    value={content.tentangNilai3Title}
                    onChange={(e) => handleChange("tentangNilai3Title", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                    placeholder="Profesionalisme"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#918d86]">NILAI 3: DESKRIPSI</label>
                  <input
                    type="text"
                    value={content.tentangNilai3Desc}
                    onChange={(e) => handleChange("tentangNilai3Desc", e.target.value)}
                    className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 7: Halaman Arsip & Footer */}
      {activeSection === "arsip" && (
        <div className="space-y-4">
          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Halaman Arsip (/arsip)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">KICKER ARSIP</label>
                <input
                  type="text"
                  value={content.arsipKicker}
                  onChange={(e) => handleChange("arsipKicker", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL ARSIP</label>
                <input
                  type="text"
                  value={content.arsipTitle}
                  onChange={(e) => handleChange("arsipTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">SUBTITLE ARSIP</label>
                <textarea
                  rows={2}
                  value={content.arsipSubtitle}
                  onChange={(e) => handleChange("arsipSubtitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>

          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Seksi Status Rekrutmen Berjalan (Archive Note)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">JUDUL CATATAN</label>
                <input
                  type="text"
                  value={content.arsipNoteTitle}
                  onChange={(e) => handleChange("arsipNoteTitle", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                  placeholder="Penerimaan Angkatan Baru masih berlangsung."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">ISI CATATAN</label>
                <input
                  type="text"
                  value={content.arsipNoteBody}
                  onChange={(e) => handleChange("arsipNoteBody", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>

          <div className="panel-card p-5">
            <h3 className="card-heading mb-4 text-sm font-bold uppercase tracking-wider text-[#b79b69]">
              Footer Website (Global)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">MOTTO FOOTER</label>
                <input
                  type="text"
                  value={content.footerMotto}
                  onChange={(e) => handleChange("footerMotto", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#918d86]">COPYRIGHT / FOOTER NOTICE</label>
                <input
                  type="text"
                  value={content.footerNotice}
                  onChange={(e) => handleChange("footerNotice", e.target.value)}
                  className="w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-sm text-[#eeeae2] focus:border-[#b79b69]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Save Bar */}
      <div className="sticky bottom-4 flex items-center justify-between rounded-lg border border-white/20 bg-[#111111]/95 p-4 shadow-2xl backdrop-blur">
        <div className="text-xs text-[#918d86]">
          Perubahan teks akan langsung tersimpan di database dan tampil di website publik.
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="primary-button"
            disabled={saving}
          >
            {saving ? "Menyimpan..." : "Simpan Semua Perubahan →"}
          </button>
        </div>
      </div>
    </form>
  );
}
