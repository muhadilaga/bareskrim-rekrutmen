"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const messages: Record<string, string> = {
  CLAIM_REJECTED: "Pendaftaran belum dapat dihubungkan. Periksa Registration ID, Access Token, dan akun Roblox yang digunakan.",
  INVALID_REQUEST: "Periksa format dan panjang Registration ID serta Access Token.",
  AUTH_REQUIRED: "Sesi Anda tidak tersedia. Silakan masuk melalui Roblox terlebih dahulu.",
  REQUEST_REJECTED: "Permintaan tidak dapat diproses. Muat ulang halaman ini.",
  RATE_LIMITED: "Terlalu banyak percobaan. Silakan tunggu 15 menit sebelum mencoba lagi.",
};
const unavailable = "Hasil belum dapat dipastikan. Muat ulang dashboard sebelum mencoba lagi.";

export function StudentClaimForm() {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const registration = form.elements.namedItem("registrationId") as HTMLInputElement;
    const token = form.elements.namedItem("accessToken") as HTMLInputElement;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/applications/claim", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: registration.value, accessToken: token.value }),
      });
      const result: unknown = await response.json();
      const code = result && typeof result === "object" && "code" in result ? result.code : null;
      if (response.status === 200 && code === "CLAIM_OK") {
        token.value = "";
        registration.value = "";
        setMessage("Pendaftaran berhasil dihubungkan.");
        router.refresh();
      } else {
        setMessage(typeof code === "string" && Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] : unavailable);
      }
    } catch { setMessage(unavailable); }
    finally {
      token.value = "";
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="casis-claim-form" onSubmit={submit} aria-busy={busy}>
      <h3>Hubungkan pendaftaran</h3>
      <p>Masukkan Registration ID dan Access Token dari bukti pendaftaran Anda. Gunakan akun Roblox yang sama dengan data pendaftaran.</p>
      <label htmlFor="claim-registration">REGISTRATION ID</label>
      <input id="claim-registration" name="registrationId" type="text" maxLength={128} required autoComplete="off" spellCheck={false} disabled={busy} />
      <label htmlFor="claim-token">ACCESS TOKEN</label>
      <input id="claim-token" name="accessToken" type="password" maxLength={256} required autoComplete="off" spellCheck={false} disabled={busy} />
      <p className="casis-claim-note">Token ini diberikan saat pendaftaran, bukan password Roblox. Menghubungkan pendaftaran tidak memberikan hak mengikuti ujian atau absensi.</p>
      {message && <p className="casis-claim-message" role="status" aria-live="polite">{message}</p>}
      <button className="casis-primary-link" type="submit" disabled={busy}>{busy ? "MENGHUBUNGKAN…" : "HUBUNGKAN PENDAFTARAN"}</button>
    </form>
  );
}
