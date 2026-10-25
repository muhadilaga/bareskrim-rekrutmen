import { REDIRECT_BLOCKED_MESSAGE } from "@/lib/constants";
import Link from "next/link";

export const metadata = { title: "Akses Ditolak - Rekrutmen Bareskrim PolriRbx [RI]" };

export default function TolakPage() {
  return (
    <div
      style={{
        minHeight: "75vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 16px",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          width: "100%",
          border: "1px solid var(--casis-border)",
          background: "var(--casis-surface)",
          textAlign: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "36px 24px",
            borderBottom: "1px solid var(--casis-border)",
            background: "rgba(180, 40, 40, 0.08)",
          }}
        >
          <div
            style={{
              width: "60px",
              height: "60px",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: "1px solid rgba(216, 117, 117, 0.5)",
              background: "rgba(216, 117, 117, 0.15)",
              fontSize: "28px",
            }}
          >
            ⛔
          </div>
          <h1
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "20px",
              fontWeight: 700,
              color: "#f08a8a",
              letterSpacing: "0.08em",
              margin: "16px 0 0",
            }}
          >
            AKSES UJIAN DITOLAK
          </h1>
        </div>

        <div style={{ padding: "32px 28px" }}>
          <p style={{ fontSize: "14px", lineHeight: "1.7", color: "var(--casis-text)", margin: 0 }}>
            {REDIRECT_BLOCKED_MESSAGE}
          </p>
          <div
            style={{
              width: "80px",
              height: "1px",
              background: "var(--casis-gold)",
              margin: "24px auto",
              opacity: 0.4,
            }}
          />
          <p style={{ fontSize: "12px", color: "var(--casis-muted)", lineHeight: "1.6", margin: 0 }}>
            Sistem cross-group check mendeteksi keanggotaan Anda pada matra lain (TNI AD / TNI AL).
            Jika menurut Anda ini sebuah kesalahan, hubungi instruktur di server Discord.
          </p>

          <Link
            href="/dashboard"
            style={{
              display: "inline-block",
              marginTop: "28px",
              padding: "12px 28px",
              border: "1px solid var(--casis-gold)",
              background: "var(--casis-gold)",
              color: "#000",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textDecoration: "none",
              textTransform: "uppercase",
            }}
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
