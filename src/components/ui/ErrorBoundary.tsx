"use client";

import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
          <div className="relative w-full max-w-lg border border-[#b52228]/40 bg-[#111111] p-6 shadow-2xl sm:p-8">
            <div className="absolute left-0 right-0 top-0 h-[2px] bg-[#b52228]" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] border border-[#b52228]/50 bg-[#b52228]/10 text-[#e04040]">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#b52228]">
                  SISTEM INFORMASI // PENGECUALIAN APLIKASI
                </p>
                <h1 className="font-serif text-lg font-bold tracking-tight text-[#eeeae2] sm:text-xl">
                  Terjadi Kesalahan Sistem
                </h1>
              </div>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-[#918d86] sm:text-sm">
              Aplikasi mendeteksi interupsi yang tidak terduga saat memproses permintaan. Silakan lakukan muat ulang halaman atau kembali ke beranda utama.
            </p>

            {this.state.error?.message && (
              <div className="mt-4 border border-white/10 bg-[#0a0a0a] p-3 text-left">
                <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-[#918d86]">
                  Keterangan Diagnostik:
                </p>
                <p className="break-words font-mono text-xs leading-snug text-[#eeeae2]/90">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                className="flex-1 cursor-pointer rounded-[3px] bg-[#b52228] px-4 py-3 text-center font-sans text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#8f171d]"
                onClick={() => window.location.reload()}
              >
                Muat Ulang Halaman
              </button>
              <button
                type="button"
                className="flex-1 cursor-pointer rounded-[3px] border border-white/20 bg-white/[0.03] px-4 py-3 text-center font-sans text-xs font-semibold uppercase tracking-wider text-[#eeeae2] transition-colors hover:border-white/40 hover:bg-white/[0.08]"
                onClick={() => (window.location.href = "/")}
              >
                Ke Beranda Utama
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
