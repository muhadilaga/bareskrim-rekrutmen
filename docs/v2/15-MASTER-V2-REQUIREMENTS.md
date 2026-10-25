# 15 — MASTER REQUIREMENTS DOKUMEN V2

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

**Bareskrim Recruitment Web Application — V2**
**Status:** Living Document
**Konsolidasi dari:** TASK 03L.3A, TASK 03L.3A.1, dan seluruh keputusan arsitektur V2

---

## A. Tujuan Dokumen

Dokumen ini mengkonsolidasikan **seluruh requirement V2** yang tersebar di TASK 03L.3A (Website Publik + Portal Casis + Admin Panel) dan TASK 03L.3A.1 (CMS Internal, Roblox Profile Sync, Blacklist Verification) ke dalam satu sumber kebenaran tunggal.

Setiap fitur, keputusan desain, dan open decision tercatat di sini. Dokumen task individual tetap menjadi referensi detail implementasi, namun **dokumen ini adalah master** untuk scope dan prioritas.

---

## B. Tiga Area Utama Aplikasi

### B.1 — Website Publik

Halaman-halaman yang dapat diakses **tanpa autentikasi**. Pengunjung umum bisa menjelajah seluruh konten publik.

| Halaman | Deskripsi |
|---|---|
| **Beranda** | Hero section, informasi rekrutmen aktif, CTA pendaftaran |
| **Rekrutmen** | Detail periode rekrutmen, persyaratan, timeline |
| **Tentang** | Profil organisasi Bareskrim |
| **Arsip** | Arsip periode rekrutmen sebelumnya |
| **Galeri** | Foto/media kegiatan rekrutmen |
| **Pendaftaran** | Form pendaftaran calon siswa (bisa diakses tanpa login, tapi submit memerlukan data valid) |

**Prinsip:** browsing tidak memerlukan auth. Konten publik dikelola via CMS Internal (lihat Bagian D).

---

### B.2 — Portal Calon Siswa (Casis)

Portal khusus calon siswa setelah login via Roblox OAuth.

| Fitur | Deskripsi | Status |
|---|---|---|
| **Login Roblox OAuth** | OIDC flow dan trusted session v2 | **Implemented; jalur sukses dan trusted browser session PASS**. UI aktif TASK 03L.2C; isu A/B tetap terbuka |
| **Student Claim** | Menghubungkan akun Roblox dengan pendaftaran (`registrationId` + raw `accessToken` di-verify via `hashAccessToken` SHA-256 & `timingSafeEqual`) — TASK 03L.2D | **Implemented — TASK 03L.2D (SELESAI)**; semantik *one-time disclosure*, klaim berulang *idempotent*. `linkApplicationToUser` **tidak** mengubah `ApplicationStatus` ke `DITERIMA` |
| **Dashboard dasar** | `/dashboard`, guard `getSessionUser()` server-side, displayName dan username | **Implemented — TASK 03L.2C**; trusted browser session nyata PASS |
| **Dashboard peserta lanjutan** | Status Application yang benar dan navigasi fitur berizin | Planned; Student Claim dan ApplicationStatus Guard belum selesai |
| **Profil Roblox** | Username, displayName, avatar, robloxId | Planned UI (lib `roblox.ts` preserved) |
| **Group & Rank** | Keanggotaan POLRI group, rank, waktu sync terakhir | Planned UI (lib `roblox.ts` preserved) |
| **Status Pendaftaran** | State `ApplicationStatus`: belum linked, `MENUNGGU_VERIFIKASI`, `DITERIMA`, `DITOLAK` | Enum & Schema Ready (Guard rute ujian/absen belum dipasang) |
| **Blacklist Check** | Self-check status blacklist (hanya data sendiri, hasil: `BERSIH`, `VERIFIKASI_PETUGAS`, `TERCATAT_BLACKLIST`) | Planned Casis UI (Backend `isBlockedByAdminLists` & Pusdik search active) |
| **Absensi** | Pencatatan kehadiran (bergantung ExamPeriod aktif) | Active backend, legacy UI |
| **Ujian** | Mengerjakan ujian (bergantung ExamPeriod aktif) | Active backend, legacy UI |
| **Hasil** | Lihat hasil ujian dan keputusan akhir (`VerdictStatus`: `LULUS`, `TIDAK_LULUS`) | Active backend, legacy UI |

**Prinsip:** Login ≠ DITERIMA. OAuth hanya membuktikan kepemilikan akun Roblox, bukan status penerimaan. Status pendaftaran (`ApplicationStatus`) berbeda dengan hasil blacklist (`BERSIH`/`VERIFIKASI_PETUGAS`/`TERCATAT_BLACKLIST`) maupun keputusan sidang (`VerdictStatus`). Fitur absensi dan ujian bergantung pada ExamPeriod, namun **login sendiri TIDAK bergantung pada ExamPeriod**.

---

### B.3 — Admin Panel

Panel administrasi dengan autentikasi 2-stage (AdminKey + Discord Staff Verification).

**26 route API admin dipertahankan (Preserved).** Klasifikasi status integrasi route admin:
- **Preserved (Kode V1 Dipertahankan):** 26 file API route tersedia dan lolos build/typecheck.
- **Tested (Memiliki Unit Test Backend):** `/api/admin/auth/verify-staff`, `/api/admin/auth/session`, `/api/admin/init`, `/api/admin/blacklist`, `/api/admin/period`.
- **Not Verified (Belum Ada Proof Real Integration Test di V2):** E2E walkthrough dengan UI baru belum dilakukan.

*Catatan Khusus Diagnostik:* Endpoint `/api/admin/init` di V2 beroperasi sebagai **Diagnostik Read-Only** (GET mengembalikan status kesiapan tabel); POST mengembalikan **HTTP 410 Gone** (inisialisasi SQL string legacy dinonaktifkan total; DDL dikelola 100% oleh Prisma Migrate).

#### 8 Tab Admin Panel

| Tab | Fungsi |
|---|---|
| **Ikhtisar** | Dashboard ringkasan statistik rekrutmen |
| **Calon Siswa** | Daftar pendaftar, detail, manajemen data |
| **Seleksi** | Proses seleksi, penjadwalan ujian |
| **Putusan** | Keputusan penerimaan/penolakan |
| **Bank Soal** | Manajemen soal ujian |
| **Rekap Nilai** | Rekapitulasi nilai ujian |
| **Discord** | Integrasi Discord, retry mekanisme |
| **Audit Log + Settings** | Log aktivitas admin, pengaturan sistem |

**Autentikasi:** lihat detail di Bagian H.

---

## C. Visual Identity & Design System V2

### Source of Truth

Referensi desain asli: `D:\Dev\References\bares-web-extracted\bares-web\`

Seluruh keputusan visual harus konsisten dengan referensi ini. Tidak boleh menyimpang tanpa keputusan eksplisit.

### Design Tokens

| Token | Nilai | Penggunaan |
|---|---|---|
| `--bg` | `#080909` | Background utama |
| `--surface` | `#101212` | Surface card/panel |
| `--surface-2` | `#171919` | Surface sekunder |
| `--border` | `rgba(255,255,255,.12)` | Border elemen |
| `--text` | `#f1f1ed` | Teks utama |
| `--text-muted` | `#9d9d98` | Teks sekunder |
| `--red` | `#b71920` | Warna merah primer |
| `--red-bright` | `#d52a32` | Warna merah terang (hover/aktif) |
| `--success` | `#42c98a` | Status sukses |
| `--gold` | `#ad9564` | Aksen panel saja (bukan landing) |
| `--display` | `DM Serif Display` | Font heading display |
| `--sans` | `Inter` | Font sans-serif body |

### Karakter Visual

- **Dark editorial** — gelap, tajam, editorial
- **Zero radius** pada semua button, input, dan card (`border-radius: 0`)
- Heading serif menggunakan `DM Serif Display` weight 400
- Label uppercase `8-11px`, letter-spacing `.08-.16em`

### Aturan Warna per Area

| Area | Warna yang Dipakai | Catatan |
|---|---|---|
| **Landing/Website Publik** | `--red`, `--red-bright`, `--success` | **Tanpa gold.** Sesuai `style.css` asli |
| **Portal Casis** | `--gold` sebagai aksen subtle | Label, focus ring, indikator |
| **Admin Panel** | `--gold` sebagai aksen subtle | Label, focus ring, indikator |

### Anti-Slop Rules

Berikut elemen visual yang **DILARANG** digunakan:

| Dilarang | Alasan |
|---|---|
| Glass-blur / backdrop-filter | Bukan karakter desain Bareskrim |
| Rounded corners | Zero radius adalah identitas visual |
| Gradient cards | Tidak sesuai editorial dark theme |
| Generic dashboard template feel | Desain harus khas, bukan template generik |

### OPEN DECISION: Dark-Only vs Light Theme

File `admin.css` memiliki selector `body.light-mode`. Keputusan belum diambil apakah:
- **Opsi A:** Dark-only (hapus light-mode)
- **Opsi B:** Pertahankan toggle dark/light untuk admin panel

Lihat Bagian I untuk daftar lengkap open decisions.

---

## D. CMS Internal (Requirement Baru)

### Ringkasan

Admin mengelola konten website publik melalui CMS internal. Konten yang dikelola: hero section, judul halaman, CTA, periode rekrutmen, arsip, dan galeri.

### Fitur CMS

| Fitur | Deskripsi |
|---|---|
| **Draft/Published** | Setiap konten memiliki status draft atau published |
| **Preview** | Admin bisa preview konten sebelum publish |
| **Audit Log** | Setiap perubahan konten tercatat di audit log |

### Tiga Domain Terpisah

CMS memisahkan tiga domain secara tegas:

| Domain | Fungsi | Keterangan |
|---|---|---|
| **RecruitmentPeriod** | Single source of truth untuk status pendaftaran | Menentukan apakah pendaftaran dibuka/ditutup |
| **ExamPeriod** | Status ujian dan absensi | Menentukan kapan casis bisa absensi dan ujian |
| **CMS Content** | Teks display di halaman publik | Hero, judul, CTA, deskripsi halaman |

**Prinsip:** Ketiga domain ini TIDAK boleh dicampur. RecruitmentPeriod mengontrol pendaftaran, ExamPeriod mengontrol ujian/absensi, CMS Content mengontrol tampilan teks.

### Galeri

| Aspek | Detail |
|---|---|
| Upload | Admin upload foto/media via panel |
| Storage | Penyimpanan file dengan path terstruktur |
| Metadata | Judul, deskripsi, urutan, tanggal |
| Ordering | Admin bisa mengatur urutan tampil |
| Publication | Draft/Published per item galeri |
| Safe Deletion | Soft delete atau konfirmasi sebelum hapus permanen |

### Batasan Task Ini

**Tidak ada migration atau tabel database yang dibuat dalam task ini.** Dokumen ini hanya mendefinisikan requirement. Implementasi schema dan migration dilakukan di task terpisah.

---

## E. Roblox Profile & POLRI Group Sync (Requirement Baru)

### Target Data Profil Setelah OAuth Login

Saat ini dashboard dasar hanya menampilkan username dan displayName. Avatar, Roblox ID, grup, pangkat, dan timestamp sinkronisasi pada tabel target di bawah belum dinyatakan tersedia di UI; data tersebut memerlukan pekerjaan profil/sync tersendiri.

| Field | Sumber |
|---|---|
| `username` | Roblox OIDC |
| `displayName` | Roblox OIDC |
| `avatar` | `getAvatarHeadshot` via thumbnails.roblox.com |
| `robloxId` | OIDC `sub` claim (verified) |
| Keanggotaan POLRI group | `getUserGroups` via groups.roblox.com |
| Rank dalam group | groups.roblox.com/v1/users/{id}/groups/roles |
| Waktu sync terakhir | Disimpan saat callback/refresh |

**PENTING:** `robloxId` diambil dari OIDC `sub` claim yang terverifikasi, BUKAN dari input username manual.

### Library yang Sudah Ada (roblox.ts)

| Fungsi | Endpoint |
|---|---|
| `resolveUserByUsername` | Roblox Users API |
| `getUserGroups` | `groups.roblox.com/v1/users/{id}/groups/roles` |
| `getAvatarHeadshot` | `thumbnails.roblox.com` |
| `profileUrl` | URL profil Roblox user |

### Cache TTL

| Cache | TTL |
|---|---|
| `groupCache` | 5 menit |
| `headshotCache` | 30 menit |
| `resolveCache` | 10 menit |

### Data User Model (Sudah Ada)

Field yang sudah tersimpan di model User:

- `requiredGroupId` — ID group yang diwajibkan
- `policeGroupRankId` — ID rank dalam group
- `policeGroupRank` — Nama rank
- `policeGroupRankNumber` — Nomor urut rank
- `bannedGroupIds` — Daftar group yang dilarang
- `matraBlocked` — Status blokir matra

### Edge Cases

| Kasus | Penanganan |
|---|---|
| User tidak dalam group | Tampilkan status "Belum bergabung group POLRI" |
| Username berubah | Sudah di-sync saat OAuth callback |
| Rank berubah | Refresh saat login ulang atau sync manual |
| Roblox API down | Tampilkan data cache terakhir + peringatan stale |
| Cache kedaluwarsa | Fetch ulang, fallback ke data lama jika API gagal |

### Rank: Informasi vs Authorization Guard

| Konteks | Perilaku |
|---|---|
| **Profil** | Rank ditampilkan sebagai informasi (read-only) |
| **Authorization** | `exam-service` cek `policeGroupRankNumber >= minPoliceRank` sebelum izinkan ujian |

Kedua konteks ini menggunakan data yang sama tapi dengan tujuan berbeda. Profil hanya menampilkan, authorization memblokir/mengizinkan.

---

## F. Blacklist Verification (Requirement Baru)

### Dua Sumber Data Blacklist

| Sumber | Detail |
|---|---|
| **BlacklistEntry table** | Kategori POLRI dan PENDIDIKAN, pencarian by username |
| **Discord Pusdik channel** | `blacklist-pusdik.ts` mem-parse pesan channel Discord, cache 15 menit |

### Akses Admin

| Fitur | Deskripsi |
|---|---|
| List & Search | Daftar dan cari entri blacklist |
| Manage Entries | Tambah, edit, hapus entri |
| Pusdik Search | Endpoint `pusdik-search` untuk cari di data Discord |
| Sync Monitoring | Monitor status sinkronisasi dengan Discord |
| Audit | Log setiap perubahan pada data blacklist |

### Akses Portal Casis

- **Self-check only** — casis hanya bisa cek status blacklist diri sendiri
- Identifikasi menggunakan `robloxId` dari session terpercaya
- **Tidak boleh** mengakses data blacklist user lain
- **Internal notes tidak ditampilkan** ke casis

### Tiga Kemungkinan Hasil Pengecekan

| State | Tampilan ke Casis |
|---|---|
| **(1) Tidak ditemukan** | "Anda tidak tercatat dalam daftar blacklist" |
| **(2) Perlu verifikasi petugas** | "Status Anda memerlukan verifikasi petugas" |
| **(3) Tercatat dalam blacklist** | "Anda tercatat dalam daftar blacklist" |

### Integrasi dengan Exam Service

`exam-service.ts` → fungsi `isBlockedByAdminLists()` mengecek **kedua sumber** sebelum mengizinkan ujian:
- Cek `blacklistEntry`
- Cek `verdictEntry`
- Jika salah satu positif, ujian diblokir

### Aturan Keamanan Blacklist

> **KRITIS:** Jika Discord API gagal, sistem **TIDAK BOLEH** menganggap user aman. Prinsip fail-closed berlaku — jika data blacklist tidak bisa diverifikasi, akses ke ujian harus ditahan sampai verifikasi berhasil.

Blacklist checker di portal casis dan authorization guard di exam-service **harus konsisten** — tidak boleh ada kasus di mana portal menunjukkan "aman" tapi guard memblokir, atau sebaliknya.

---

## G. Autentikasi Casis & Login UI

### Status OAuth

OAuth PKCE Start & Correlation State sudah berfungsi (`TASK 03L.2B.1-2`).
Status pengujian: jalur sukses real OAuth telah menghasilkan token exchange **HTTP 200**, callback menuju `/dashboard`, dan trusted browser session **PASS**. Operator kemudian mengonfirmasi dashboard dengan sesi yang sama tanpa OAuth baru. Ini cukup untuk menutup fondasi TASK 03L.2C, tetapi isu A/B pada status milestone tetap terbuka dan OAuth belum dinyatakan production-ready.

### Legacy Endpoint

| Endpoint | Status |
|---|---|
| `POST /api/auth/verify` | **Tombstone 410 Gone** — endpoint lama, tidak lagi berfungsi |
| `LoginForm.tsx` | **Legacy tidak aktif pada route login** — dipertahankan sebagai file, bukan fallback. `/login` menggunakan `RobloxLoginPanel` dalam `(casis)` |

### JWT V2 (Trusted)

Token JWT V2 berisi claim berikut:

| Claim | Nilai |
|---|---|
| `authVersion` | `2` |
| `authMethod` | `ROBLOX_OIDC` |
| `isOwnershipVerified` | `true` |

### Login UI Aktif — TASK 03L.2C

Sudah diimplementasikan mengikuti referensi `student-login.html`, menggunakan `CasisShell`, `RobloxLoginPanel`, dan `casis.css` yang scoped:

- Struktur: header `PORTAL CASIS` + panel login; route `src/app/(casis)/login/page.tsx`
- Tombol utama: **"MASUK DENGAN ROBLOX"**
- Styling mengikuti Design System V2 (Bagian C)
- **Login TIDAK bergantung pada ExamPeriod** — pengecekan period hanya untuk fitur absensi/ujian

### Target State Dashboard Lanjutan (`ApplicationStatus`)

Tabel berikut adalah kebutuhan tahap berikutnya. Dashboard dasar belum membaca relasi Application dan menampilkan pesan netral, sehingga tidak menyimpulkan status berikut untuk pengguna. Pengguna trusted, termasuk pendaftar menunggu verifikasi, dapat membuka dashboard dasar; hak ujian/absensi tetap memerlukan guard terpisah.

| State `ApplicationStatus` | Deskripsi |
|---|---|
| **Belum linked** | Akun Roblox belum dihubungkan ke pendaftaran |
| **MENUNGGU_VERIFIKASI** | Pendaftaran sudah di-submit, menunggu verifikasi admin |
| **DITERIMA** | Pendaftaran disetujui admin |
| **DITOLAK** | Pendaftaran ditolak admin |

*Perhatian:* Istilah `ApplicationStatus` di atas murni status administratif pendaftaran, **bukan** status hasil pengecekan blacklist (`BERSIH`/`VERIFIKASI_PETUGAS`/`TERCATAT_BLACKLIST`) dan **bukan** hasil sidang (`VerdictStatus`: `LULUS`/`TIDAK_LULUS`).

### Student Claim (TASK 03L.2D) & Verifikasi Kredensial — SELESAI (IMPLEMENTED)

Proses menghubungkan akun Roblox (dari OAuth trusted session) dengan data pendaftaran menggunakan **Registration ID + Access Token**:
1. User menginput `registrationId` dan raw `accessToken` di UI Student Claim (`StudentClaimForm.tsx`).
2. Backend memverifikasi raw `accessToken` terhadap `Application.accessTokenHash` menggunakan `crypto.createHash("sha256")` dan `crypto.timingSafeEqual` (`verifyAccessTokenCredential`). Access token bersemantik *one-time disclosure*, bukan *one-time redemption*. Raw token TIDAK PERNAH disimpan dalam bentuk plaintext di DB dan tidak pernah dicetak di log.
3. Jika valid dan username Roblox cocok (`robloxUsernameKey`), fungsi atomic `linkApplicationToUser` di `src/lib/application-service.ts` mengupdate `Application.userId = user.id` dan `verifiedAt = now()`. Klaim berulang oleh pemilik sah bersifat **idempotent** (`isAlreadyLinked: true`, `verifiedAt` tidak ditimpa).
4. **PENTING:** `linkApplicationToUser` **TIDAK MENGUBAH** `ApplicationStatus` menjadi `DITERIMA`. Status `ApplicationStatus` tetap `MENUNGGU_VERIFIKASI` sampai disetujui oleh admin melalui proses seleksi, serta **TIDAK** memberikan akses otomatis ke ujian atau absensi.
5. **Verifikasi Konkurensi:** 6/6 reported PASS pada PostgreSQL 18.6 disposable cluster (`CONN1`, `CONN2`, `VERIFIER` independen); raw lock telemetry `EVIDENCE NOT RETAINED`. Fixture sintetis dibersihkan total.
6. **Catatan Arsitektur:** Limiter Student Claim (`rate-limit.ts`) masih in-memory LRU. Strategi shared rate limiting diperlukan sebelum multi-instance produksi. Milestone berikutnya: **TASK 03L.2E — ApplicationStatus Guard**.

### Prinsip Kunci

**OAuth ≠ DITERIMA.** Login OAuth membuktikan kepemilikan akun Roblox. Status penerimaan (`ApplicationStatus = DITERIMA`) ditentukan oleh admin melalui proses seleksi yang terpisah.

---

## H. Autentikasi Admin & Keamanan

### Autentikasi 2-Stage

| Stage | Mekanisme |
|---|---|
| **Stage 1** | AdminKey — kunci akses awal |
| **Stage 2** | Discord Staff Verification — verifikasi keanggotaan guild + role staff |

### Discord Staff Verification

Endpoint `verify-staff` memanggil Discord API untuk memverifikasi:
- Keanggotaan dalam guild (server Discord Bareskrim)
- Memiliki staff role ID: `1471794305499664426`

### Session Admin

| Aspek | Detail |
|---|---|
| Cookie | `brk_admin_verified` |
| Format | JWT ditandatangani dengan `getJwtSecret()` |
| Expiry | 12 jam |

### Middleware Protection

```
PROTECTED_PREFIXES = [/api/admin/, /api/attendance/list, /api/cron/discord-retry]
EXEMPT = [verify-staff, session, init]
```

Semua route dalam `PROTECTED_PREFIXES` memerlukan session admin valid, kecuali yang masuk daftar `EXEMPT`.

### Risiko Keamanan yang Teridentifikasi

> **PERINGATAN KEAMANAN — AdminKey Fallback Hardcoded**
>
> `ADMIN_KEY_FALLBACK` bernilai `'AdminBareskrim2026'` masih hardcoded di `constants.ts`. Ini adalah risiko keamanan serius. Diperlukan task terpisah untuk:
> 1. Menghapus fallback hardcoded
> 2. Menerapkan prinsip fail-closed — jika environment variable tidak diset, admin auth harus **gagal** (bukan fallback ke nilai default)
> 3. Rotasi key yang mungkin sudah terekspos

> **PERINGATAN KEAMANAN — SessionStorage Plaintext**
>
> Browser `sessionStorage` menyimpan AdminKey dalam plaintext. Pertimbangkan untuk menghapus penyimpanan ini dan hanya mengandalkan cookie `brk_admin_verified` yang sudah berupa signed JWT.

> **PERINGATAN — Menyembunyikan UI ≠ Keamanan**
>
> Menghapus tombol "LOGIN ADMIN" dari footer **BUKAN** pengganti autentikasi. Route admin tetap bisa diakses langsung via URL. Keamanan harus diterapkan di level middleware, bukan di level visibilitas UI.

---

## I. Open Decisions

Keputusan-keputusan berikut memerlukan input dari operator/stakeholder sebelum implementasi:

| # | Keputusan | Opsi | Dampak |
|---|---|---|---|
| 1 | **Dark-only vs Light Theme** | (A) Dark-only, hapus `body.light-mode` — (B) Pertahankan toggle | `admin.css` sudah memiliki selector `body.light-mode`. Jika dark-only, kode light-mode bisa dihapus untuk mengurangi kompleksitas |
| 2 | **AdminKey Fallback Hardening** | (A) Hapus fallback, fail-closed — (B) Ganti dengan nilai generated per-deploy | Risiko keamanan aktif selama fallback hardcoded masih ada |
| 3 | **SessionStorage AdminKey** | (A) Hapus, hanya pakai cookie JWT — (B) Pertahankan dengan enkripsi | Plaintext di browser storage adalah vektor serangan XSS |
| 4 | **Blacklist Fail-Closed Strictness** | (A) Blokir ujian jika Discord API down — (B) Izinkan dengan flag warning ke admin | Trade-off antara keamanan (fail-closed) dan availability (casis tidak bisa ujian jika Discord down) |
| 5 | **Gallery Storage Backend** | (A) Local filesystem — (B) Cloud storage (S3/R2) — (C) Database blob | Skala, biaya, dan kompleksitas deployment berbeda tiap opsi |
| 6 | **CMS Preview Mechanism** | (A) Preview URL dengan token sementara — (B) Preview in-panel (iframe/modal) | UX admin vs kompleksitas implementasi |
| 7 | **Student Claim Flow Detail** | Perlu finalisasi UX lengkap di TASK 03L.2D | Bagaimana casis memasukkan Registration ID + Access Token, validasi, dan error handling |
| 8 | **Rank Sync Frequency** | (A) Hanya saat OAuth login — (B) Background job periodik — (C) Manual trigger oleh casis | Freshness data rank vs beban ke Roblox API |
| 9 | **Login UI — keputusan selesai di TASK 03L.2C** | Komponen baru `RobloxLoginPanel` sesuai referensi | `LoginForm.tsx` tidak aktif; endpoint 410 tidak dihidupkan kembali. Cleanup file legacy bukan bagian milestone ini |
| 10 | **Galeri Safe Deletion** | (A) Soft delete (tandai deleted, sembunyikan) — (B) Hard delete dengan konfirmasi 2 langkah | Recoverability vs simplicity |

---

*Dokumen ini akan diperbarui seiring keputusan diambil dan requirement baru teridentifikasi.*
