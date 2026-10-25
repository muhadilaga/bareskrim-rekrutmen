# BARESKRIM REKRUTMEN V2 — ARCHITECTURE SPECIFICATION
## 13. Roblox OAuth 2.0 / OIDC Architecture & Legacy Authentication Remediation

- **Dokumen:** 13-ROBLOX-OAUTH-AUTHENTICATION.md
- **Status:** FINAL APPROVED ARCHITECTURE SPECIFICATION (TASK 03L.2A.2)
- **Workspace:** `D:\Dev\Projects\bareskrim-rekrutmen-v2`
- **Target DB:** `bareskrim-rekrutmen-v2-dev` (`fbaruxhukashpsvtbdic`)
- **Prinsip Utama:** Read-Only Technical Specification Only. Pembuktian kepemilikan akun Roblox berbasis standar industri (OIDC Live Discovery), Server-Side OAuth State Storage atomis, panduan panduan operator, invalidasi sesi unauthenticated legacy, dan kesiapan integrasi Student Claim.

---

### 1. Existing Authentication Audit & Gap Analysis

#### 1.1 Hasil Audit Route `POST /api/auth/verify` Existing
1. **Fungsi Existing:** Menerima `username` Roblox dari JSON body, menyelesaikan username ke Roblox User ID via REST API Roblox publik (`users.roblox.com`), mengecek grup/matra/pangkat, lalu menerbitkan cookie `brk_token`.
2. **Celah Keamanan (Vulnerability):** `POST /api/auth/verify` **TIDAK MEMINTA** password, token OAuth, maupun kode verifikasi. Pengguna A dapat memasukkan username Roblox milik Pengguna B dan memperoleh cookie sesi `brk_token` atas nama Pengguna B.
3. **Implikasi Keamanan:** Identitas di dalam `brk_token` tidak terbukti kepemilikannya (*unauthenticated identity*). Menghubungkan pendaftaran (`Application`) menggunakan sesi dari `/api/auth/verify` akan membuka celah *account takeover* (seseorang dapat mengklaim pendaftaran milik orang lain).

#### 1.2 Keputusan Arsitektur
- Mengadopsi **Roblox OAuth 2.0 + OpenID Connect (OIDC)** sebagai **satu-satunya sumber otentikasi tepercaya** (*trusted authentication source*) untuk pembuktian kepemilikan akun Roblox pada V2.
- Menghentikan penggunaan `POST /api/auth/verify` sebagai penerbit sesi tepercaya (remidiasi legacy authentication).

---

### 2. Official Roblox OAuth 2.0 / OIDC Contract (Live Discovery Standards)

Berdasarkan Live Discovery Roblox (`https://apis.roblox.com/oauth/.well-known/openid-configuration`) & OpenID Connect Core 1.0:

#### 2.1 Endpoints & Discovery
- **Discovery Endpoint:** `https://apis.roblox.com/oauth/.well-known/openid-configuration`
- **Issuer (`iss`):** `https://apis.roblox.com/oauth/` (akhiran `/` resmi, **bukan** `/oauth/v1`)
- **Authorization Endpoint:** `https://apis.roblox.com/oauth/v1/authorize`
- **Token Endpoint:** `https://apis.roblox.com/oauth/v1/token`
- **UserInfo Endpoint:** `https://apis.roblox.com/oauth/v1/userinfo`
- **JWKS Endpoint (Certificates):** `https://apis.roblox.com/oauth/v1/certs`

#### 2.2 Scopes
- **`openid`** (Wajib): Menandakan permintaan OpenID Connect dan mengembalikan `id_token`.
- **`profile`** (Wajib): Mengakses klaim profil publik Roblox (`sub`, `name`, `nickname`, `preferred_username`, `created_at`, `profile`).

#### 2.3 Cryptographic Standards & Verification Algorithm
- **PKCE (Proof Key for Code Exchange):** Memakai metode `S256`.
  - `code_verifier`: String acak 43–128 karakter (kriptografis).
  - `code_challenge`: `BASE64URL-ENCODE(SHA256(code_verifier))`.
- **State & Nonce:** `state` 256-bit acak untuk pencegahan CSRF; `nonce` 256-bit acak untuk validasi `id_token`.
- **ID Token Signing Algorithm & Verification:**
  - ID Token Roblox di-sign menggunakan algoritma **`ES256`** (ECDSA P-256 dengan SHA-256), **BUKAN RS256**!
  - Algoritma allowlist pada pustaka JWT verifier wajib diset secara eksplisit: `algorithms: ["ES256"]`.
  - Kunci publik diambil secara dinamis dari JWKS Roblox (`https://apis.roblox.com/oauth/v1/certs`).
  - **Catatan Pemisahan Algoritma:** Algoritma **`HS256`** HANYA digunakan untuk otentikasi sesi internal aplikasi (`brk_token`), **DILARANG** digunakan untuk memverifikasi `id_token` Roblox.
  - Aturan validasi `id_token`:
    1. `iss === "https://apis.roblox.com/oauth/"` (akhiran `/`)
    2. `aud === ROBLOX_OAUTH_CLIENT_ID`
    3. `exp > Math.floor(Date.now() / 1000)` (belum kadaluarsa)
    4. `nonce === savedNonce`
    5. `sub` mengembalikan Roblox User ID dalam format string numerik (misal `"123456789"`).

---

### 3. Server-Side OAuth Temporary State Final Decision

#### 3.1 Masalah Keamanan State di Client
Penyimpanan `code_verifier` mentah di dalam signed cookie yang dikirim ke browser memiliki risiko kerahasiaan:
- Signed cookie (HMAC SHA-256) menjamin integritas (tamper-proof), tetapi **TIDAK menjamin kerahasiaan** karena payload berformat Base64URL yang dapat dibaca client.
- Menghapus cookie via `Set-Cookie: Max-Age=0` saat callback tidak menjamin *single-use* pada request paralel/concurrent callback di lingkungan serverless multi-instance (Vercel/Netlify).

#### 3.2 Rancangan Keputusan Final: Server-Side Database Persistence (`OAuthState`)
- Browser **HANYA** menerima cookie correlation ID `brk_oauth_sid` (HTTP-only, Secure pada HTTPS, SameSite=Lax, Max-Age 600 detik) yang berisi `stateId` acak (256-bit hex).
- Data sensitif (`code_verifier`, `nonce`, `state`, `expiresAt`) **SEPENUHNYA DISIMPAN DI SERVER** pada database PostgreSQL V2 via model `OAuthState`.

#### 3.3 Proposal Schema Model `OAuthState` (`prisma/schema.prisma`)
```prisma
// ------------------------------------------------------------
// Temporary OAuth State Storage (Server-Side Multi-Instance PKCE & Replay Guard)
// ------------------------------------------------------------
model OAuthState {
  id           String    @id @default(cuid())
  stateId      String    @unique // Diisi dari cookie correlation brk_oauth_sid
  state        String    @unique // Parameter acak 'state' pada URL OAuth
  codeVerifier String    // PKCE code_verifier (sensitif, hanya di server)
  nonce        String    // Nonce untuk validasi id_token
  expiresAt    DateTime  // TTL 10 menit dari pemuatan
  consumedAt   DateTime? // Tanggal konsumsi (penanda single-use)
  createdAt    DateTime  @default(now())

  @@index([stateId])
  @@index([state])
  @@index([expiresAt])
}
```

#### 3.4 Operasi Atomis Konsumsi State & Replay Protection (Multi-Instance Safe)
Saat callback diterima (`GET /api/auth/roblox/callback?code=...&state=...`):
```ts
// Konsumsi atomis single-use via Prisma updateMany:
const consumedState = await prisma.oAuthState.updateMany({
  where: {
    stateId: stateIdFromCookie,
    state: stateFromQueryParam,
    consumedAt: null, // HANYA jika belum pernah dikonsumsi
    expiresAt: { gt: new Date() }, // HANYA jika belum kadaluarsa
  },
  data: {
    consumedAt: new Date(),
  },
});

if (consumedState.count === 0) {
  // State tidak valid, kadaluarsa, atau SUDAH DIKONSUMSI (replay attack / concurrent callback)
  return NextResponse.redirect(new URL("/login?error=invalid_or_expired_state", req.url));
}

// Ambil data verifier dari DB untuk code exchange
const stateRecord = await prisma.oAuthState.findUnique({ where: { stateId: stateIdFromCookie } });
```
- **Keunggulan:** Operasi `updateMany` dengan `consumedAt: null` bersifat atomis di PostgreSQL. Menjamin 100% *single-use* dan tahan dari *replay attack* / *concurrent callback* lintas instance Vercel/Netlify tanpa bergantung pada in-memory state!

#### 3.5 Catatan Keamanan Penyimpanan `codeVerifier` (Encryption Contract)
1. **Server-Side Only:** `codeVerifier` dan `nonce` **TIDAK PERNAH** disimpan di cookie browser. Browser hanya menerima correlation ID acak (`stateId`) di cookie HTTP-only `brk_oauth_sid`.
2. **Enkripsi AES-256-GCM (Sebelum Endpoint OAuth Digunakan):** Rancangan final menyimpan `codeVerifier` terenkripsi di database menggunakan **AES-256-GCM** dengan *secret key* terpisah (misal environment variable `OAUTH_STATE_ENCRYPTION_KEY`) — **BUKAN** `JWT_SECRET` (pemisahan kunci wajib: *encryption key* ≠ *signing key*).
   - Format penyimpanan: `base64(iv).base64(ciphertext).base64(authTag)` (12-byte IV).
   - Enkripsi dilakukan saat record `OAuthState` dibuat; dekripsi dilakukan tepat sebelum code exchange ke Roblox.
   - **TIDAK ADA** plaintext secret (`codeVerifier`, encryption key) yang dicetak ke log maupun error message.
3. **Atomic Consume Contract:** Konsumsi state menggunakan conditional `updateMany` dengan `count === 1` untuk melanjutkan callback. `count === 0` berarti state tidak valid/kadaluarsa/sudah dikonsumsi -> ditolak.
4. **Single-Use Irreversible:** State yang sudah `consumedAt` **TIDAK DAPAT** diaktifkan kembali. Jika exchange token Roblox gagal, state tetap terkonsumsi (tidak re-use) untuk mencegah replay/pencurian code.
5. **Cleanup TTL:** Pembersihan record kedaluwarsa dilakukan melalui **tugas terpisah** (cron job / scheduled cleanup `DELETE FROM "OAuthState" WHERE "expiresAt" < NOW()`), bukan di dalam request path callback.

---

### 4. Sequence Diagram & End-to-End Flow

```
[ Browser / Frontend ]         [ App Server (V2) ]           [ Database V2 (PostgreSQL) ]     [ Roblox OAuth Provider ]
          │                            │                                   │                                │
          │── 1. GET /api/auth/roblox/start ──────────────────────────────►│                                │
          │                            │── 2. Create OAuthState Record ───►│                                │
          │                            │    (stateId, state, verifier, TTL)│                                │
          │◄─ 3. Set brk_oauth_sid & Redirect 302 ─────────────────────────┼───────────────────────────────►│
          │    (URL: https://apis.roblox.com/oauth/v1/authorize)           │                                │
          │                            │                                   │                                │
          │─────────────────────────── 4. User Consent Page ───────────────┼───────────────────────────────►│
          │                                                                │                                │
          │◄────────────────────────── 5. Redirect to Callback ────────────┼────────────────────────────────│
          │    (URL: /api/auth/roblox/callback?code=XXX&state=YYY)         │                                │
          │                            │                                   │                                │
          │── 6. GET /api/auth/roblox/callback ───────────────────────────►│                                │
          │                            │── 7. Atomic Consume OAuthState ──►│                                │
          │                            │    (SET consumedAt = NOW())       │                                │
          │                            │                                   │── 8. Exchange Code + Verifier ─►│
          │                            │                                   │◄─ 9. Return Access & ID Token ─│
          │                            │                                   │                                │
          │                            │                                   │── 10. Verify ID Token (ES256) ─│
          │                            │                                   │── 11. GET /userinfo ──────────►│
          │                            │                                   │◄─ 12. Return User Profile ────│
          │                            │                                   │                                │
          │                            │── 13. Upsert User (robloxId) ────►│                                │
          │                            │── 14. Create Trusted JWT (v2) ────│                                │
          │◄─ 15. Set brk_token Cookie & Redirect /dashboard ────────────────┴────────────────────────────────┘
```

---

### 5. Technical Specification Endpoint Implementation

#### 5.1 `GET /api/auth/roblox/start`
- **Fungsi:** Memulai alur Roblox OAuth 2.0 PKCE.
- **Prosedur:**
  1. Generate `stateId` acak (32 byte hex), `code_verifier` acak (64 byte hex -> 128 char), `state` acak (32 byte hex), dan `nonce` acak (32 byte hex).
  2. Compute `code_challenge = base64url(sha256(code_verifier))`.
  3. Simpan record di DB:
     `prisma.oAuthState.create({ data: { stateId, state, codeVerifier, nonce, expiresAt: new Date(Date.now() + 600000) } })`
  4. Set HTTP-only cookie `brk_oauth_sid = stateId` (Secure pada HTTPS, SameSite=Lax, Max-Age=600 detik).
  5. Construct Authorization URL Roblox:
     `https://apis.roblox.com/oauth/v1/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${ENCODED_REDIRECT_URI}&scope=openid%20profile&state=${state}&code_challenge=${code_challenge}&code_challenge_method=S256&nonce=${nonce}`
  6. Return HTTP 302 Redirect ke Authorization URL tersebut.

#### 5.2 `GET /api/auth/roblox/callback`
- **Fungsi:** Menerima callback dari Roblox OAuth, menukar code, memverifikasi ID Token (ES256), dan menerbitkan sesi terpercaya.
- **Prosedur:**
  1. Baca query params `code`, `state`, dan `error`. Jika ada `error`, return redirect ke `/login?error=oauth_denied`.
  2. Baca cookie `brk_oauth_sid`. Hapus cookie pada respons (`Max-Age=0`).
  3. Eksekusi konsumsi atomis server-side: `prisma.oAuthState.updateMany(...)` (seperti poin 3.4). Jika `count === 0`, redirect ke `/login?error=invalid_or_expired_state`.
  4. Ambil `codeVerifier` dan `nonce` dari record `OAuthState`.
  5. POST request ke `https://apis.roblox.com/oauth/v1/token`:
     - Body: `grant_type=authorization_code`, `client_id=${CLIENT_ID}`, `client_secret=${CLIENT_SECRET}`, `code=${code}`, `code_verifier=${codeVerifier}`.
  6. Parse token response: ambil `access_token` & `id_token`.
  7. Verifikasi `id_token` secara kriptografis menggunakan kunci **`ES256`** dari JWKS Roblox (`https://apis.roblox.com/oauth/v1/certs`).
  8. Validasi `iss === "https://apis.roblox.com/oauth/"`, `aud === CLIENT_ID`, `exp > Date.now()/1000`, dan `nonce === stateRecord.nonce`.
  9. Ambil Roblox User ID dari `id_token.sub` (atau `/userinfo`). Ambil username dari `preferred_username` / `name`.
  10. Eksekusi pengecekan keanggotaan grup kepolisian, matra terlarang (AD/AL), dan blacklist (menggunakan fungsi existing).
  11. Upsert record `User` di database Prisma dengan `robloxId: BigInt(sub)`.
  12. Terbitkan cookie sesi terpercaya `brk_token` v2 (`authMethod: "ROBLOX_OIDC"`, `isOwnershipVerified: true`, `authVersion: 2`).
  13. Redirect ke `/dashboard` atau halaman target klaim.

---

### 6. Session Trust Model & Legacy Remediation Strategy

#### 6.1 Invalidation Strategy Sesi Lama (Legacy Sessions)
Cookie sesi `brk_token` yang lama tidak memiliki penanda metode otentikasi tepercaya. Untuk mencegah bypass:

1. **Struktur Session Payload Baru (`src/lib/auth.ts`):**
```ts
export interface SessionPayload extends JWTPayload {
  userId: string;
  robloxId: number;
  authVersion: 2; // Versioning penanda arsitektur V2
  authMethod: "ROBLOX_OIDC" | "LEGACY_LOOKUP"; // Penanda sumber otentikasi
  isOwnershipVerified: boolean; // Flag eksplisit kepemilikan terverifikasi
}
```

2. **Perubahan pada `getSessionUser(req)` & Access Guards:**
   - Semua route kritis (Student Claim, Exam Attempt, Attendance Submit, Admin Actions) **HARUS MEMERIKSA**:
     `payload.authVersion === 2 && payload.authMethod === "ROBLOX_OIDC" && payload.isOwnershipVerified === true`
   - Sesi lama (tanpa `authVersion` atau `isOwnershipVerified !== true`) akan otomatis ditolak dan diarahkan untuk otentikasi ulang via Roblox OAuth.

3. **Remidiasi `POST /api/auth/verify` Existing:**
   - Route `POST /api/auth/verify` tetap dapat digunakan untuk *read-only diagnostic lookup* (misal memeriksa pangkat tanpa login), tetapi **TIDAK LAGI MENERBITKAN** cookie `brk_token` terpercaya (hanya menerbitkan token dengan `isOwnershipVerified: false` atau tidak menerbitkan token).

---

### 7. Panduan Operator (Roblox OAuth App Setup Guide)

Berikut langkah resmi bagi Operator untuk mendaftarkan Aplikasi OAuth 2.0 di Roblox Creator Dashboard:

#### 7.1 Langkah-Langkah Pendaftaran di Roblox Creator Dashboard:
1. Login ke [Roblox Creator Dashboard](https://create.roblox.com/credentials).
2. Navigasi ke menu **Open Cloud** -> **OAuth 2.0 Apps**.
3. Klik **Create an App**.
4. Isi Detail Aplikasi:
   - **App Name:** `Bareskrim Rekrutmen V2` (atau `Bareskrim Rekrutmen V2 DEV` untuk pengujian lokal).
   - **Description:** `Aplikasi Rekrutmen dan Ujian Pusdik Reserse Bareskrim Polri.`
   - **Permissions / Scopes:** Wajib centang **`openid`** dan **`profile`**.
   - **Redirect URIs:**
     - **Local Development:** `http://localhost:3000/api/auth/roblox/callback`
       *(Catatan Kebijakan Roblox: Roblox memperbolehkan `http://localhost:3000` atau `http://127.0.0.1:3000` khusus untuk pengujian lokal. Untuk Staging/Production, Roblox WAJIB menggunakan protokol HTTPS).*
     - **Production:** `https://[DOMAIN_PROD_VERCEL_NETLIFY]/api/auth/roblox/callback`
5. Simpan / Klik **Create App**.
6. **Manajemen Credential:**
   - Salin **Client ID** (string publik) -> Masukkan ke `ROBLOX_OAUTH_CLIENT_ID` di `.env`.
   - Generasi **Client Secret** (string rahasia) -> Masukkan ke `ROBLOX_OAUTH_CLIENT_SECRET` di `.env`.
   - **PERATURAN KEAMANAN:** Client Secret **DILARANG** dikirim melalui chat, email, commit Git, atau dicetak ke log!

---

### 8. Environment Requirements Contract

Environment Variable yang wajib dikonfigurasi di Netlify / Vercel / `.env` (tanpa mencetak secret nyata):

```env
# Roblox Creator Dashboard -> OAuth 2.0 Settings
ROBLOX_OAUTH_CLIENT_ID="[CLIENT_ID_DARI_ROBLOX]"
ROBLOX_OAUTH_CLIENT_SECRET="[CLIENT_SECRET_DARI_ROBLOX]"
ROBLOX_OAUTH_REDIRECT_URI="http://localhost:3000/api/auth/roblox/callback"

# Server Secret Existing (Minimal 32 Karakter)
JWT_SECRET="[MINIMAL_32_CHAR_SECRET]"
```

---

### 9. Dampak Infrastruktur & Migrasi Database

1. **Skema Database V2 (`prisma/schema.prisma`):**
   - Menambahkan 1 model baru: `OAuthState` (seperti spesifikasi 3.3).
   - Memerlukan migrasi Prisma ringan `20261004000000_add_oauth_state` pada database development V2 saat disetujui.
2. **Dampak Performa:**
   - Pembersihan otomatis (*cron cleanup* / TTL index) untuk record `OAuthState` yang `expiresAt < NOW()` agar tabel tetap ringan.

---

### 10. QA & Test Matrix (Rencana Implementation TASK 03L.2B)

| Skenario Test | Jenis Test | Ekspektasi Hasil |
|---|---|---|
| Start OAuth flow PKCE | Unit / Route Test | Creates `OAuthState` in DB, sets `brk_oauth_sid` cookie, and redirects 302 to Roblox. |
| Valid OAuth Callback + Valid ID Token (ES256) | Integration Test (Mocked OAuth) | Atomic consume state, resolves `sub`, upserts `User`, issues trusted `brk_token` (v2). |
| Invalid / Mismatched State | Integration Test | 400 Bad Request / Redirect error (`INVALID_STATE`). |
| Expired State Cookie / DB (>10 min) | Integration Test | 400 Bad Request (`STATE_EXPIRED`). |
| Replayed Callback (State second attempt) | Integration Test | `updateMany` returns 0 count -> 400 Bad Request (`ALREADY_CONSUMED`). |
| Invalid ID Token Signature / Wrong Algorithm (RS256/HS256) | Unit Test | 401 Unauthorized (`INVALID_ID_TOKEN`). |
| Legacy JWT (unverified) attempt Student Claim | Integration Test | 401 Unauthorized (`OWNERSHIP_VERIFICATION_REQUIRED`). |

---

### 11. Status Blocker & Checklist TASK 03L.2B

#### Status Prasyarat & Blocker:
- **`ROBLOX_OAUTH_CLIENT_ID` dan `ROBLOX_OAUTH_CLIENT_SECRET` belum diisi** di lingkungan `.env` operator (**BLOCKED**).
- **Penambahan Model `OAuthState` ke Prisma Schema** memerlukan approval migrasi ringan sebelum TASK 03L.2B berjalan (**PENDING MIGRATION APPROVAL**).

#### Implementation Checklist TASK 03L.2B:
- [ ] Schema update: Tambahkan model `OAuthState` ke `prisma/schema.prisma` & buat migration file.
- [ ] Implementasi `src/lib/oauth.ts` (helper PKCE, Server-Side `OAuthState` atomic consume, ES256 JWKS ID Token verification).
- [ ] Update `src/lib/auth.ts` dengan session payload v2 (`isOwnershipVerified`).
- [ ] Buat Route `GET /api/auth/roblox/start/route.ts`.
- [ ] Buat Route `GET /api/auth/roblox/callback/route.ts`.
- [ ] Update `POST /api/auth/verify/route.ts` agar tidak menerbitkan sesi terverifikasi tanpa OAuth.
- [ ] Implementasi `POST /api/auth/student-claim/route.ts` dengan guard `isOwnershipVerified === true`.
- [ ] Tambahkan unit test suite untuk OAuth PKCE ES256, Server-Side State, & Session Trust V2.

---

*Dokumen spesifikasi teknis arsitektur ini telah difinalisasi untuk arsitektur V2.*
