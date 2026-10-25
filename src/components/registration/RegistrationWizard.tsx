"use client";

import { useState } from "react";
import Link from "next/link";

interface FormState {
  fullName: string;
  robloxUsername: string;
  discordId: string;
  birthDate: string;
  gender: string;
  origin: string;
  experience: string;
  motivation: string;
  agreement: boolean;
}

const INITIAL_STATE: FormState = {
  fullName: "",
  robloxUsername: "",
  discordId: "",
  birthDate: "",
  gender: "",
  origin: "",
  experience: "",
  motivation: "",
  agreement: false,
};

export function RegistrationWizard() {
  const [step, setStep] = useState<number>(1);
  const [formData, setFormData] = useState<FormState>(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverResult, setServerResult] = useState<{
    registrationId: string;
    accessToken: string;
  } | null>(null);

  // General field change handler
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setErrorMessage(null);
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Step 1 Validation (Hanya Roblox & Discord)
  const validateStep1 = (): boolean => {
    return (
      formData.robloxUsername.trim().length >= 3 &&
      formData.discordId.trim().length >= 2
    );
  };

  // Step 2 Validation (Hanya Motivasi)
  const validateStep2 = (): boolean => {
    return formData.motivation.trim().length >= 10;
  };

  const handleNext = (nextStep: number) => {
    if (step === 1 && !validateStep1()) {
      alert("Harap masukkan Username Roblox dan Discord kamu.");
      return;
    }
    if (step === 2 && !validateStep2()) {
      alert("Harap isi motivasi pendaftaran (minimal 10 karakter).");
      return;
    }
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = (prevStep: number) => {
    setStep(prevStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formData.agreement) {
      alert("Anda harus menyetujui pernyataan kebenaran data.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Opsi A: Nilai default transparan untuk atribut database non-roleplay
      const payload = {
        ...formData,
        fullName: formData.robloxUsername.trim(),
        birthDate: "2000-01-01",
        gender: "L",
        origin: "Indonesia",
        experience: formData.experience.trim() || "Calon Siswa Pusdik Reserse",
      };

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json().catch(() => null);

      if (res.status === 201 && resData?.success) {
        setServerResult({
          registrationId: resData.data.registrationId,
          accessToken: resData.data.accessToken,
        });
        setIsSubmitted(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const msg = resData?.error || "Gagal memproses pendaftaran. Silakan coba lagi.";
        setErrorMessage(msg);
      }
    } catch (err: any) {
      setErrorMessage("Terjadi gangguan koneksi ke server pendaftaran. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="design-root">
      {/* Header pendaftaran */}
      <header className="site-header">
        <Link href="/rekrutmen" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/design-assets/logo-pusdik.png" alt="Logo Pusdik Reserse" />
          <div className="brand-copy">
            <strong>BARESKRIM POLRI RBX</strong>
            <span>PUSDIK RESERSE</span>
          </div>
        </Link>
        <Link href="/rekrutmen" className="back-link">
          ← KEMBALI
        </Link>
      </header>

      <main>
        {!isSubmitted ? (
          <>
            {/* Intro Section */}
            <section className="registration-intro">
              <div className="intro-content">
                <div className="status">
                  <span></span>
                  PENDAFTARAN DIBUKA
                </div>
                <p className="eyebrow">PENERIMAAN CALON SISWA</p>
                <h1>
                  Daftarkan <em>dirimu.</em>
                </h1>
                <div className="intro-meta">
                  <span>PUSDIK RESERSE</span>
                  <i></i>
                  <span>BARESKRIM POLRI RBX</span>
                </div>
                <p className="intro-description">
                  Lengkapi data berikut dengan benar. Data yang dikirim akan menjadi bagian dari proses administrasi penerimaan.
                </p>
              </div>

              <div className="intro-index">
                <span>CASIS</span>
                <small>REGISTRATION</small>
              </div>
            </section>

            {/* Form Section */}
            <section className="form-section">
              <div className="form-layout">
                {/* Sidebar */}
                <aside className="form-sidebar">
                  <div className="sidebar-title">
                    <span>PENDAFTARAN</span>
                    <strong>CASIS</strong>
                  </div>

                  <div className="progress">
                    <div className={`progress-step ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>
                      <span>{step > 1 ? "✓" : "•"}</span>
                      <div>
                        <strong>Akun</strong>
                        <small>Roblox & Discord</small>
                      </div>
                    </div>

                    <div className={`progress-line ${step > 1 ? "completed" : ""}`}></div>

                    <div className={`progress-step ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}>
                      <span>{step > 2 ? "✓" : "•"}</span>
                      <div>
                        <strong>Motivasi</strong>
                        <small>Tujuan pendaftaran</small>
                      </div>
                    </div>

                    <div className={`progress-line ${step > 2 ? "completed" : ""}`}></div>

                    <div className={`progress-step ${step === 3 ? "active" : ""}`}>
                      <span>•</span>
                      <div>
                        <strong>Pernyataan</strong>
                        <small>Konfirmasi data</small>
                      </div>
                    </div>
                  </div>

                  <div className="sidebar-note">
                    <span>CATATAN</span>
                    <p>Pastikan seluruh informasi yang diberikan sesuai dengan data sebenarnya.</p>
                  </div>
                </aside>

                {/* Form Container */}
                <div className="form-container">
                  <form id="registrationForm" onSubmit={handleSubmit}>
                    {/* STEP 01 */}
                    <div className={`form-step ${step === 1 ? "active" : ""}`} data-step="1">
                      <div className="step-heading">
                        <div>
                          <p>IDENTITAS PESERTA</p>
                        </div>
                      </div>

                      <h2>
                        Akun <em>kamu.</em>
                      </h2>
                      <p className="step-description">
                        Masukkan akun Roblox dan Discord yang akan kamu gunakan selama bermain dan berkomunikasi.
                      </p>

                      <div className="fields">
                        <div className="field full">
                          <label htmlFor="robloxUsername">USERNAME ROBLOX</label>
                          <input
                            type="text"
                            id="robloxUsername"
                            name="robloxUsername"
                            placeholder="Contoh: 4DIBERL4G4"
                            autoComplete="off"
                            required
                            value={formData.robloxUsername}
                            onChange={handleChange}
                          />
                        </div>

                        <div className="field full">
                          <label htmlFor="discordId">DISCORD USERNAME</label>
                          <input
                            type="text"
                            id="discordId"
                            name="discordId"
                            placeholder="@username (contoh: alanwalker#1234)"
                            autoComplete="off"
                            required
                            value={formData.discordId}
                            onChange={handleChange}
                          />
                        </div>
                      </div>

                      <div className="form-actions">
                        <span>Pastikan username Roblox sesuai akunmu.</span>
                        <button
                          type="button"
                          className="next-button"
                          onClick={() => handleNext(2)}
                        >
                          LANJUT <span>→</span>
                        </button>
                      </div>
                    </div>

                    {/* STEP 02 */}
                    <div className={`form-step ${step === 2 ? "active" : ""}`} data-step="2">
                      <div className="step-heading">
                        <div>
                          <p>PROFIL PESERTA</p>
                        </div>
                      </div>

                      <h2>
                        Motivasi <em>kamu.</em>
                      </h2>
                      <p className="step-description">
                        Ceritakan motivasimu bergabung dan mengikuti pendidikan di Pusdik Reserse.
                      </p>

                      <div className="fields">
                        <div className="field full">
                          <label htmlFor="motivation">MOTIVASI PENDAFTARAN</label>
                          <textarea
                            id="motivation"
                            name="motivation"
                            rows={6}
                            placeholder="Mengapa kamu ingin mengikuti roleplay kepolisian dan pendidikan di Pusdik Reserse? (minimal 10 karakter)"
                            required
                            value={formData.motivation}
                            onChange={handleChange}
                          ></textarea>
                        </div>
                      </div>

                      <div className="form-actions">
                        <button
                          type="button"
                          className="back-button"
                          onClick={() => handleBack(1)}
                        >
                          ← KEMBALI
                        </button>
                        <button
                          type="button"
                          className="next-button"
                          onClick={() => handleNext(3)}
                        >
                          LANJUT <span>→</span>
                        </button>
                      </div>
                    </div>

                    {/* STEP 03 */}
                    <div className={`form-step ${step === 3 ? "active" : ""}`} data-step="3">
                      <div className="step-heading">
                        <div>
                          <p>PERNYATAAN</p>
                        </div>
                      </div>

                      <h2>
                        Pastikan <em>semuanya benar.</em>
                      </h2>
                      <p className="step-description">
                        Periksa kembali data yang telah kamu masukkan sebelum mengirimkan pendaftaran.
                      </p>

                      <div className="review-box">
                        <div className="review-row">
                          <span>ROBLOX</span>
                          <strong id="reviewRoblox">{formData.robloxUsername || "—"}</strong>
                        </div>

                        <div className="review-row">
                          <span>DISCORD</span>
                          <strong id="reviewDiscord">{formData.discordId || "—"}</strong>
                        </div>

                        <div className="review-row">
                          <span>MOTIVASI</span>
                          <strong id="reviewMotivation" style={{ whiteSpace: "pre-wrap" }}>
                            {formData.motivation || "—"}
                          </strong>
                        </div>
                      </div>

                      <label className="agreement">
                        <input
                          type="checkbox"
                          id="agreement"
                          name="agreement"
                          required
                          checked={formData.agreement}
                          onChange={handleChange}
                        />
                        <span className="custom-check"></span>
                        <p>
                          Saya menyatakan bahwa seluruh data yang saya berikan adalah benar dan saya bersedia mengikuti seluruh proses penerimaan calon siswa Bareskrim Polri RBX.
                        </p>
                      </label>

                      {/* Banner status error / database belum tersedia */}
                      {errorMessage && (
                        <div
                          className="error-banner"
                          style={{
                            marginTop: "16px",
                            padding: "12px 16px",
                            background: "rgba(181, 34, 39, 0.15)",
                            border: "1px solid rgba(181, 34, 39, 0.5)",
                            borderRadius: "6px",
                            color: "#cf2d33",
                            fontSize: "0.85rem",
                            textAlign: "center",
                          }}
                        >
                          <strong>[PENDAFTARAN SERVER]</strong> {errorMessage}
                        </div>
                      )}

                      <div className="form-actions">
                        <button
                          type="button"
                          className="back-button"
                          disabled={isSubmitting}
                          onClick={() => handleBack(2)}
                        >
                          ← KEMBALI
                        </button>
                        <button
                          type="submit"
                          className="submit-button"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? "MEMPROSES..." : "KIRIM PENDAFTARAN"} <span>→</span>
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          </>
        ) : (
          /* SUCCESS SECTION (Terima data resmi dari server) */
          <section className="success-section visible" id="successSection">
            <div className="success-mark">✓</div>

            <p className="eyebrow">PENDAFTARAN BERHASIL</p>

            <h2>
              Selamat datang, <em id="successName">{formData.robloxUsername || "Peserta"}</em>
            </h2>

            <p className="success-description">
              Data pendaftaranmu telah berhasil dikirim dan tercatat secara permanen dalam sistem server.
            </p>

            <div className="registration-number">
              <span>REGISTRATION ID</span>
              <strong id="registrationId">{serverResult?.registrationId || "REG-0000"}</strong>
            </div>

            <div className="registration-number access-token-number">
              <span>ACCESS TOKEN</span>
              <strong id="accessToken">{serverResult?.accessToken || "TOKEN-XXXX-XXXX"}</strong>
            </div>

            <p className="credential-note">
              Simpan Registration ID dan Access Token Anda. Token hanya diberikan saat pendaftaran berhasil. Masuk melalui Roblox, lalu gunakan keduanya untuk menghubungkan pendaftaran di dashboard Casis.
            </p>

            <div className="success-status">
              <span></span>
              MENUNGGU VERIFIKASI
            </div>

            <div className="success-actions">
              <Link href="/rekrutmen" className="secondary-button">
                ← KEMBALI KE REKRUTMEN
              </Link>
              <Link href="/dashboard" className="primary-button" id="studentPanelButton">
                MASUK STUDENT PANEL <span>→</span>
              </Link>
              <button type="button" className="secondary-button" id="printButton" onClick={handlePrint}>
                SIMPAN BUKTI <span>↗</span>
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
