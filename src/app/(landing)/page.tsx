import Link from "next/link";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Pusdik Reserse — Penerimaan Calon Siswa 2026",
  description:
    "Pusdik Reserse Bareskrim Polri RBX merupakan ruang pendidikan bagi calon personel yang siap mengembangkan kemampuan, disiplin, dan profesionalisme.",
};

export const dynamic = "force-dynamic";

// Beranda = tab "home" desain asli (index.html).
export default async function HomePage() {
  const content = await getSiteContent();

  return (
    <section className="page-tab" data-page="home" style={{ minHeight: "909px" }}>
      {/* HERO */}
      <section className="hero" id="rekrutmen">
        <div className="hero-content">
          <p className="eyebrow hero-eyebrow">{content.heroKicker}</p>
          <h1>{content.heroTitle}</h1>
          <p className="hero-description">{content.heroDescription}</p>
          <div className="hero-actions">
            <Link href="/absen" className="btn btn-primary">
              {content.heroCtaPrimary} <span>→</span>
            </Link>
            <a href="#tentang" className="btn btn-text">
              {content.heroCtaSecondary} <span>→</span>
            </a>
          </div>
        </div>

        <aside className="recruitment-card">
          <div className="card-topline">
            <span>{content.recruitmentCardTopline}</span>
            <span>{content.recruitmentYear}</span>
          </div>
          <h2>{content.recruitmentTitle}</h2>
          <h3>{content.recruitmentWave}</h3>
          <div className="status">
            <span></span>
            {content.recruitmentStatus}
          </div>
          <div className="date">
            {content.recruitmentDates}
          </div>
          <Link href="/absen" className="btn btn-primary" style={{ textAlign: "center", display: "block" }}>
            Daftar Sekarang
          </Link>
          <div className="quick-links">
            <Link href="/rekrutmen">
              Persyaratan <b>›</b>
            </Link>
            <Link href="/rekrutmen">
              Tahapan Seleksi <b>›</b>
            </Link>
            <Link href="/rekrutmen">
              Jadwal Lengkap <b>›</b>
            </Link>
          </div>
        </aside>

        <div className="hero-footer">
          <span>PUSDIK RESERSE</span>
          <span>SCROLL TO EXPLORE ↓</span>
        </div>
      </section>

      {/* INTRO */}
      <section className="intro" id="tentang">
        <div className="section-index">
          <div className="vertical-line"></div>
          <span className="vertical-label">TENTANG</span>
        </div>
        <div className="intro-content">
          <p className="eyebrow">{content.introKicker}</p>
          <h2>{content.introTitle}</h2>
          <p className="body-copy">{content.introBody}</p>
          <a href="#pendidikan" className="btn btn-text">
            {content.introCta} <span>→</span>
          </a>
        </div>
        <figure className="editorial-image intro-image">
          <div className="image-corner"></div>
          <img src="/design-assets/intro.png" alt="Kegiatan di Pusdik Reserse" />
          <figcaption>
            <span>PUSDIK RESERSE</span>
            <span>{content.recruitmentYear}</span>
          </figcaption>
        </figure>
      </section>

      {/* EDUCATION */}
      <section className="education" id="pendidikan" style={{ minHeight: "909px" }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">PENDIDIKAN</p>
            <h2>
              Tempat mereka<br />
              ditempa.
            </h2>
          </div>
        </div>
        <div className="education-intro-line">
          <span>THREE PRINCIPLES</span>
          <p>Nilai yang menjadi dasar dalam perjalanan pendidikan.</p>
        </div>
        <div className="education-grid">
          {[
            {
              label: "DISCIPLINE",
              title: content.pilar1Title,
              image: "/design-assets/education-discipline.png",
              copy: content.pilar1Desc,
            },
            {
              label: "INTEGRITY",
              title: content.pilar2Title,
              image: "/design-assets/education-integrity.png",
              copy: content.pilar2Desc,
            },
            {
              label: "PROFESSIONALISM",
              title: content.pilar3Title,
              image: "/design-assets/education-professional.png",
              copy: content.pilar3Desc,
            },
          ].map((card) => (
            <article className="education-card" key={card.label}>
              <div className="education-image">
                <img src={card.image} alt={card.title} />
                <div className="image-overlay"></div>
                <div className="image-meta">
                  <span>NILAI DASAR</span>
                </div>
                <div className="image-label">{card.label}</div>
              </div>
              <div className="education-info">
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.copy}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* PROCESS */}
      <section className="process" style={{ minHeight: "909px" }}>
        <div>
          <p className="eyebrow">PROSES SELEKSI</p>
          <h2>
            Satu langkah<br />
            lebih jauh.
          </h2>
          <p className="body-copy">
            Setiap peserta melalui tahapan yang dirancang untuk mengenal, menilai, dan
            mempersiapkan calon peserta pendidikan.
          </p>
        </div>
        <div className="process-list">
          {[
            { title: "Pendaftaran", copy: "Lengkapi data dan persyaratan pendaftaran.", status: "OPEN" },
            { title: "Verifikasi", copy: "Data peserta diperiksa sebelum tahap berikutnya.", status: "NEXT" },
            { title: "Seleksi", copy: "Peserta mengikuti rangkaian seleksi yang ditentukan.", status: "NEXT" },
            { title: "Pendidikan", copy: "Peserta yang lolos memasuki proses pendidikan.", status: "FINAL" },
          ].map((item) => (
            <div className="process-item" key={item.title}>
              <div className="process-main">
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </div>
              <span className="process-status">{item.status}</span>
              <b>→</b>
            </div>
          ))}
        </div>
      </section>

      {/* ENVIRONMENT */}
      <section className="environment">
        <figure className="environment-image">
          <img src="/design-assets/environment.png" alt="Lingkungan Pusdik Reserse" />
          <figcaption>LINGKUNGAN PENDIDIKAN / 2026</figcaption>
        </figure>
        <div className="environment-content">
          <p className="eyebrow">LINGKUNGAN PENDIDIKAN</p>
          <h2>
            Belajar bukan<br />
            hanya di dalam kelas.
          </h2>
          <p className="body-copy">
            Setiap ruang memiliki cerita. Setiap kegiatan menjadi bagian dari perjalanan
            mereka selama berada di Pusdik Reserse.
          </p>
          <Link href="/galeri" className="btn btn-text">
            Jelajahi Pusdik <span>→</span>
          </Link>
          <div className="environment-meta">
            <span>PUSDIK RESERSE</span>
            <span>RBX / 2026</span>
          </div>
        </div>
      </section>

      {/* ARCHIVE */}
      <section className="archive" id="arsip" style={{ minHeight: "694px" }}>
        <div className="archive-header">
          <div>
            <p className="eyebrow">ARSIP PENERIMAAN</p>
            <h2>
              Mereka yang<br />
              telah melangkah.
            </h2>
          </div>
          <Link href="/arsip" className="btn btn-text">
            Lihat Semua Arsip <span>→</span>
          </Link>
        </div>
        <div className="archive-grid">
          {[
            { angkatan: "ANGKATAN 40", tahun: "2026", gel: "Gelombang 02" },
            { angkatan: "ANGKATAN 40", tahun: "2026", gel: "Gelombang 01" },
            { angkatan: "ANGKATAN 39", tahun: "2025", gel: "Gelombang 02" },
          ].map((item) => (
            <Link href="/arsip" className="archive-card" key={`${item.angkatan}-${item.gel}`}>
              <div className="archive-card-top">
                <span>{item.angkatan}</span>
                <span>{item.tahun}</span>
              </div>
              <strong>{item.gel}</strong>
              <div className="archive-card-bottom">
                <small>SELESAI</small>
                <span>→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final-cta">
        <div className="final-cta-content">
          <p className="eyebrow">{content.closingKicker}</p>
          <h2>{content.closingTitle}</h2>
          <p className="body-copy">
            {content.closingBody}
          </p>
          <Link href="/absen" className="btn btn-primary">
            Mulai Pendaftaran <span>→</span>
          </Link>
        </div>
        <div className="final-cta-mark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </section>
    </section>
  );
}
