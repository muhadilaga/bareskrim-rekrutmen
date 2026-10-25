import React from "react";

export function RobloxLoginPanel({ errorMessage }: { errorMessage: string | null }) {
  return (
    <section className="casis-login-panel" aria-labelledby="login-title">
      <p className="casis-eyebrow">AKSES CASIS</p>
      <h1 id="login-title">Masuk dengan Roblox</h1>
      <p className="casis-login-description">Gunakan akun Roblox Anda untuk mengakses dashboard Casis.</p>
      {errorMessage && <p className="casis-login-error" role="alert">{errorMessage}</p>}
      {/* A plain anchor prevents framework prefetch from creating OAuth state. */}
      <a className="casis-primary-link" href="/api/auth/roblox/start">
        MASUK DENGAN ROBLOX <span aria-hidden="true">→</span>
      </a>
      <p className="casis-login-note">Login memverifikasi kepemilikan akun Roblox. Penerimaan pendaftaran ditentukan melalui proses seleksi.</p>
      <div className="casis-login-links">
        <a className="casis-text-link" href="/">← Kembali ke beranda</a>
        {errorMessage && <a className="casis-text-link" href="/dashboard">Buka dashboard →</a>}
      </div>
    </section>
  );
}
