import Link from "next/link";
import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Tentang Pusdik Reserse",
  description:
    "Pusdik Reserse merupakan ruang pendidikan tempat calon personel mempersiapkan diri, mengembangkan kemampuan, dan membangun karakter.",
};

export const dynamic = "force-dynamic";

// Tentang = tab "about" desain asli (index.html).
export default async function TentangPage() {
  const content = await getSiteContent();

  return (
    <section className="page-tab about-tab" data-page="about">
      {/* ABOUT HERO */}
      <section className="about-hero">
        <div className="about-hero-copy">
          <p className="eyebrow">{content.tentangKicker}</p>
          <h1>
            {content.tentangTitle}<br />
            <em>belajar menjadi siap.</em>
          </h1>
          <p className="about-lead">
            {content.tentangSubtitle}
          </p>
        </div>
        <div className="about-hero-mark">
          <img
            src="/design-assets/logo-pusdik.png"
            alt="Logo Pusdik Reserse"
          />
        </div>
        <div className="about-hero-meta">
          <span>ABOUT</span>
          <span>BARESKRIM POLRI RBX</span>
        </div>
      </section>

      {/* PHILOSOPHY */}
      <section className="about-philosophy">
        <div className="about-side-label">
          <span>OUR APPROACH</span>
        </div>
        <div className="about-philosophy-main">
          <p className="eyebrow">FILOSOFI PENDIDIKAN</p>
          <h2>
            {content.tentangFilosofiTitle || "Tidak hanya mempersiapkan."}
          </h2>
          <div className="about-philosophy-copy">
            <p>
              {content.tentangFilosofi1 || "Setiap proses pendidikan dirancang sebagai perjalanan. Peserta tidak hanya mengikuti tahapan, tetapi belajar memahami tanggung jawab, membangun kebiasaan, dan berkembang bersama lingkungan pendidikan."}
            </p>
            <p>
              {content.tentangFilosofi2 || "Karena kesiapan tidak terbentuk dalam satu hari. Ia dibangun melalui proses yang konsisten, terukur, dan dijalani dengan kesungguhan."}
            </p>
          </div>
        </div>
      </section>

      {/* PRINCIPLES */}
      <section className="about-principles" style={{ minHeight: "694px" }}>
        <div className="about-section-head">
          <div>
            <p className="eyebrow">NILAI DASAR</p>
          </div>
          <h2>
            Tiga hal yang<br />
            menjadi dasar.
          </h2>
        </div>
        <div className="about-principle-grid">
          {[
            {
              kicker: "CONSISTENCY",
              title: content.tentangNilai1Title || "Disiplin",
              copy: content.tentangNilai1Desc || "Membentuk kebiasaan untuk hadir, mengikuti proses, dan menyelesaikan tanggung jawab dengan konsisten.",
            },
            {
              kicker: "CHARACTER",
              title: content.tentangNilai2Title || "Integritas",
              copy: content.tentangNilai2Desc || "Menempatkan kejujuran, tanggung jawab, dan sikap yang dapat dipercaya sebagai bagian dari perjalanan pendidikan.",
            },
            {
              kicker: "GROWTH",
              title: content.tentangNilai3Title || "Profesionalisme",
              copy: content.tentangNilai3Desc || "Mendorong peserta untuk terus belajar, berkembang, dan memahami standar dalam menjalankan perannya.",
            },
          ].map((item) => (
            <article className="about-principle" key={item.title}>
              <div>
                <p className="about-principle-kicker">{item.kicker}</p>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* JOURNEY */}
      <section className="about-journey">
        <div className="about-journey-image">
          <img src="/design-assets/hero.png" alt="Kegiatan di Pusdik Reserse" />
          <span>EDUCATION / 2026</span>
        </div>
        <div className="about-journey-copy">
          <p className="eyebrow">SEBUAH PERJALANAN</p>
          <h2>
            Dari peserta,<br />
            menjadi bagian.
          </h2>
          <p>
            Pendaftaran adalah awal. Verifikasi, seleksi, dan pendidikan menjadi bagian
            dari perjalanan yang menghubungkan setiap peserta dengan lingkungan Pusdik
            Reserse.
          </p>
          <Link href="/rekrutmen" className="btn btn-text">
            Lihat Rekrutmen <span>→</span>
          </Link>
        </div>
      </section>

      {/* CLOSING */}
      <section className="about-closing">
        <p className="eyebrow">PUSDIK RESERSE</p>
        <h2>
          Belajar.<br />
          Bertumbuh.<br />
          <em>Siap melangkah.</em>
        </h2>
        <span className="about-closing-line"></span>
      </section>
    </section>
  );
}
