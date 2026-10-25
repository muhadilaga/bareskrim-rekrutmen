import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

globalThis.React = React;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/ui/Toast", () => ({
  useToastContext: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { AttendanceChecker } from "../AttendanceChecker";

describe("AttendanceChecker Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders safe unavailable notice and does NOT execute any legacy POST fetch", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/period/active") {
        return Promise.resolve({
          json: () => Promise.resolve({ active: true }),
        });
      }
      if (url === "/api/attendance/check") {
        return Promise.resolve({
          json: () => Promise.resolve({ attended: false }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    vi.stubGlobal("fetch", fetchMock);

    // Render component
    const html = renderToStaticMarkup(<AttendanceChecker />);

    // Verify expected content for casis attendance form
    expect(html).toContain("Absensi &amp; Status Seleksi");
    expect(html).toContain("Username Roblox");
    expect(html).toContain("Username Discord");
    expect(html).toContain("Motivasi Bergabung");
    expect(html).toContain("Kirim Absensi &amp; Verifikasi Tahap Akademik");
    expect(html).toContain("Kembali ke Beranda →");

    // Verify NO initial submit was called
    const fetchUrls = fetchMock.mock.calls.map((call) => call[0]);
    expect(fetchUrls).not.toContain("/api/attendance/verify");
    expect(fetchUrls).not.toContain("/api/attendance/submit");
  });
});
