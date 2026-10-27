import Link from "next/link";
import type { Metadata } from "next";
import { RecruitmentCountdown } from "@/components/landing/RecruitmentCountdown";
import { getSiteContent } from "@/lib/site-content";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Rekrutmen Calon Siswa — Pusdik Reserse Bareskrim Polri RBX",
  description:
    "Informasi resmi penerimaan calon siswa Pusdik Reserse Bareskrim Polri RBX. Persyaratan, tahapan, dan jadwal seleksi.",
};

export const dynamic = "force-dynamic";

// Rekrutmen = tab "recruitment" desain asli (index.html).
export default async function RekrutmenPage() {
  const content = await getSiteContent();
  let activePeriod: Awaited<ReturnType<typeof prisma.examPeriod.findFirst>> = null;
  let activeRecruitment: Awaited<ReturnType<typeof prisma.recruitmentPeriod.findFirst>> = null;

  try {
    activePeriod = await prisma.examPeriod.findFirst({
      where: { isActive: true, deletedAt: null },
      orderBy: { openedAt: "desc" },
    });
  } catch (err) {
    console.warn("[rekrutmen] examPeriod query skipped:", err && (err as Error).message);
  }

  try {
    activeRecruitment = await prisma.recruitmentPeriod.findFirst({
      where: { isActive: true, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    console.warn("[rekrutmen] recruitmentPeriod query skipped:", err && (err as Error).message);
  }

  const closingDate =
    activePeriod?.closedAt ||
    activeRecruitment?.closedAt ||
    null;

  const deadlineIso = closingDate ? closingDate.toISOString() : null;
  const isPeriodClosed = closingDate ? closingDate.getTime() <= Date.now() : false;

  const extractAngkatan = (name?: string | null) => {
    if (!name) return null;
    const match = name.match(/angkatan\s*([0-9A-Za-z]+)/i);
    if (match?.[1]) return match[1];
    const firstNum = name.match(/\d+/);
    return firstNum?.[0] || null;
  };

  const angkatanNumber = (
    content.rekrutmenAngkatan?.trim() ||
    extractAngkatan(activeRecruitment?.name) ||
    extractAngkatan(activePeriod?.name) ||
    "42"
  );

  return (
    <section className="page-tab recruitment-tab" data-page="recruitment">
      {/* HERO */}
      <section className="recruitment-hero">
        <div className="hero-bg" style={{ minHeight: "694px" }}></div>
        <div className="hero-overlay" style={{ minHeight: "694px" }}></div>
        <div className="hero-content">
          <div className="hero-status">
            <span style={isPeriodClosed ? { background: "#dc2626" } : undefined}></span>
            {isPeriodClosed
              ? "PENDAFTARAN DITUTUP"
              : activePeriod?.isActive || activeRecruitment?.isActive
                ? "PENDAFTARAN DIBUKA"
                : content.recruitmentStatus.toUpperCase()}
          </div>
          <p className="hero-label">{content.rekrutmenKicker}</p>
          <div className="hero-title">
            <span>ANGKATAN</span>
            <h1>{angkatanNumber}</h1>
          </div>
          <div className="hero-meta">
            <span>{content.recruitmentWave.toUpperCase()}</span>
            <i></i>
            <span>PUSDIK RESERSE</span>
          </div>
        </div>
        <div className="hero-countdown">
          <p>PENDAFTARAN DITUTUP DALAM</p>
          <RecruitmentCountdown targetDate={deadlineIso} />
        </div>
      </section>

      {/* INFORMATION */}
      <section className="information" id="persyaratan" style={{ minHeight: "694px" }}>
        <div className="section-heading">
          <p>INFORMASI PENERIMAAN</p>
        </div>
        <div className="information-grid">
          {/* REQUIREMENTS */}
          <article className="info-block requirements">
            <div className="block-heading">
              <div>
                <h2>Persyaratan</h2>
              </div>
            </div>
            <div className="requirement-list">
              {[
                {
                  title: content.rekrutmenSyarat1Title || "Identitas Peserta",
                  copy: content.rekrutmenSyarat1,
                },
                {
                  title: content.rekrutmenSyarat2Title || "Kepangkatan",
                  copy: content.rekrutmenSyarat2,
                },
                {
                  title: content.rekrutmenSyarat3Title || "Integritas & Afiliasi",
                  copy: content.rekrutmenSyarat3,
                },
                {
                  title: content.rekrutmenSyarat4Title || "Kesiapan & Komitmen Seleksi",
                  copy: content.rekrutmenSyarat4,
                },
              ].map((item) => (
                <div className="requirement" key={item.title}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      {/* SCHEDULE */}
      <section className="schedule" id="jadwal" style={{ minHeight: "694px" }}>
        <div className="section-heading">
          <p>JADWAL</p>
        </div>
        <div className="schedule-header" id="tahapan">
          <div>
            <p className="eyebrow">{content.rekrutmenJadwalEyebrow || "IMPORTANT DATES"}</p>
            <h2>
              {content.rekrutmenJadwalTitle || "Catat tahapannya."}
            </h2>
          </div>
          <p>
            {content.rekrutmenJadwalSubtitle || "Seluruh tahapan mengikuti jadwal yang telah ditetapkan oleh Pusdik Reserse."}
          </p>
        </div>
        <div className="schedule-list">
          {[
            {
              tag: content.rekrutmenTahap1Tag || "TAHAP 01",
              title: content.rekrutmenTahap1Title || "Pembukaan Pendaftaran",
              state: content.rekrutmenTahap1State || "DIBUKA",
              date: content.rekrutmenTahap1Date || "",
              active: true,
            },
            {
              tag: content.rekrutmenTahap2Tag || "TAHAP 02",
              title: content.rekrutmenTahap2Title || "Verifikasi Administrasi",
              state: content.rekrutmenTahap2State || "TERJADWAL",
              date: content.rekrutmenTahap2Date || "",
              active: false,
            },
            {
              tag: content.rekrutmenTahap3Tag || "TAHAP 03",
              title: content.rekrutmenTahap3Title || "Pelaksanaan Seleksi",
              state: content.rekrutmenTahap3State || "TERJADWAL",
              date: content.rekrutmenTahap3Date || "",
              active: false,
            },
            {
              tag: content.rekrutmenTahap4Tag || "TAHAP 04",
              title: content.rekrutmenTahap4Title || "Pengumuman Hasil Seleksi",
              state: content.rekrutmenTahap4State || "TERJADWAL",
              date: content.rekrutmenTahap4Date || "",
              active: false,
            },
          ].map((row) => (
            <div className={`schedule-row${row.active ? " active" : ""}`} key={row.title}>
              {row.date ? (
                <div className="schedule-date">
                  <span>{row.date}</span>
                </div>
              ) : null}
              <div className="schedule-detail">
                <span>{row.tag}</span>
                <strong>{row.title}</strong>
              </div>
              <div className="schedule-state">{row.state}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="registration-cta">
        <div className="cta-number">{angkatanNumber || content.rekrutmenAngkatan || "43"}</div>
        <div className="cta-content">
          <p className="eyebrow">{`${content.recruitmentTitle ? content.recruitmentTitle.toUpperCase() : "PENERIMAAN"} · ${content.recruitmentWave.toUpperCase()}`}</p>
          <h2>
            {content.rekrutmenCtaTitle || "Siap mengambil langkah pertama?"}
          </h2>
          <p>
            {content.rekrutmenCtaSubtitle || "Pastikan kamu telah membaca informasi, persyaratan, dan tahapan penerimaan sebelum melanjutkan."}
          </p>
          <Link href="/absen" className="register-button">
            MULAI PENDAFTARAN <span>→</span>
          </Link>
        </div>
      </section>
    </section>
  );
}
