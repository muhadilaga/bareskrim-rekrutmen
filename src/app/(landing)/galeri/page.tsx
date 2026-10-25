import type { Metadata } from "next";
import { GalleryViewer } from "@/components/galeri/GalleryViewer";

export const metadata: Metadata = {
  title: "Galeri Dokumentasi Pusdik Reserse",
  description:
    "Dokumentasi resmi kegiatan, simulasi pendidikan, latihan taktis, dan tradisi korps Bareskrim Polri RBX.",
};

export const dynamic = "force-dynamic";

export default function GaleriPage() {
  return (
    <section className="page-tab gallery-tab" data-page="gallery">
      {/* GALLERY HERO */}
      <section
        className="archive-hero"
        style={{
          minHeight: "420px",
          padding: "130px 9vw 60px",
        }}
      >
        <div className="archive-hero-copy">
          <p className="eyebrow">DOKUMENTASI RESMI</p>
          <h1>
            Galeri Kegiatan<br />
            <em>Pusdik Reserse.</em>
          </h1>
          <p>
            Merekam dedikasi, penempaan integritas, latihan taktis investigasi, serta momen
            kehormatan calon personel Korps Bhayangkara.
          </p>
        </div>
        <div className="archive-hero-index">
          <small>
            GALERI<br />
            2025 — 2026
          </small>
        </div>
      </section>

      {/* GALLERY CONTENT */}
      <section
        className="archive-records"
        style={{
          minHeight: "750px",
          padding: "40px 9vw 80px",
        }}
      >
        <GalleryViewer />
      </section>
    </section>
  );
}
