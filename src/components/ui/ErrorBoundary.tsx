"use client";

import React from "react";
import { Button } from "@/components/ui/Button";

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
        <div className="flex min-h-[50vh] items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl border border-red-500/30 bg-[#111] p-8 text-center">
            <div className="text-4xl">💥</div>
            <h1 className="mt-4 font-display text-xl font-bold text-red-300">
              Terjadi Kesalahan
            </h1>
            <p className="mt-3 text-sm text-zinc-400">
              Halaman mengalami error yang tidak terduga. Silakan muat ulang atau kembali ke beranda.
            </p>
            <p className="mt-2 font-mono text-xs text-zinc-600">
              {this.state.error?.message}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                variant="gold"
                className="flex-1"
                onClick={() => window.location.reload()}
              >
                Muat Ulang
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => (window.location.href = "/")}
              >
                Ke Beranda
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
