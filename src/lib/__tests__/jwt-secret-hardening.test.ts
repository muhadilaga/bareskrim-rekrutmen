import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { getJwtSecret } from "@/lib/constants";
import { getSessionUser, signTrustedSession, verifyTrustedSessionToken } from "@/lib/auth";

// TASK 03L.2B.2 — Regression test penghapusan hardcoded JWT fallback.
// Skenario: missing / invalid / valid / secret berbeda / expired / tanpa
// kebocoran secret pada pesan error.

const OLD_FALLBACK = "RahasiaBareskrimRecruitment2026";
const STRONG_TEST_SECRET = "hardening-03L2B2-secret-minimum-32-chars!";
const WEAK_SECRET = "pendek";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1" }) } },
}));

function reqWithCookie(token: string) {
  return new Request("http://localhost/api/test", { headers: { cookie: `brk_token=${token}` } });
}

const savedSecret = process.env.JWT_SECRET;
beforeEach(() => {
  process.env.JWT_SECRET = STRONG_TEST_SECRET;
  cookieJar.clear();
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

describe("1: JWT_SECRET missing -> getJwtSecret fail-closed", () => {
  it("membuang error tanpa nilai secret", () => {
    delete process.env.JWT_SECRET;
    let caught: Error | null = null;
    try {
      getJwtSecret();
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain("JWT_SECRET");
    // Error tidak mengekspos secret apa pun
    expect(caught!.message).not.toContain(STRONG_TEST_SECRET);
    expect(caught!.message).not.toContain(OLD_FALLBACK);
  });

  it("signTrustedSession dan getSessionUser ikut gagal (tidak ada sesi diterbitkan)", async () => {
    delete process.env.JWT_SECRET;
    await expect(signTrustedSession({ userId: "u", robloxId: 1 })).rejects.toThrow(/JWT_SECRET/);
    expect(await getSessionUser(reqWithCookie("token-apapun"))).toBeNull();
  });
});

describe("2: JWT_SECRET invalid (< 32 karakter) -> fail-closed", () => {
  it("getJwtSecret menolak secret pendek", () => {
    process.env.JWT_SECRET = WEAK_SECRET;
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it("signTrustedSession menolak secret pendek", async () => {
    process.env.JWT_SECRET = WEAK_SECRET;
    await expect(signTrustedSession({ userId: "u", robloxId: 1 })).rejects.toThrow();
  });
});

describe("3: trusted session valid dengan secret environment diterima", () => {
  it("signTrustedSession -> verifyTrustedSessionToken sukses", async () => {
    const token = await signTrustedSession({ userId: "user-1", robloxId: 123 });
    const payload = await verifyTrustedSessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("user-1");
  });
});

describe("4: JWT ditandatangani dengan secret berbeda DITOLAK", () => {
  it("token dari secret lain tidak lolos verifikasi", async () => {
    const forged = await new SignJWT({
      userId: "user-1",
      robloxId: 123,
      authVersion: 2,
      authMethod: "ROBLOX_OIDC",
      isOwnershipVerified: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode("secret-lain-bukan-yang-benar-32-char"));
    expect(await verifyTrustedSessionToken(forged)).toBeNull();
    expect(await getSessionUser(reqWithCookie(forged))).toBeNull();
  });
});

describe("5: expired session DITOLAK", () => {
  it("token kedaluwarsa tidak lolos verifikasi", async () => {
    const expired = await new SignJWT({
      userId: "user-1",
      robloxId: 123,
      authVersion: 2,
      authMethod: "ROBLOX_OIDC",
      isOwnershipVerified: true,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(STRONG_TEST_SECRET));
    expect(await verifyTrustedSessionToken(expired)).toBeNull();
    expect(await getSessionUser(reqWithCookie(expired))).toBeNull();
  });
});

describe("hardcoded fallback terhapus dari source", () => {
  it("constants.ts tidak lagi berisi fallback secret JWT", () => {
    const src = readFileSync(path.join(process.cwd(), "src/lib/constants.ts"), "utf-8");
    expect(src).not.toContain("JWT_SECRET_FALLBACK");
    expect(src).not.toContain(OLD_FALLBACK);
    expect(src).toContain("FAIL-CLOSED");
  });
});
