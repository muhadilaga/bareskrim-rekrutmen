import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

globalThis.React = React;

// Komponen memakai konteks toast; default context adalah no-op sehingga tidak
// perlu provider untuk render statis.
vi.mock("@/components/ui/Toast", () => ({
  useToastContext: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { HasilChecker } from "../HasilChecker";

// ============================================================================
// TASK 03L.2E.4.4 — Frontend: /hasil tidak lagi melakukan pencarian hasil
// berdasarkan username bebas. Render awal (state "loading") tidak boleh
// menampilkan form input username lama.
//
// Catatan: proyek ini tidak memasang jsdom/@testing-library, jadi efek fetch
// tidak dieksekusi di sini. Penegakan ownership yang sebenarnya diuji pada
// src/app/api/hasil/__tests__/route.test.ts.
// ============================================================================
describe("HasilChecker — tidak ada pencarian username publik", () => {
  it("render awal tanpa form input username (UI lookup lama dihapus)", () => {
    const html = renderToStaticMarkup(<HasilChecker kkm={70} />);

    expect(html.length).toBeGreaterThan(0);
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Username Roblox");
    expect(html).not.toContain("Masukkan username Roblox");
    expect(html).not.toContain("Cek Hasil");
  });
});
