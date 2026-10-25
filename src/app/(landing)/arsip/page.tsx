import Link from "next/link";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Arsip Penerimaan",
  description:
    "Catatan perjalanan penerimaan calon siswa Pusdik Reserse dari setiap angkatan dan gelombang yang telah diselesaikan.",
};

export const dynamic = "force-dynamic";

// Arsip = tab "archive" desain asli (index.html).
export default async function ArsipPage() {
  const content = await getSiteContent();

  return (
    <section className="page-tab archive-tab" data-page="archive">
      {/* ARCHIVE HERO */}
      <section className="archive-hero">
        <div className="archive-hero-copy">
          <p className="eyebrow">{content.arsipKicker}</p>
          <h1>
            {content.arsipTitle}<br />
            <em>telah melangkah.</em>
          </h1>
          <p>
            {content.arsipSubtitle}
          </p>
        </div>
        <div className="archive-hero-index">
          <small>
            ARCHIVE<br />
            2025 — 2026
          </small>
        </div>
      </section>

      {/* ARCHIVE LIST */}
      <section className="archive-records" style={{ minHeight: "909px" }}>
        <div className="archive-records-head">
          <div>
            <p className="eyebrow">DAFTAR PENERIMAAN</p>
          </div>
          <p>Rekam penerimaan disusun berdasarkan angkatan dan gelombang.</p>
        </div>
        <div className="archive-record-list">
          {[
            {
              year: "2026",
              angkatan: "ANGKATAN XL",
              gel: "Gelombang 02",
              copy: "Penerimaan calon siswa yang telah menyelesaikan seluruh rangkaian seleksi.",
            },
            {
              year: "2026",
              angkatan: "ANGKATAN XL",
              gel: "Gelombang 01",
              copy: "Rekam penerimaan dan proses seleksi periode awal tahun 2026.",
            },
            {
              year: "2025",
              angkatan: "ANGKATAN XXXIX",
              gel: "Gelombang 02",
              copy: "Dokumentasi penerimaan dan perjalanan peserta pada periode sebelumnya.",
            },
            {
              year: "2025",
              angkatan: "ANGKATAN XXXIX",
              gel: "Gelombang 01",
              copy: "Catatan penerimaan calon siswa pada awal periode pendidikan tahun 2025.",
            },
          ].map((item) => (
            <article className="archive-record" key={`${item.angkatan}-${item.gel}`}>
              <div className="archive-record-year">{item.year}</div>
              <div className="archive-record-main">
                <span>{item.angkatan}</span>
                <h2>{item.gel}</h2>
                <p>{item.copy}</p>
              </div>
              <div className="archive-record-status">
                <span>SELESAI</span>
                <b>→</b>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ARCHIVE NOTE */}
      <section className="archive-note">
        <div className="archive-note-number">{content.rekrutmenAngkatan || "43"}</div>
        <div>
          <p className="eyebrow">CURRENT RECRUITMENT</p>
          <h2>
            {content.arsipNoteTitle || "Penerimaan Angkatan Baru masih berlangsung."}
          </h2>
          <p>
            {content.arsipNoteBody || "Pendaftaran sedang berlangsung. Setelah rangkaian seleksi ini selesai, data akan diarsipkan di sini."}
          </p>
          <Link href="/rekrutmen" className="btn btn-text">
            Lihat Rekrutmen Aktif <span>→</span>
          </Link>
        </div>
      </section>

      {/* ARCHIVE CLOSING */}
      <section className="archive-closing">
        <span>BARESKRIM POLRI RBX / PUSDIK RESERSE</span>
        <h2>
          Setiap angkatan<br />
          meninggalkan <em>jejak.</em>
        </h2>
      </section>
    </section>
  );
}
