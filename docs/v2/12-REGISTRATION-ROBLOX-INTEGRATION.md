# BARESKRIM REKRUTMEN V2 — ARCHITECTURE SPECIFICATION
## 12. Registration → Roblox Verification → Student Portal Integration Architecture

- **Dokumen:** 12-REGISTRATION-ROBLOX-INTEGRATION.md
- **Status:** DRAFT ARCHITECTURE SPECIFICATION (TASK 03K)
- **Workspace:** `D:\Dev\Projects\bareskrim-rekrutmen-v2`
- **Target DB:** `bareskrim-rekrutmen-v2-dev` (`fbaruxhukashpsvtbdic`)
- **Prinsip Utama:** Read-Only Audit & Architectural Planning Only. Tanpa perubahan kode aplikasi, schema, maupun bisnis logika ujian existing.

---

### 1. Existing System Audit

Berdasarkan audit terhadap source code aktual V2 workspace:

#### 1.1 Model Data (`prisma/schema.prisma`)
- **`Application`**: Menyimpan pendaftaran peserta (`registrationId`, `accessTokenHash`, `robloxUsername`, `robloxUsernameKey`, `discordId`, `birthDate`, `gender`, `origin`, `experience`, `motivation`, `status`, `userId`, `recruitmentPeriodId`).
  - `status`: Enum `ApplicationStatus` (`MENUNGGU_VERIFIKASI`, `DITERIMA`, `DITOLAK`).
  - `accessTokenHash`: SHA-256 hash dari raw access token 160-bit (32 karakter Base32). Raw token **TIDAK PERNAH** disimpan di DB.
  - `robloxUsernameKey`: Lowercase normalisasi untuk unique constraint per periode `@@unique([recruitmentPeriodId, robloxUsernameKey])`.
  - `userId`: Nullable FK ke model `User` (`onDelete: SetNull`). Saat pendaftaran, `userId = null` karena `robloxUsername` pada formulir adalah input teks publik yang **belum terverifikasi** oleh API Roblox.
- **`User`**: Menyimpan identitas terverifikasi dari Roblox API (`robloxId` BigInt PK, `username` Unique, `displayName`, `discordUsername`, `avatarUrl`, `policeGroupRankId`, `policeGroupRank`, `policeGroupRankNumber`, `matraBlocked`, dll).
- **`RecruitmentPeriod`**: Menyimpan periode pendaftaran (`code`, `name`, `openedAt`, `closedAt`, `isActive`).
- **`ExamPeriod`**: Menyimpan periode ujian (terpisah dari `RecruitmentPeriod`; mengontrol `isActive`, `isAttendanceOpen`, `openedAt`, `closedAt`).

#### 1.2 Authentication & Verification Existing (`/api/auth/verify` & `src/lib/auth.ts`)
- **Sistem Sesi**: Cookie HTTP-only `brk_token` berbasis JWT (HS256, `getJwtSecret()`, masa berlaku 2 jam, payload: `{ userId, robloxId }`).
- **Jalur Login Roblox Existing (`LoginForm.tsx` & `/api/auth/verify`)**:
  1. Menerima `username` Roblox dan `discordUsername`.
  2. Memeriksa `verifyLimiter` (rate limit in-memory).
  3. Cek cache `User` (TTL 15 menit).
  4. Resolusi username → Roblox User ID via Roblox API (`resolveUserByUsername`).
  5. Cek `BlacklistEntry` (kategori POLRI & PENDIDIKAN) → 403 `BLACKLISTED`.
  6. Cek `VerdictEntry` (status TIDAK_LULUS) → 403 `VERDICT_BLOCKED`.
  7. Cek keanggotaan grup wajib Republic Indonesia (ID: 14460225) → 403 `NOT_IN_REQUIRED_GROUP`.
  8. Cek matra lain (AD/AL) → 403 `MATRA_BLOCKED`.
  9. Upsert `User` ke database (dengan snapshot pangkat di grup Kepolisian).
  10. Cek pangkat minimal (Bhayangkara Satu / rank >= 224) → 403 `RANK_BLOCKED`.
  11. Tautkan `Attendance` yang belum di-link (`discordUserId` → `userId`).
  12. Terbitkan cookie `brk_token` dan kembalikan data `CasisCard`.

#### 1.3 Celah Integrasi (The Gap)
- `Application` dibuat saat pendaftaran (`/daftar`) dengan `userId = null`.
- `User` dibuat saat verifikasi Roblox (`/login` / `/api/auth/verify`).
- Belum ada jalur resmi untuk menautkan `Application.userId = User.id` berbasis kredensial pendaftaran (`registrationId` + `accessToken`).

---

### 2. Application → User Relationship & Linking Design

#### 2.1 Kapan Application Dihubungkan ke User?
`Application` dihubungkan ke `User` saat **Student Authentication & Verification Claim**:
1. Pemohon masuk ke portal peserta menggunakan `registrationId` dan `accessToken` (raw token).
2. Server memvalidasi hash token: `SHA-256(accessToken) === Application.accessTokenHash`.
3. Server memverifikasi identitas Roblox aktual pemohon via API Roblox (`/api/auth/verify` atau sub-routine internal).
4. **Aturan Pengaitan (Linking Rule):**
   - **Kesesuaian Username:** Username Roblox terverifikasi (`User.username`) secara lowercase HARUS cocok dengan `Application.robloxUsernameKey`.
   - **Status Application:** `Application.status` harus `MENUNGGU_VERIFIKASI` atau `DITERIMA`. Jika `DITOLAK`, pengaitan ditolak dengan pesan alasan penolakan.
   - **Single Claim Discipline:** `Application.userId` harus masih `null` ATAU sudah menunjuk ke `User.id` yang sama (idempotent claim).
   - **Atomisitas:** Pengaitan `Application.userId = User.id` dilakukan dalam satu transaksi Prisma (`prisma.$transaction`).

#### 2.2 Identitas Roblox Sebagai Sumber Kebenaran (Source of Truth)
- `robloxUsernameKey` di `Application` adalah klaim pemohon saat mendaftar.
- `User.robloxId` dan `User.username` dari Roblox Web API (`users.roblox.com`) adalah **satu-satunya sumber kebenaran identitas**.
- **Penanganan Perubahan Username Roblox:** Karena Roblox memperbolehkan pergantian username, pengaitan mengutamakan resolusi Roblox User ID (`robloxId`). Jika username Roblox berubah setelah pendaftaran tetapi `robloxId` terverifikasi sama, pengaitan dapat diizinkan dengan mencatat log audit perubahan username.

#### 2.3 Keamanan & Pencegahan Bypass
- **Pencegahan Bypass Exam:** `ExamAttempt` dan `Attendance` hanya mengizinkan `User` yang memiliki `Application` terhubung dengan status `DITERIMA` atau `MENUNGGU_VERIFIKASI` (sesuai kebijakan admin). Peserta tanpa `Application` valid tidak dapat mengikuti ujian.
- **Pencegahan Salah Klaim (Cross-Claim Prevention):**
  - Kredensial `accessToken` 160-bit (entropi tinggi) mencegah klaim tanpa hak.
  - Verification check memastikan `User.username` cocok dengan `robloxUsernameKey`.
- **Satu Akun Roblox per Periode:** Dibatasi oleh DB constraint `@@unique([recruitmentPeriodId, robloxUsernameKey])`. Jika user mendaftar di periode baru (misal `XLI-03`), `Application` baru akan dibuat untuk `RecruitmentPeriod` baru dan ditautkan ke `User` yang sama.

---

### 3. Proposed End-to-End Flow

```
[ Form Pendaftaran /daftar ]
           │
           ▼
[ POST /api/applications ] ──► (Generates registrationId & 160-bit accessToken)
           │                   (Stores Application with accessTokenHash, userId=null)
           ▼
[ Halaman Sukses Pendaftaran ] ──► (Tampilkan registrationId & raw accessToken SELAMBATNYA 1x)
           │
           ▼ (Peserta lanjut ke Student Login / Claim Portal)
[ POST /api/auth/student-claim ]
   Input: registrationId + raw accessToken
           │
           ├─► Validasi SHA-256(accessToken) === Application.accessTokenHash
           ├─► Cek Application.status (bila DITOLAK → Tampilkan pesan alasan)
           │
           ▼ (Lanjut ke Verifikasi Roblox)
[ Roblox API Verification ]
   Resolve Roblox ID, keanggotaan grup RI, matra, & pangkat minimal
           │
           ▼
[ Atomic Linking Transaction ]
   Upsert User (robloxId) + Set Application.userId = User.id
           │
           ▼
[ Terbitkan Cookie brk_token (JWT HTTP-Only) ]
           │
           ▼
[ Student Portal /dashboard & Access Guards (Absensi / Ujian) ]
```

---

### 4. Authentication & Security Contract

#### 4.1 Penanganan Access Token
1. **Raw Access Token:** Di-generate di server via `crypto.randomBytes(20)` (160-bit entropy, 32 char Base32). Raw token **TIDAK PERNAH** disimpan di database.
2. **Hash Storage:** Database hanya menyimpan `accessTokenHash = SHA-256(rawToken)`.
3. **No Browser Storage:** Raw token **DILARANG** disimpan di `localStorage`, `sessionStorage`, cookie non-HttpOnly, atau browser analytics. Raw token hanya berada di memory state React saat halaman sukses dirender.
4. **No URL Credentials:** Raw token **DILARANG** dikirim melalui URL query string (misal `?token=xxx`). Seluruh transmisi kredensial dilakukan melalui HTTP POST JSON request body.
5. **Rate Limiting:** Endpoint klaim/login peserta dilindungi oleh `verifyLimiter` (maksimal 5 percobaan/menit/IP).
6. **Token Loss / Recovery:** Jika peserta kehilangan Access Token, peserta dapat menghubungi panitia/admin. Admin yang terotentikasi dapat mereset token (menghasilkan token baru) via Admin Panel.

---

### 5. State Machine Transition

```
 ┌──────────────────────┐
 │ MENUNGGU_VERIFIKASI  │ ◄── [ Application Dibuat di /daftar (userId = null) ]
 └──────────┬───────────┘
            │
            ├──► (Peserta melakukan Student Claim & Verifikasi Roblox)
            │    └── Application.userId = User.id
            │
            ├──► (Admin Verifikasi) ──► DITERIMA
            │
            └──► (Admin Penolakan / Gagal Syarat) ──► DITOLAK
```

#### Aturan Status & Izin Akses:
- **`MENUNGGU_VERIFIKASI` (default)**:
  - Peserta **DAPAT** masuk ke Student Portal (`/dashboard`) untuk melihat status pendaftaran & kartu peserta.
  - Akses ujian/absensi bergantung pada kebijakan `ExamPeriod.isActive` dan konfigurasi admin.
- **`DITERIMA`**:
  - Peserta **LULUS ADMINISTRASI**.
  - Berhak penuh mengikuti absensi & ujian akademik selama periode ujian dibuka.
- **`DITOLAK`**:
  - Pendaftaran ditolak oleh admin (dengan `rejectionReason`).
  - Login klaim memberikan respons status ditolak + alasan penolakan. Akses ke ujian diblokir.

---

### 6. Endpoint Integration Matrix

| Endpoint | Tipe | Tujuan & Fungsi | Parameter Key |
|---|---|---|---|
| `POST /api/applications` | Existing (Hardened) | Menerima pendaftaran baru | `fullName`, `robloxUsername`, `discordId`, `birthDate`, `gender`, `origin`, `experience`, `motivation`, `agreement` |
| `POST /api/auth/student-claim` | **Baru (TASK 03L)** | Verifikasi kredensial pendaftaran (`registrationId` + `accessToken`), pemicu verifikasi Roblox, dan pengaitan atomis ke `User` | `registrationId`, `accessToken`, `discordUsername` |
| `POST /api/auth/verify` | Existing | Login Roblox langsung (dipertahankan untuk kompatibilitas casis/peserta yang sudah ter-link) | `username`, `discordUsername` |
| `GET /api/period/active` | Existing | Mengambil info periode pendaftaran/ujian aktif | — |
| `GET /api/student/profile` | **Baru (TASK 03L)** | Mengambil data status pendaftaran & profil siswa untuk Student Dashboard (`/dashboard`) | Authenticated via `brk_token` cookie |

---

### 7. Rencana Perubahan per File (Target TASK 03L)

1. **`src/lib/application-service.ts`**:
   - Tambah fungsi `verifyApplicationCredential(registrationId: string, rawToken: string)`: membandingkan SHA-256 hash dengan `Application.accessTokenHash`.
   - Tambah fungsi `linkApplicationToUser(applicationId: string, userId: string)`: transaksi atomis pengaitan.
2. **`src/app/api/auth/student-claim/route.ts`** (File Baru):
   - Route handler untuk login peserta berbasis Registration ID + Access Token + Verifikasi Roblox.
3. **`src/components/login/LoginForm.tsx`**:
   - Tambah tab/opsi login: "Login Registration ID + Token" vs "Login Username Roblox (Direct)".
4. **`src/app/dashboard/page.tsx` & `src/components/dashboard/*`**:
   - Update Student Portal UI untuk menampilkan status pendaftaran (`MENUNGGU_VERIFIKASI` / `DITERIMA` / `DITOLAK`) dan detail `RecruitmentPeriod`.
5. **`src/middleware.ts` / `src/lib/auth.ts`**:
   - Perluas `SessionPayload` jika diperlukan untuk menyertakan `applicationId` / `status` (opsional).

---

### 8. Dampak Migrasi Database (Migration Impact)

- **Schema Check:** Schema `prisma/schema.prisma` saat ini (15 model, 6 enum) **SUDAH MEMILIKI** seluruh kolom yang dibutuhkan:
  - `Application.userId` (FK ke `User`)
  - `Application.accessTokenHash`
  - `Application.registrationId`
  - `Application.status`
- **Kesimpulan Migrasi:** **TIDAK MEMERLUKAN MIGRATION SQL BARU**. Database baseline `20261002000000_init_v2_baseline` di Supabase V2 Dev sudah 100% mendukung arsitektur ini.

---

### 9. Test Matrix (Rencana QA TASK 03L)

| Skenario Pengujian | Jenis Test | Ekspektasi Hasil |
|---|---|---|
| Valid registrationId + valid raw accessToken | Integration Test (API & DB) | 200 OK, User ter-link, `brk_token` cookie terbit. |
| Invalid raw accessToken | Integration Test | 401 Unauthorized (`Access Token tidak valid`). |
| Application status DITOLAK | Integration Test | 403 Forbidden (`Pendaftaran Anda ditolak: [alasan]`). |
| Account Roblox username mismatch | Integration Test | 400 Bad Request (`Username Roblox tidak cocok dengan pendaftaran`). |
| Double claim oleh User lain | Integration Test | 409 Conflict (`Pendaftaran ini sudah diklaim oleh akun lain`). |
| Blacklisted Roblox User | Integration Test | 403 Forbidden (`BLACKLISTED`). |
| Rank Roblox di bawah minimal | Integration Test | 403 Forbidden (`RANK_BLOCKED`). |
| Concurrent claim request | Unit/Integration Test | Transaction isolation menjamin hanya 1 claim sukses. |
| E2E Login Student Claim UI | Playwright E2E | Form login ID+Token navigasi ke Dashboard. |

---

### 10. Risks & Open Architectural Decisions

1. **Kasus Username Roblox Berubah:**
   - Pemohon mendaftar dengan username `UserA`. Lalu mengubah username Roblox menjadi `UserB` sebelum melakukan klaim.
   - *Rekomendasi:* Resolusi Roblox API mengembalikan `robloxId`. Jika `robloxId` belum pernah ada di DB, server memeriksa history username Roblox via API Roblox. Jika terbukti ID yang sama, pengaitan diizinkan.
2. **Multi-device Session:**
   - Kredensial `registrationId` + `accessToken` dapat digunakan kembali dari perangkat lain selama `accessToken` disimpan pemohon. Setiap klaim ulang dari perangkat baru akan memverifikasi hash & menerbitkan cookie `brk_token` baru.
3. **BACKLOG QA (Dari TASK 03J):**
   - *Health Smoke Test (200/503)*: `smoke.spec.ts` meloloskan 503 jika DB tidak siap. Untuk staging/prod E2E, disarankan menambahkan test strict 200 saat DB dipastikan aktif.
   - *Visual Fidelity Screenshots*: Pengujian visual saat ini berbasis layout & responsiveness Playwright. Screenshot pixel-diff automatik disiapkan sebagai backlog QA visual.

---

### 11. Proposed Implementation Phases (TASK 03L dan Seterusnya)

- **PHASE 1 (TASK 03L.1):** Service & Helper Layer (`application-service.ts` hash verification & atomic linking helper).
- **PHASE 2 (TASK 03L.2):** API Endpoint `POST /api/auth/student-claim` (server-side authentication & Roblox validation).
- **PHASE 3 (TASK 03L.3):** Student Login UI Enhancement (`LoginForm.tsx` support ID + Token login).
- **PHASE 4 (TASK 03L.4):** Student Portal & Status Dashboard (`/dashboard` integration).
- **PHASE 5 (TASK 03L.5):** End-to-End Verification & Playwright E2E Tests.

---

*Dokumen arsitektur ini disusun sebagai acuan resmi implementasi TASK 03L.*
