# 17 — V2 IMPLEMENTATION ROADMAP

## Status milestone — 4 Oktober 2026

**TASK 03L.2D — Student Claim: SELESAI (IMPLEMENTED) untuk API, Service, & UI Form.** TASK 03L.2D memverifikasi implementasi, konkurensi PostgreSQL, dan UI Form; TASK 03L.2D.5 menyinkronkan dokumentasi dan menutup milestone ini. **Milestone berikutnya adalah TASK 03L.2E — ApplicationStatus Guard.**

| Bukti | Hasil dan batas verifikasi |
|---|---|
| Otomatis: unit/integration | Full Vitest **336/336 PASS**, targeted regression **90/90 PASS**, StudentClaimForm UI **9/9 PASS**, TypeScript typecheck **PASS** |
| PostgreSQL Concurrency | **6/6 Reported PASS** pada cluster disposable PostgreSQL 18.6 (Run ID `78a047f1`, port 55439, PID 26468; 3 koneksi independen `CONN1`, `CONN2`, `VERIFIER`). Fixture sintetis dibersihkan total (`Application`: 0, `User`: 0, `RecruitmentPeriod`: 0); cluster dihentikan dan folder disposable dihapus. Telemetry raw `pg_locks` tidak dipertahankan (`EVIDENCE NOT RETAINED`) |
| HTTP lokal | `GET /login` **200**; `GET /dashboard` tanpa sesi **307 ke /login**; `GET /api/applications/claim` **405** (tidak memutasi DB) |
| Student Claim Semantics | Menghubungkan `Application.userId = user.id` via `registrationId` + raw `accessToken` (SHA-256 via `hashAccessToken` & `timingSafeEqual`). Access token bersemantik *one-time disclosure*, bukan *one-time redemption*. Klaim berulang dengan token valid bersifat **idempotent** (`isAlreadyLinked: true`, `verifiedAt` tidak ditimpa). Claim **TIDAK** mengubah `ApplicationStatus` atau memberikan akses ujian/absensi |
| Desktop & Mobile Layout | **PASS** untuk bagian yang ditinjau operator via screenshot browser nyata (Roblox Login & Student Claim Form, layout mobile sampai tombol submit utuh tanpa overflow horizontal visual) |
| Open Verification Items | Manual real-claim E2E dengan akun nyata, keyboard/focus interaction lengkap, seluruh variasi state visual dashboard, dan visual recheck setelah patch CSS `TASK 03L.2D.4` **belum dikonfirmasi** |
| Rate Limiter Note | Limiter Student Claim (`rate-limit.ts`) masih berbasis in-memory LRU. Memerlukan strategi shared rate limiting (Redis/DB/Gateway) sebelum deployment multi-instance produksi |

**Batas milestone:** dashboard menampilkan identitas user dan form Student Claim. Trusted session tetap mensyaratkan `authVersion: 2`, `authMethod: ROBLOX_OIDC`, dan `isOwnershipVerified: true`. Sesi tidak valid atau user tidak ditemukan diarahkan ke `/login`. Student Claim tidak menyimpulkan pendaftaran diterima, dan dashboard tidak membuka rute ujian atau absensi.

**OAuth belum dinyatakan production-ready. Dua isu tetap terbuka:**

- **A — Intermittent `TOKEN_EXCHANGE_NETWORK_FAILURE` / `UND_ERR_CONNECT_TIMEOUT`.** Pernah terjadi walaupun ada token exchange nyata sukses HTTP 200; root cause spesifik **UNCONFIRMED**.
- **B — ID token verification gagal sekitar 5015 ms.** Kemungkinan berkaitan dengan JWKS masih berupa hipotesis; root cause **UNCONFIRMED**. Event ini terpisah dari callback sukses; correlation ID berbeda tidak digabung sebagai satu percobaan.

**Blocker akses peserta:** ApplicationStatus Guard belum tersedia dan ditetapkan sebagai **TASK 03L.2E** (wajib selesai sebelum akses ujian/absensi dibuka ke peserta sungguhan). Menyembunyikan tombol bukan pengamanan endpoint. Redesign Admin, CMS, dan gallery belum dinyatakan selesai.

Dokumen ini mendefinisikan urutan implementasi V2 berdasarkan **dependency-driven ordering**. Prinsip utama: security guard harus selesai sebelum fitur yang dilindunginya dibuka. Setiap tahap memiliki kriteria STOP yang jelas — tidak lanjut ke tahap berikutnya sebelum acceptance criteria terpenuhi dan approval (jika diperlukan) diperoleh.

---

## Ringkasan Tahap

| Tahap | Nama | Dependensi | Approval |
|-------|------|------------|----------|
| 1 | UI Design System Foundation | — | Tidak perlu |
| 2 | **Login UI & Dashboard Foundation — TASK 03L.2C, SELESAI** | Token scoped Casis; jalur sukses OAuth dan trusted browser session PASS | Desktop manual selesai; mobile otomatis terbatas |
| 3 | **Student Claim API — TASK 03L.2D, SELESAI (IMPLEMENTED)** | 2 | Review alur claim; claim tidak mengubah ApplicationStatus |
| 4 | ApplicationStatus Authorization Guard | 3 | Operator (konfirmasi guard behavior) |
| 5 | Security Hardening (fail-closed ADMIN_KEY) | Operator set `ADMIN_KEY` | Operator (konfirmasi env production) |
| 6 | Roblox Profile & Group Sync | 2 | Tidak perlu |
| 7 | Blacklist Verification (Casis Self-Check) | 4, 6 | Operator (messaging) |
| 8 | Portal Casis penuh — belum selesai | 1, 3, 4, 6, 7 | Visual review per route |
| 9 | Admin Panel UI Restructuring | 1, **5 (Security Hardening MANDATORY)** | Visual review operator |
| 10 | CMS Internal | 9, 2 | Schema review sebelum migration |
| 11 | Public Website Consolidation & Gallery | 8, 9, 10 | Final visual review |
| 12 | Regression, Integration & E2E Testing | Semua | Operator sign-off |

---

## Tahap 1 — UI Design System Foundation

**Status:** konsolidasi token/primitif lintas area masih rencana. TASK 03L.2C memakai fondasi lokal `casis.css`/`.casis-root` sesuai scope yang disetujui; selesainya Tahap 2 tidak berarti `tokens.css` dan `system.css` bersama sudah selesai.

**Tujuan:** Ekstrak shared design tokens dan primitif dari referensi HTML tanpa mengubah tampilan route manapun secara visual.

**Scope:**
- Buat `src/styles/tokens.css` — nilai kanonik (warna, spacing, tipografi, radius, shadow) dari file referensi HTML
- Buat `src/styles/system.css` — shared primitif (button, card, header, form) di-scope di bawah `.design-root`, `.admin-root`, `.student-root`
- Belum ada penghapusan Tailwind di tahap ini

| Aspek | Detail |
|-------|--------|
| **File** | `src/styles/tokens.css` (baru), `src/styles/system.css` (baru) |
| **Dependensi** | Tidak ada |
| **Risiko** | Konflik CSS specificity dengan class Tailwind yang sudah ada |
| **Mitigasi** | Scope semua primitif di bawah root class; gunakan CSS layer jika diperlukan |
| **Acceptance Criteria** | Landing + daftar tidak berubah visual (screenshot comparison), lint/typecheck/test PASS, tokens dapat di-import tanpa konflik |
| **Testing** | Perbandingan screenshot visual sebelum/sesudah dan full suite saat implementasi. Baseline terbaru setelah TASK 03L.2C: **259/259 PASS** |
| **STOP** | Setelah tokens terverifikasi berfungsi tanpa side effect |
| **Approval** | Tidak diperlukan |

---

## Tahap 2 — Login UI & Dashboard Foundation (TASK 03L.2C) — SELESAI

**Tujuan tercapai:** login Roblox V2 tersedia tanpa ketergantungan periode, dan callback sukses memiliki tujuan `/dashboard` yang tersedia serta memeriksa trusted session di server.

**Implementasi:**
- Route login dipindah dari `(app)` ke `(casis)`, tanpa duplikasi `/login`.
- `CasisShell`, `RobloxLoginPanel`, dan `casis.css` terisolasi menjaga identitas dark editorial.
- Tombol **MASUK DENGAN ROBLOX** memakai anchor eksplisit ke `/api/auth/roblox/start`; tidak ada OAuth/prefetch otomatis.
- Error OAuth dipetakan melalui allowlist; input asing/berulang generik. Halaman error tidak menghapus sesi valid.
- `/dashboard` memakai `getSessionUser()` server-side dan render dinamis; sesi tidak valid atau user tidak ditemukan diarahkan ke `/login`. Kegagalan pembacaan sesi tidak menampilkan konten pribadi.
- Data tampilan hanya displayName dan username. Tidak menebak status Application, grup, pangkat, atau blacklist; tidak memulai ujian/absensi.
- `LoginForm.tsx` dipertahankan sebagai file legacy tidak aktif, bukan fallback.
- OAuth Start/Callback, JWT, cookie, PKCE, middleware, database, dan API ujian/absensi tidak diubah.

| Aspek | Bukti / status |
|---|---|
| **File** | `src/app/(casis)/layout.tsx`, `login/page.tsx`, `dashboard/page.tsx`; `CasisShell.tsx`, `RobloxLoginPanel.tsx`, `oauth-login-errors.ts`, `casis.css`, dan tiga file test |
| **Dependensi** | Jalur sukses real OAuth dan trusted browser session sudah diverifikasi; token visual lokal Casis tersedia. Konsolidasi global Tahap 1 terpisah |
| **Testing** | Login 7 + allowlist 19 + dashboard 13 PASS; regression OAuth/auth 136 PASS; full suite **259/259 PASS**, typecheck **PASS** (targeted merupakan subset full suite) |
| **HTTP** | `/login` 200; `/dashboard` tanpa sesi 307 ke `/login` |
| **Browser nyata** | Operator mengonfirmasi dashboard dengan trusted session yang sudah ada, tanpa OAuth baru |
| **Visual** | Desktop login/dashboard ditinjau manual operator. Mobile otomatis pada ukuran yang diuji; tidak menyatakan UI final untuk seluruh layar. Font fallback pada pemeriksaan otomatis |
| **Penutupan** | TASK 03L.2C implementasi selesai; 03L.2C.1 runtime PASS; 03L.2C.2 sinkronisasi dokumentasi selesai |
| **Batas** | Bukan penutupan isu OAuth A/B, izin pembukaan ujian/absensi, atau klaim production-ready |

---

## Tahap 3 — Student Claim API (TASK 03L.2D) — SELESAI (IMPLEMENTED)

**Tujuan tercapai:** User ter-autentikasi dapat menghubungkan data pendaftaran (`Application`) menggunakan Registration ID + Access Token dengan verifikasi kredensial aman, race-safe, dan idempotent.

**Implementasi:**
- `POST /api/applications/claim` endpoint terpasang dengan rate limiting (`rate-limit.ts`).
- Verifikasi raw `accessToken` via `hashAccessToken` (SHA-256) & `crypto.timingSafeEqual` (`verifyAccessTokenCredential`). Access token bersemantik *one-time disclosure*, bukan *one-time redemption*. Raw token TIDAK PERNAH disimpan dalam bentuk plaintext di DB atau dicetak di log.
- Integrasi `linkApplicationToUser` di service layer menautkan `userId = user.id` dan `verifiedAt = now()` tanpa mengubah `ApplicationStatus` menjadi `DITERIMA` atau membuka rute ujian/absensi.
- Klaim berulang oleh pemilik sah bersifat **idempotent** (`isAlreadyLinked: true`, `verifiedAt` tidak ditimpa).
- Form UI `StudentClaimForm.tsx` terpasang di `/dashboard` dengan styling dark editorial V2 dan kontras border input yang diperjelas (`TASK 03L.2D.4`).

| Aspek | Detail / Status |
|-------|--------|
| **File** | `src/app/api/applications/claim/route.ts`, `src/lib/student-claim-service.ts`, `src/components/casis/StudentClaimForm.tsx`, `src/styles/casis.css` |
| **Dependensi** | Tahap 2 (OAuth login berfungsi) |
| **Konkurensi DB** | 6/6 reported PASS pada PostgreSQL 18.6 disposable cluster (`CONN1`, `CONN2`, `VERIFIER` independen); raw lock telemetry `EVIDENCE NOT RETAINED`. Fixture sintetis dibersihkan total |
| **Testing** | Full Vitest **336/336 PASS**, targeted regression **90/90 PASS**, StudentClaimForm UI **9/9 PASS**, TypeScript typecheck **PASS** |
| **Pekerjaan Terbuka** | Manual real-claim E2E, keyboard/focus interaction lengkap, seluruh variasi state visual dashboard, dan visual recheck setelah patch CSS `TASK 03L.2D.4` **belum dikonfirmasi** |
| **Catatan Limiter** | Rate limiter masih in-memory LRU. Butuh shared rate limiter (Redis/DB/Gateway) sebelum multi-instance produksi |
| **Milestone Berikutnya** | **TASK 03L.2E — ApplicationStatus Authorization Guard** (blocker sebelum akses ujian/absensi dibuka ke peserta sungguhan) |

---

## Tahap 4 — ApplicationStatus Authorization Guard

**Status: BELUM TERSEDIA; blocker sebelum akses ujian/absensi dibuka.** Dashboard dasar menerima pengguna trusted, termasuk yang pendaftarannya belum diterima. Itu tidak memberikan hak peserta dan tidak menggantikan pemeriksaan pada endpoint ujian/absensi.

**Tujuan:** Enforce pengecekan status `DITERIMA` sebelum akses ujian/absensi.

**Scope:**
- Guard di `exam-service.ts` `startExamSession`
- Guard di route `attendance/submit`
- Pesan rejection yang jelas per status

| Aspek | Detail |
|-------|--------|
| **File** | `exam-service.ts`, route attendance, middleware/guard baru |
| **Dependensi** | Tahap 3 (Student Claim — agar Application bisa terhubung ke user) |
| **Risiko** | Memblokir test user yang belum melakukan claim |
| **Mitigasi** | Dokumentasi langkah claim untuk test user; seed data test |
| **Acceptance Criteria** | User tanpa status `DITERIMA` mendapat rejection yang jelas, guard existing (rank/blacklist/matra) tetap berfungsi dan tidak terganggu |
| **Testing** | Unit test untuk setiap kombinasi guard (DITERIMA + rank OK, DITERIMA + blacklisted, PENDING + rank OK, dst.) |
| **STOP** | Setelah semua guard terverifikasi |
| **Approval** | Operator konfirmasi guard behavior untuk setiap `ApplicationStatus` |

---

## Tahap 5 — Security Hardening

**Tujuan:** Hapus `ADMIN_KEY_FALLBACK` (`"AdminBareskrim2026"`), hardening admin auth menjadi fail-closed.

**Scope:**
- `constants.ts` — fungsi `getAdminKey()` mengikuti pola fail-closed `getJwtSecret` (TASK 03L.2B.2). Throw error jika `ADMIN_KEY` env var tidak di-set.
- Hapus penyimpanan plaintext `sessionStorage.admin_key` di browser window pada `AdminPanel.tsx` (gantikan murni dengan cookie `brk_admin_verified`).

> **PERINGATAN KEAMANAN:** Tahap ini WAJIB SELESAI SEBELUM Tahap 9 (Admin Panel UI Restructuring) dimulai. Urutan wajib:
> 1. Operator set `ADMIN_KEY` di semua environment (V2 Dev & Production)
> 2. Verifikasi env var terbaca dengan benar
> 3. Deploy kode hardening (fail-closed `getAdminKey`)
> 4. Test login admin di setiap environment

| Aspek | Detail |
|-------|--------|
| **File** | `constants.ts`, test file baru |
| **Dependensi** | Operator harus set `ADMIN_KEY` di semua environment terlebih dahulu |
| **Risiko** | Admin lockout jika `ADMIN_KEY` belum di-set |
| **Mitigasi** | Urutan deployment ketat (env dulu, kode kemudian); error message deskriptif tanpa expose nilai |
| **Acceptance Criteria** | `getAdminKey()` throw tanpa env var, error tidak expose nilai key, admin login tetap berfungsi dengan key yang valid |
| **Testing** | Regression test serupa `jwt-secret-hardening.test.ts` |
| **STOP** | Setelah verifikasi di semua environment |
| **Approval** | Operator konfirmasi `ADMIN_KEY` sudah di-set di production env |

---

## Tahap 6 — Roblox Profile & Group Sync

**Tujuan:** Tampilkan informasi profil Roblox di Portal Casis, sinkronisasi data group/rank.

**Scope:**
- API endpoint profil (read-only)
- Komponen dashboard menampilkan avatar, username, group, rank
- Mekanisme sync menggunakan `getUserGroups` / `getAvatarHeadshot` yang sudah ada

| Aspek | Detail |
|-------|--------|
| **File** | API route profil baru, komponen dashboard profil |
| **Dependensi** | Tahap 2 (OAuth login) |
| **Risiko** | Roblox API rate limiting, cache stale |
| **Mitigasi** | Cache dengan TTL wajar, tampilkan timestamp sync terakhir, graceful degradation jika API gagal |
| **Acceptance Criteria** | Profil menampilkan data terverifikasi, rank ditampilkan sebagai informasi, timestamp sync terakhir terlihat |
| **Testing** | Unit test dengan mocked Roblox API |
| **STOP** | Setelah tampilan profil terverifikasi |
| **Approval** | Tidak diperlukan |

---

## Tahap 7 — Blacklist Verification (Casis Self-Check)

**Tujuan:** Izinkan casis mengecek status blacklist sendiri di Portal.

**Scope:**
- API endpoint read-only menggunakan `robloxId` dari trusted session
- Komponen UI dengan 3 state: `clear` / `needs-verification` / `blacklisted`
- Fail-closed: jika Discord API gagal, JANGAN asumsikan aman

| Aspek | Detail |
|-------|--------|
| **File** | API route blacklist-check, komponen UI status |
| **Dependensi** | Tahap 6 (data profil), Tahap 4 (authorization guard) |
| **Risiko** | Discord API failure |
| **Mitigasi** | Fail-closed — API failure menghasilkan state `needs-verification`, bukan `clear` |
| **Acceptance Criteria** | Konsisten dengan `exam-service` `isBlockedByAdminLists`, gunakan `robloxId` (bukan username) untuk lookup, tidak ada akses ke data user lain |
| **Testing** | Unit test + edge cases (API failure, tidak ada blacklist entry, username mismatch) |
| **STOP** | Setelah verifikasi semua state |
| **Approval** | Operator konfirmasi messaging untuk setiap state |

---

## Tahap 8 — Portal Casis Penuh — BELUM SELESAI

Dashboard dasar `/dashboard` selesai di TASK 03L.2C. Tahap 8 mencakup status Application yang benar, profil/grup, blacklist, navigasi fitur berizin, dan migrasi route peserta; seluruhnya tidak dianggap selesai oleh fondasi.

**Tujuan:** Ganti legacy Tailwind chrome dengan desain referensi `student.html` untuk semua route casis.

**Scope:**
- Route: `/absen`, `/hasil`, `/ujian`, `/review/[id]`, `/tolak`
- Komponen baru: `student-header` + footer
- Section status per referensi `student.html`
- `ApplicationStatus` ditampilkan dengan benar

| Aspek | Detail |
|-------|--------|
| **File** | Semua page di route casis, komponen header/footer baru |
| **Dependensi** | Tahap 1 (tokens), Tahap 3 (Student Claim, 03L.2D), Tahap 4 (guard), Tahap 6 (profil), Tahap 7 (blacklist) |
| **Risiko** | Scope besar — banyak komponen perlu restyle |
| **Mitigasi** | Kerjakan per-route, verifikasi tiap route sebelum lanjut |
| **Acceptance Criteria** | Konsistensi visual dengan referensi, semua fungsionalitas existing tetap berjalan, `ApplicationStatus` ditampilkan dengan benar |
| **Testing** | Verifikasi visual per route + test fungsional existing |
| **STOP** | Setelah setiap route terverifikasi |
| **Approval** | Visual review per route |

---

## Tahap 9 — Admin Panel UI Restructuring

**Tujuan:** Restyle admin panel mengikuti referensi `admin.html`.

**Scope:**
- `system-header`, `admin-nav`
- Mapping 8 tab referensi ke fitur existing (26 API routes backend dipertahankan)
- Login admin restyle 2 tahap (menghilangkan `sessionStorage` plaintext admin key)
- `AdminPanel.tsx` (1816 baris) — refactor bertahap

| Aspek | Detail |
|-------|--------|
| **File** | `AdminPanel.tsx`, komponen admin baru, halaman login admin |
| **Dependensi** | Tahap 1 (tokens), **Tahap 5 MANDATORY** (Security Hardening fail-closed `ADMIN_KEY` & penghapusan `sessionStorage` plaintext key) |
| **Risiko** | `AdminPanel.tsx` 1816 baris — refactor kompleks |
| **Mitigasi** | Refactor bertahap per tab; verifikasi setiap tab sebelum lanjut |
| **Acceptance Criteria** | Semua 26 admin API route tetap callable, semua fitur tab preserved (checklist dari doc 14 §7), visual sesuai `admin.html` |
| **Testing** | Manual admin flow walkthrough + test existing |
| **STOP** | Setelah semua tab terverifikasi |
| **Approval** | Visual review oleh operator |

---

## Tahap 10 — CMS Internal

**Tujuan:** Admin dapat mengelola konten website publik tanpa perubahan kode.

**Scope:**
- Model DB baru: CMS content, gallery
- Tab admin UI untuk manajemen konten
- API endpoint CRUD
- Rendering konten di halaman publik
- `RecruitmentPeriod` sebagai SSOT untuk status pendaftaran

| Aspek | Detail |
|-------|--------|
| **File** | Schema Prisma (model baru), API routes CMS, komponen admin CMS, update halaman publik |
| **Dependensi** | Tahap 9 (admin UI), Tahap 2 (website publik stabil) |
| **Risiko** | Perubahan schema, kompleksitas migration |
| **Mitigasi** | Review schema sebelum migration; migration reversible; test di staging dulu |
| **Acceptance Criteria** | Hero/title/CTA dapat diedit, workflow draft/published berfungsi, preview tersedia, audit log tercatat, `RecruitmentPeriod` sebagai SSOT |
| **Testing** | CRUD test + verifikasi visual |
| **STOP** | Setelah content management terverifikasi |
| **Approval** | Schema review sebelum migration dijalankan |

---

## Tahap 11 — Public Website Consolidation & Gallery

**Tujuan:** Halaman `/galeri`, bersihkan legacy Tailwind dari semua route aktif.

**Scope:**
- Halaman gallery dengan konten CMS-managed
- Hapus komponen legacy dari semua route: `Navbar`, `Footer`, `MobileCTA`, `BackToTop`, `ThemeToggle`
- Hapus "LOGIN ADMIN" dari `DesignFooter`

| Aspek | Detail |
|-------|--------|
| **File** | Halaman galeri baru, semua route aktif, hapus komponen legacy |
| **Dependensi** | Tahap 8 (student UI), Tahap 9 (admin UI), Tahap 10 (CMS) |
| **Risiko** | Referensi Tailwind class yang tersisa |
| **Mitigasi** | Grep menyeluruh untuk class legacy (glass, blur, rounded legacy pattern) |
| **Acceptance Criteria** | Semua route konsisten secara visual, tidak ada glass/blur/rounded legacy, bundle CSS berkurang |
| **Testing** | Full visual audit, grep untuk class legacy |
| **STOP** | Setelah semua route terverifikasi |
| **Approval** | Final visual review |

---

## Tahap 12 — Regression, Integration & E2E Testing

**Tujuan:** Coverage test komprehensif untuk semua perubahan V2.

**Scope:**
- Playwright E2E untuk critical flow: OAuth → dashboard → exam
- Integration test untuk CMS
- Security regression test
- Full vitest suite

| Aspek | Detail |
|-------|--------|
| **File** | Test files baru (Playwright + vitest) |
| **Dependensi** | Semua tahap sebelumnya |
| **Risiko** | E2E test flaky dengan real OAuth |
| **Mitigasi** | Mock OAuth provider untuk E2E; test real OAuth secara terpisah |
| **Acceptance Criteria** | Semua critical path terverifikasi, tidak ada regresi |
| **Testing** | Playwright + vitest full suite |
| **STOP** | Setelah semua test pass |
| **Approval** | Operator sign-off sebelum deployment production |

---

## Dependency Graph

Diagram memetakan target konsolidasi penuh. Tahap 2 sudah diselesaikan dengan token lokal Casis sesuai approval; tidak menunggu atau menandai selesai ekstraksi token global Tahap 1. Pekerjaan lanjutan dimulai dari Student Claim (03L.2D) dan guard sebelum fitur peserta dibuka.

```
Tahap 1 (Design System Foundation)
├── Tahap 2 (Login UI & Dashboard Foundation, 03L.2C — selesai dengan token scoped Casis)
│   ├── Tahap 3 (Student Claim API, 03L.2D — planned)
│   │   └── Tahap 4 (Authorization Guard)
│   │       └── Tahap 7 (Blacklist Verification) ←── juga butuh Tahap 6
│   └── Tahap 6 (Roblox Profile & Group Sync)
│       └── Tahap 7 (Blacklist Verification)
├── Tahap 8 (Portal Casis penuh) ←── butuh Tahap 1, 3, 4, 6, 7
└── Tahap 9 (Admin Panel UI) ←── butuh Tahap 1, 5

Tahap 5 (Security Hardening) ←── independen, tapi harus selesai sebelum Tahap 9
└── Tahap 9 (Admin Panel UI)
    └── Tahap 10 (CMS Internal)

Tahap 11 (Public Website Consolidation) ←── butuh Tahap 8, 9, 10
└── Tahap 12 (Regression & E2E Testing) ←── butuh semua
```

### Critical Path

```
1 → 2 → 3 → 4 → 7 → 8 → 11 → 12
```

Ini adalah jalur terpanjang yang menentukan waktu minimum penyelesaian keseluruhan V2.

### Parallel Track

| Track | Urutan | Catatan |
|-------|--------|---------|
| **Critical Path** | 1 → 2 → 3 → 4 → 7 → 8 → 11 → 12 | Jalur utama, menentukan timeline |
| **Track A** | 5 → 9 → 10 | Dapat berjalan paralel setelah Tahap 1 selesai (Tahap 5 independen) |
| **Track B** | 6 (setelah Tahap 2) | Profil Roblox, bisa mulai segera setelah OAuth login berfungsi |

### Titik Konvergensi

- **Tahap 7** membutuhkan hasil dari critical path (Tahap 4) DAN track B (Tahap 6)
- **Tahap 9** membutuhkan Tahap 1 (critical path) DAN Tahap 5 (track A)
- **Tahap 11** membutuhkan Tahap 8, 9, 10 — semua track harus konvergen di sini
- **Tahap 12** adalah gate akhir sebelum production

---

## Open Decisions

Keputusan berikut memerlukan input operator sebelum atau selama implementasi.

### OD-1: Timing Set ADMIN_KEY di Production

| Opsi | Konsekuensi |
|------|-------------|
| Set sekarang (sebelum Tahap 5 dimulai) | Aman — kode hardening bisa langsung di-deploy tanpa risiko lockout |
| Set bersamaan deploy Tahap 5 | Risiko window lockout jika deployment kode lebih cepat dari env var propagation |

**Diperlukan sebelum:** Tahap 5

### OD-2: Akses Dashboard Dasar Diputuskan; Guard Peserta Masih Terbuka

**Keputusan TASK 03L.2C:** setiap pengguna dengan trusted session valid dan record User yang tersedia dapat melihat dashboard dasar, termasuk pendaftar yang menunggu verifikasi. Dashboard belum membaca relasi Application dan tidak menampilkan status administratif sintetis.

| Kondisi | Dashboard dasar saat ini | Ketentuan tahap guard peserta |
|---|---|---|
| Belum linked / `MENUNGGU_VERIFIKASI` | Boleh dengan trusted session; pesan pendaftaran netral | Tidak memperoleh hak ujian/absensi; enforcement endpoint belum tersedia |
| `DITERIMA` | Boleh dengan trusted session; tidak menebak status | Tetap memerlukan guard periode, rank, blacklist, absensi, dan syarat lain yang relevan |
| `DITOLAK` | Guard fondasi hanya memeriksa trusted session | Tidak memperoleh hak peserta; finalisasi pesan penolakan pada tahap guard |
| Sesi invalid / user tidak ditemukan | Redirect `/login` | Ditolak |

`PENDING` bukan nama enum ApplicationStatus; gunakan `MENUNGGU_VERIFIKASI`. Status blacklist adalah domain terpisah, bukan nilai ApplicationStatus.

**Masih diperlukan sebelum Tahap 4 selesai:** approval perilaku enforcement dan pesan per status. Menyembunyikan tindakan di dashboard tidak membuktikan endpoint legacy sudah terlindungi.

### OD-3: Blacklist Check — Messaging untuk State `needs-verification`

| Opsi | Konsekuensi |
|------|-------------|
| Tampilkan "Status sedang diverifikasi, silakan coba lagi nanti" | User tidak panik, tapi mungkin menunggu tanpa aksi |
| Tampilkan "Sistem tidak dapat memverifikasi status Anda, hubungi admin" | Jelas, tapi menambah beban support |

**Diperlukan sebelum:** Tahap 7

### OD-4: CMS Schema — Tabel Terpisah atau JSON Column

| Opsi | Konsekuensi |
|------|-------------|
| Tabel terpisah (CMSContent, CMSGallery) | Lebih relasional, queryable, migrasi lebih kompleks |
| JSON column di tabel existing | Lebih simpel, kurang queryable, risiko data drift |

**Diperlukan sebelum:** Tahap 10

### OD-5: LoginForm.tsx — DIPUTUSKAN pada TASK 03L.2C

Halaman aktif memakai `RobloxLoginPanel` dalam route group `(casis)`. `LoginForm.tsx` dan komponen legacy terkait dipertahankan sebagai file tidak aktif untuk membatasi perubahan.

**Tidak ada fallback login legacy.** `/api/auth/verify` tetap tombstone 410; kegagalan OAuth tidak boleh menghidupkan kembali jalur tersebut. Cleanup file legacy memerlukan scope dan approval terpisah.

### OD-6: Timeline Penghapusan Tailwind

| Opsi | Konsekuensi |
|------|-------------|
| Hapus bertahap per tahap (mulai Tahap 8) | Lebih aman, tapi Tailwind masih di bundle lebih lama |
| Hapus sekaligus di Tahap 11 | Satu kali bersih, tapi risiko regresi lebih besar |

**Diperlukan sebelum:** Tahap 8

### OD-7: Playwright E2E — Mock OAuth atau Real OAuth

| Opsi | Konsekuensi |
|------|-------------|
| Mock OAuth provider | Test stabil, cepat, tapi tidak menguji integrasi real Roblox |
| Real OAuth (dengan test account Roblox) | Test lebih akurat, tapi flaky dan butuh credential management |
| Keduanya (mock untuk CI, real untuk staging) | Coverage terbaik, tapi maintenance dua set test |

**Diperlukan sebelum:** Tahap 12

---

## Checklist Penutupan Fondasi & Pekerjaan Berikutnya

- [x] TASK 03L.2C: Login UI & Dashboard Foundation selesai.
- [x] Jalur sukses real OAuth HTTP 200 dan trusted browser session terverifikasi; bukan sign-off OAuth production-ready.
- [x] Full Vitest **259/259 PASS** dan TypeScript typecheck **PASS** pada verifikasi implementasi.
- [x] TASK 03L.2C.1: login HTTP 200, dashboard tanpa sesi 307 ke login; tidak ada duplikasi route.
- [x] Operator meninjau desktop login/dashboard dan mengonfirmasi dashboard dengan sesi browser nyata yang sudah ada, tanpa OAuth baru.
- [x] Mobile otomatis diperiksa pada ukuran terbatas; font fallback dicatat.
- [x] OD-5: LoginForm tidak aktif dan bukan fallback.
- [x] TASK 03L.2C.2: empat dokumen diselaraskan; Student Claim dipetakan ke **TASK 03L.2D**.
- [ ] Investigasi isu A: intermittent `TOKEN_EXCHANGE_NETWORK_FAILURE` / `UND_ERR_CONNECT_TIMEOUT`; root cause **UNCONFIRMED**.
- [ ] Investigasi isu B: ID token verification sekitar **5015 ms**; kemungkinan JWKS **UNCONFIRMED**.
- [ ] Review manual mobile dan verifikasi font/perangkat lebih luas; jangan menyatakan semua ukuran layar final.
- [ ] Student Claim **TASK 03L.2D**.
- [ ] ApplicationStatus Guard sebelum membuka akses ujian/absensi.
- [ ] Konsolidasi token/primitif global, profil/grup, blacklist, dan portal Casis penuh.
- [ ] Security hardening Admin dan redesign Admin; CMS dan gallery.
- [ ] Regression/E2E seluruh fitur serta sign-off production terpisah.

V1 Production tetap FROZEN. Penutupan milestone fondasi tidak mengizinkan deployment, perubahan database, atau pembukaan akses peserta.
