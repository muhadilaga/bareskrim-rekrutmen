import { describe, expect, it } from "vitest";
import { getOAuthLoginErrorMessage } from "../oauth-login-errors";

describe("OAuth login error allowlist", () => {
  it("does not show an error when the parameter is absent", () => {
    expect(getOAuthLoginErrorMessage(undefined)).toBeNull();
  });

  it.each([
    ["oauth_denied", "Login Roblox tidak diselesaikan."],
    ["missing_params", "Permintaan login tidak lengkap atau sudah tidak berlaku."],
    ["invalid_or_expired_state", "Permintaan login tidak lengkap atau sudah tidak berlaku."],
    ["oauth_not_configured", "Login Roblox belum tersedia. Hubungi operator."],
    ["token_exchange_failed", "Proses login Roblox belum berhasil diselesaikan."],
    ["invalid_id_token", "Identitas Roblox belum berhasil diverifikasi."],
    ["identity_invalid", "Identitas Roblox belum berhasil diverifikasi."],
    ["user_reconciliation_failed", "Akun belum berhasil disiapkan. Hubungi operator."],
  ])("maps %s to fixed user-facing text", (code, message) => {
    expect(getOAuthLoginErrorMessage(code)).toBe(message);
  });

  it.each([
    "", "unknown", "toString", "constructor", "__proto__",
    "<script>synthetic-secret</script>",
    "https://localhost/callback?code=synthetic-code&state=synthetic-state",
    ["invalid_id_token", "invalid_id_token"],
    ["oauth_denied", "synthetic-secret"],
    [],
  ])("uses generic text for an untrusted parameter %#", (value) => {
    expect(getOAuthLoginErrorMessage(value)).toBe(getOAuthLoginErrorMessage("unknown"));
    expect(getOAuthLoginErrorMessage(value)).not.toMatch(/synthetic|<script>|callback|invalid_id_token/);
  });
});
