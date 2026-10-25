import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  computeCodeChallenge,
  encryptSecret,
  decryptSecret,
  generateCodeVerifier,
  buildAuthorizeUrl,
  getOAuthConfig,
  getOAuthEncryptionKey,
  type OAuthConfig,
} from "@/lib/oauth";

// TASK 03L.2B.2 PHASE C — Preflight enkripsi & wiring OAuth.
// Semua dijalankan dengan key/config SINTETIS: tidak membaca .env nyata,
// tidak mencetak credential.

describe("AES-256-GCM round-trip (key sintetis)", () => {
  it("encrypt -> decrypt identik", () => {
    const key = new Uint8Array(randomBytes(32));
    const plain = "code_verifier_preflight_abcdef1234567890";
    const enc = encryptSecret(plain, key);
    expect(decryptSecret(enc, key)).toBe(plain);
  });

  it("format ciphertext 3 bagian (iv.ciphertext.authtag)", () => {
    const key = new Uint8Array(randomBytes(32));
    expect(encryptSecret("x", key).split(".").length).toBe(3);
  });

  it("key berbeda -> decrypt gagal (auth tag GCM)", () => {
    const keyA = new Uint8Array(randomBytes(32));
    const keyB = new Uint8Array(randomBytes(32));
    const enc = encryptSecret("rahasia", keyA);
    expect(() => decryptSecret(enc, keyB)).toThrow();
  });
});

describe("PKCE S256", () => {
  it("verifier 128 karakter (batas 43-128 terpenuhi)", () => {
    expect(generateCodeVerifier().length).toBe(128);
  });

  it("challenge tanpa padding base64", () => {
    for (let i = 0; i < 20; i++) {
      expect(computeCodeChallenge(generateCodeVerifier())).not.toContain("=");
    }
  });
});

describe("wiring configuration development", () => {
  const cfg: OAuthConfig = {
    clientId: "1234567890",
    clientSecret: "synthetic-client-secret-for-structure-test",
    redirectUri: "http://localhost:3000/api/auth/roblox/callback",
    encryptionKey: new Uint8Array(randomBytes(32)),
  };

  it("authorize URL menunjuk endpoint resmi Roblox dengan parameter PKCE", () => {
    const url = new URL(
      buildAuthorizeUrl(cfg, { state: "s", codeChallenge: "c", nonce: "n" })
    );
    expect(url.host).toBe("apis.roblox.com");
    expect(url.pathname).toBe("/oauth/v1/authorize");
    expect([...url.searchParams.keys()].sort()).toEqual([
      "client_id",
      "code_challenge",
      "code_challenge_method",
      "nonce",
      "redirect_uri",
      "response_type",
      "scope",
      "state",
    ]);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid profile");
  });

  it("getOAuthConfig fail-closed tanpa env (null, bukan default secret)", () => {
    const saved = { ...process.env };
    delete process.env.ROBLOX_OAUTH_CLIENT_ID;
    delete process.env.ROBLOX_OAUTH_CLIENT_SECRET;
    delete process.env.ROBLOX_OAUTH_REDIRECT_URI;
    delete process.env.OAUTH_STATE_ENCRYPTION_KEY;
    try {
      expect(getOAuthConfig()).toBeNull();
      expect(getOAuthEncryptionKey()).toBeNull();
    } finally {
      Object.assign(process.env, saved);
    }
  });
});
