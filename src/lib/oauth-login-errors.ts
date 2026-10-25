const OAUTH_LOGIN_MESSAGES = {
  oauth_denied: "Login Roblox tidak diselesaikan.",
  missing_params: "Permintaan login tidak lengkap atau sudah tidak berlaku.",
  invalid_or_expired_state: "Permintaan login tidak lengkap atau sudah tidak berlaku.",
  oauth_not_configured: "Login Roblox belum tersedia. Hubungi operator.",
  token_exchange_failed: "Proses login Roblox belum berhasil diselesaikan.",
  invalid_id_token: "Identitas Roblox belum berhasil diverifikasi.",
  identity_invalid: "Identitas Roblox belum berhasil diverifikasi.",
  user_reconciliation_failed: "Akun belum berhasil disiapkan. Hubungi operator.",
} as const;

const GENERIC_MESSAGE = "Login belum berhasil diselesaikan. Silakan kembali ke halaman login atau hubungi operator.";

/** Query values are never reflected in output, including repeated or unknown values. */
export function getOAuthLoginErrorMessage(error: string | string[] | undefined): string | null {
  if (error === undefined) return null;
  if (typeof error !== "string" || !Object.prototype.hasOwnProperty.call(OAUTH_LOGIN_MESSAGES, error)) {
    return GENERIC_MESSAGE;
  }
  return OAUTH_LOGIN_MESSAGES[error as keyof typeof OAUTH_LOGIN_MESSAGES];
}
