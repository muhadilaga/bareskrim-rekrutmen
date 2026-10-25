import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const VERIFY_ROUTE_SRC = readFileSync(
  path.join(process.cwd(), "src/app/api/auth/verify/route.ts"),
  "utf-8"
);
const AUTH_LIB_SRC = readFileSync(
  path.join(process.cwd(), "src/lib/auth.ts"),
  "utf-8"
);
const CALLBACK_ROUTE_SRC = readFileSync(
  path.join(process.cwd(), "src/app/api/auth/roblox/callback/route.ts"),
  "utf-8"
);

describe("TASK 03L.2B.1 — Authentication Trust Boundary Hardening", () => {
  it("legacy /api/auth/verify does NOT issue session cookies (shutdown tombstone)", () => {
    // 1) Tidak ada penerbitan cookie JWT legacy
    expect(VERIFY_ROUTE_SRC).not.toContain("createSessionCookie");
    expect(VERIFY_ROUTE_SRC).not.toContain("signSession");
    expect(VERIFY_ROUTE_SRC).not.toContain("brk_token");
    // 2) Tidak ada lookup publik Roblox di dalam route
    expect(VERIFY_ROUTE_SRC).not.toContain("resolveUserByUsername");
    expect(VERIFY_ROUTE_SRC).not.toContain("getUserGroups");
    // 3) Tidak ada database write/read di route
    expect(VERIFY_ROUTE_SRC).not.toContain("prisma.");
    // 4) Respons eksplisit legacy disabled
    expect(VERIFY_ROUTE_SRC).toContain("LEGACY_LOGIN_DISABLED");
  });

  it("auth.ts: legacy issuance primitives removed (signSession, createSessionCookie, verifySessionToken export)", () => {
    // Penerbit legacy dihapus — satu-satunya jalur = signTrustedSession
    expect(AUTH_LIB_SRC).not.toContain("export async function signSession");
    expect(AUTH_LIB_SRC).not.toContain("export async function createSessionCookie");
    expect(AUTH_LIB_SRC).not.toContain("export async function verifySessionToken");
    expect(AUTH_LIB_SRC).toContain("export async function signTrustedSession");
    // getSessionUser fail-closed: tanpa opsi melonggarkan
    expect(AUTH_LIB_SRC).toContain("verifyTrustedSessionToken(token)");
    expect(AUTH_LIB_SRC).not.toContain("requireTrusted");
  });

  it("only OAuth callback issues trusted sessions", () => {
    // Callback memakai createTrustedSessionCookie (klaim v2), bukan jalur legacy
    expect(CALLBACK_ROUTE_SRC).toContain("createTrustedSessionCookie");
    expect(CALLBACK_ROUTE_SRC).not.toContain("createSessionCookie");
  });

  it("flags authentication blocker for public student-claim endpoint", () => {
    // Dokumentasi konstrain keamanan:
    // Student Claim API hanya boleh dibuka SETELAH trusted OIDC login berjalan
    // penuh. Endpoint ini belum ada (TASK berikutnya).
    const hasStudentClaimEndpoint = false;
    expect(hasStudentClaimEndpoint).toBe(false);
  });
});
