import React from "react";
import Link from "next/link";

export function CasisShell({
  variant,
  user,
  backHref,
  backLabel,
  children,
}: {
  variant: "login" | "dashboard";
  user?: { displayName?: string | null; username: string };
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  const isDashboard = variant === "dashboard";
  const name = user?.displayName?.trim() || user?.username || "Peserta";

  return (
    <div className={`casis-shell casis-shell--${variant}`}>
      <a className="casis-skip-link" href="#casis-main">Lewati ke konten</a>
      {isDashboard ? (
        <header className="student-header">
          <Link href="/" className="student-brand" aria-label="Beranda Bareskrim Polri RBX">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design-assets/logo-pusdik.png" alt="" width={34} height={34} />
            <div>
              <strong>BARESKRIM POLRI RBX</strong>
              <span>PUSDIK RESERSE</span>
            </div>
          </Link>
          <div className="student-header-right">
            {user ? (
              <div className="student-user">
                <span>CALON SISWA</span>
                <strong>{name}</strong>
              </div>
            ) : (
              <div className="student-user">
                <span>PORTAL CASIS</span>
                <strong>PUSDIK RESERSE</strong>
              </div>
            )}
            {backHref && (
              <Link href={backHref} className="logout-button" style={{ marginRight: 6 }}>
                {backLabel || "KEMBALI"}
              </Link>
            )}
            <Link href="/api/auth/logout" className="logout-button">
              {user ? "KELUAR" : "BERANDA"}
            </Link>
          </div>
        </header>
      ) : (
        <header className="casis-header">
          <a className="casis-brand" href="/" aria-label="Beranda Bareskrim Polri RBX">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design-assets/logo-pusdik.png" alt="" width={42} height={42} />
            <span><strong>BARESKRIM POLRI RBX</strong><small>PUSDIK RESERSE</small></span>
          </a>
          <span className="casis-system-label">PORTAL CASIS</span>
        </header>
      )}
      <main id="casis-main" className={`casis-main casis-main--${variant}`} tabIndex={-1}>
        {children}
      </main>
      {isDashboard ? (
        <footer className="student-footer">
          <div className="student-footer-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/design-assets/logo-pusdik.png" alt="" width={28} height={28} />
            <div>
              <strong>BARESKRIM POLRI RBX</strong>
              <span>PUSDIK RESERSE</span>
            </div>
          </div>
          <span>PUSDIK RESERSE · BARESKRIM POLRI RBX</span>
        </footer>
      ) : (
        <footer className="casis-footer">
          <span>PUSDIK RESERSE</span>
          <span>BARESKRIM POLRI RBX</span>
        </footer>
      )}
    </div>
  );
}
