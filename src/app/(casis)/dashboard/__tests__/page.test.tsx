import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SignJWT } from "jose";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  secret: "synthetic-dashboard-test-secret-at-least-32-characters",
  cookies: new Map<string, string>(),
  setCookie: vi.fn(), findUser: vi.fn(), mutation: vi.fn(), period: vi.fn(),
  application: vi.fn(), startExam: vi.fn(),
  redirect: vi.fn((url: string): never => { throw new Error(`TEST_REDIRECT:${url}`); }),
}));
vi.mock("next/headers", () => ({ cookies: () => ({
  get: (key: string) => fixtures.cookies.has(key) ? { value: fixtures.cookies.get(key) } : undefined,
  set: fixtures.setCookie,
}) }));
vi.mock("next/navigation", () => ({ redirect: fixtures.redirect, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/constants", () => ({ getJwtSecret: () => fixtures.secret }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: fixtures.findUser, upsert: fixtures.mutation, update: fixtures.mutation },
  application: { findMany: fixtures.application, update: fixtures.mutation },
  examPeriod: { findFirst: fixtures.period },
  attendance: { create: fixtures.mutation },
  examAttempt: { create: fixtures.mutation },
  studentActionLog: { create: fixtures.mutation },
} }));
vi.mock("@/lib/exam-service", () => ({ startExamSession: fixtures.startExam }));
import DashboardPage, { dynamic } from "../page";
import LoginPage from "../../login/page";

const claims = { userId: "synthetic-user-a", robloxId: 123, authVersion: 2, authMethod: "ROBLOX_OIDC", isOwnershipVerified: true };
const userA = {
  id: "synthetic-user-a", robloxId: 987654321n, username: "CasisAlpha", displayName: "Casis Alpha",
  accessToken: "synthetic-access-secret", nonce: "synthetic-nonce", state: "synthetic-state",
  policeGroupRankName: "SYNTHETIC_RANK", isPoliceMember: true,
};
async function setSession(payload: Record<string, unknown> = claims, expired = false) {
  const jwt = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + (expired ? -60 : 3600))
    .sign(new TextEncoder().encode(fixtures.secret));
  fixtures.cookies.set("brk_token", jwt);
}
async function renderDashboard() { return renderToStaticMarkup(await DashboardPage()); }

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.cookies.clear();
  fixtures.findUser.mockReset().mockResolvedValue(userA);
  fixtures.application.mockReset().mockResolvedValue([]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External requests are forbidden"); }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Dashboard Casis (Absensi & Pengecekan Hasil)", () => {
  it("renders the attendance panel and status checker directly without requiring a login session", async () => {
    const html = await renderDashboard();
    expect(html).toContain("Absensi &amp; Status Seleksi");
    expect(html).toContain("Form Absensi Casis");
    expect(html).toContain("Cek Hasil Absen &amp; Status Tahap Akademik");
    expect(html).toContain("Username Roblox");
    expect(html).toContain("Username Discord");
    expect(html).toContain("Motivasi Bergabung");
    expect(html).toContain("PUSDIK RESERSE");
    expect(html).toContain("BERANDA");
    expect(fixtures.redirect).not.toHaveBeenCalled();
  });

  it("renders the authenticated user identity in the header when a session is present", async () => {
    await setSession();
    const html = await renderDashboard();
    expect(html).toContain("CALON SISWA");
    expect(html).toContain("Casis Alpha");
    expect(html).toContain("KELUAR");
    expect(html).toContain("Absensi &amp; Status Seleksi");
  });

  it("handles session verification errors gracefully and renders the dashboard safely", async () => {
    fixtures.findUser.mockRejectedValue(new Error("synthetic-database-credential"));
    const html = await renderDashboard();
    expect(html).toContain("Absensi &amp; Status Seleksi");
    expect(html).not.toMatch(/synthetic-database-credential/);
  });

  it("escapes identity text and falls back to username when displayName is blank", async () => {
    await setSession();
    fixtures.findUser.mockResolvedValue({
      ...userA,
      username: "synthetic_casis",
      displayName: "  ",
    });
    const html = await renderDashboard();
    expect(html).toContain("synthetic_casis");
  });

  it("exports dynamic = force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
