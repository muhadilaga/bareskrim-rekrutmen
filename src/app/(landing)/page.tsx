import Link from "next/link";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site-content";
import { prisma } from "@/lib/prisma";
import { ArchiveCarousel, type ArchiveItem } from "@/components/landing/ArchiveCarousel";

export const metadata: Metadata = {
  title: "Pusdik Reserse — Penerimaan Calon Siswa 2026",
  description:
    "Pusdik Reserse Bareskrim Polri RBX merupakan ruang pendidikan bagi calon personel yang siap mengembangkan kemampuan, disiplin, dan profesionalisme.",
};

export const dynamic = "force-dynamic";

// Beranda = tab "home" desain asli (index.html).
export default async function HomePage() {
  const content = await getSiteContent();

  const defaultArchiveItems: ArchiveItem[] = [
    { angkatan: "ANGKATAN 39", tahun: "2025", gel: "Gelombang 01", status: "SELESAI", sortKey: 3901 },
    { angkatan: "ANGKATAN 39", tahun: "2025", gel: "Gelombang 02", status: "SELESAI", sortKey: 3902 },
    { angkatan: "ANGKATAN 40", tahun: "2026", gel: "Gelombang 01", status: "SELESAI", sortKey: 4001 },
    { angkatan: "ANGKATAN 40", tahun: "2026", gel: "Gelombang 02", status: "SELESAI", sortKey: 4002 },
  ];

  const archiveMap = new Map<string, ArchiveItem>();
  for (const item of defaultArchiveItems) {
    archiveMap.set(`${item.angkatan}-${item.gel}`.toLowerCase(), item);
  }

  try {
    const exams = await prisma.examPeriod.findMany({
      where: { deletedAt: null },
      select: { name: true, openedAt: true, closedAt: true, isActive: true },
      orderBy: { openedAt: "asc" },
    });

    const recs = await prisma.recruitmentPeriod.findMany({
      where: { deletedAt: null },
      select: { name: true, code: true, openedAt: true, closedAt: true, isActive: true },
      orderBy: { createdAt: "asc" },
    });

    const parsePeriod = (
      raw: string,
      openedAt?: Date | null,
      closedAt?: Date | null,
      isActive?: boolean
    ): ArchiveItem => {
      let angkatanNum = 0;
      let angkatanStr = "ANGKATAN";
      const angkatanMatch = raw.match(/angkatan\s*([0-9A-Za-z]+)/i);
      if (angkatanMatch?.[1]) {
        const val = angkatanMatch[1].toUpperCase();
        if (/^\d+$/.test(val)) {
          angkatanNum = parseInt(val, 10);
          angkatanStr = `ANGKATAN ${val}`;
        } else {
          angkatanStr = `ANGKATAN ${val}`;
          if (val === "XXXIX") angkatanNum = 39;
          else if (val === "XL") angkatanNum = 40;
          else if (val === "XLI") angkatanNum = 41;
          else if (val === "XLII") angkatanNum = 42;
          else if (val === "XLIII") angkatanNum = 43;
          else if (val === "XLIV") angkatanNum = 44;
          else if (val === "XLV") angkatanNum = 45;
        }
      } else {
        const num = raw.match(/\d+/);
        if (num) {
          angkatanNum = parseInt(num[0], 10);
          angkatanStr = `ANGKATAN ${num[0]}`;
        }
      }

      let gelNum = 1;
      let gelStr = "Gelombang 01";
      const gelMatch = raw.match(/gel(?:ombang)?\.?\s*0?(\d+)/i);
      if (gelMatch?.[1]) {
        gelNum = parseInt(gelMatch[1], 10);
        gelStr = `Gelombang 0${gelNum}`;
      }

      let year = "2026";
      if (openedAt) {
        year = new Date(openedAt).getFullYear().toString();
      } else if (closedAt) {
        year = new Date(closedAt).getFullYear().toString();
      } else {
        const yrMatch = raw.match(/(202\d)/);
        if (yrMatch) year = yrMatch[1];
      }

      const sortKey = (angkatanNum || 40) * 100 + gelNum;
      const status = isActive ? "BERLANGSUNG" : "SELESAI";

      return {
        angkatan: angkatanStr,
        tahun: year,
        gel: gelStr,
        status,
        sortKey,
      };
    };

    for (const e of exams) {
      if (!e.name) continue;
      const parsed = parsePeriod(e.name, e.openedAt, e.closedAt, e.isActive);
      archiveMap.set(`${parsed.angkatan}-${parsed.gel}`.toLowerCase(), parsed);
    }

    for (const r of recs) {
      const raw = r.name || r.code;
      if (!raw) continue;
      const parsed = parsePeriod(raw, r.openedAt, r.closedAt, r.isActive);
      archiveMap.set(`${parsed.angkatan}-${parsed.gel}`.toLowerCase(), parsed);
    }
  } catch (err) {
    console.warn("[page] archive periods query skipped:", err && (err as Error).message);
  }

  // Sort ascending: angkatan paling lama di kiri, yang baru di kanan
  const archiveItems = Array.from(archiveMap.values()).sort(
    (a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0)
  );

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
            <Link href="/rekrutmen#persyaratan">
              Persyaratan <b>›</b>
            </Link>
            <Link href="/rekrutmen#tahapan">
              Tahapan Seleksi <b>›</b>
            </Link>
            <Link href="/rekrutmen#jadwal">
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
          <Link href="/tentang" className="btn btn-text">
            {content.introCta} <span>→</span>
          </Link>
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
        <ArchiveCarousel items={archiveItems} />
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
