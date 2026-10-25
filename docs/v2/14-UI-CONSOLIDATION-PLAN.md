# 14 — UI CONSOLIDATION PLAN

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

> Rencana awal TASK 03L.3A; status aktual diperbarui melalui TASK 03L.2C.2 (dokumentasi saja).
> Diperbarui TASK 03L.3A.1 — Review Konsistensi & Koreksi Dokumentasi.
> Source of truth visual: `D:\Dev\References\bares-web-extracted\bares-web\` (jangan diubah).
> Workspace V2 Dev: `D:\Dev\Projects\bareskrim-rekrutmen-v2`. V1 Production (`D:\bareskrim-rekrutmen`) FROZEN.
>
> **Dokumen terkait (TASK 03L.3A.1):**
> - `docs/v2/15-MASTER-V2-REQUIREMENTS.md` — Konsolidasi kebutuhan lengkap V2.
> - `docs/v2/16-V1-V2-FEATURE-PARITY.md` — Matriks fitur V1 vs V2.
> - `docs/v2/17-V2-IMPLEMENTATION-ROADMAP.md` — Roadmap implementasi bertahap.

---

## 1. Current-State UI Inventory

### 1.1 Route & Layout Existing

| Route | Group/layout | Chrome | Styling | Status |
|---|---|---|---|---|
| `/` (landing) | `(landing)/layout.tsx` → `design-root` + `DesignNavbar` + `DesignFooter` | Desain baru | `landing.css` (3618 baris, port dari `style.css`) | **BARU ✓** |
| `/daftar` | `(landing)` | Desain baru | `registration.css` (port dari `registration.css`) + `RegistrationWizard` | **BARU ✓** |
| `/rekrutmen`, `/tentang`, `/arsip` | `(landing)` | Desain baru | `landing.css` | **BARU ✓** |
| `/login` | `(casis)/layout.tsx` → `CasisShell` + `RobloxLoginPanel` | Portal Casis baru | `casis.css`, scoped `.casis-root` | **SELESAI — 03L.2C** |
| `/dashboard` | `(casis)`, Server Component dengan `getSessionUser()` | Dashboard dasar | `casis.css`, scoped `.casis-root` | **SELESAI — fondasi; trusted browser session PASS** |
| `/absen`, `/hasil`, `/review/[id]`, `/tolak` | `(app)` | Tailwind legacy | `globals.css` + komponen `ui/Card`, `ui/Button` | **LAMA** |
| `/ujian` | `(app)`, server component + `ExamInterface` client | Tailwind legacy | `globals.css` | **LAMA** |
| `/admin` | `(app)` — dibungkus Navbar/Footer publik | Tailwind legacy | `globals.css`; `AdminPanel.tsx` 1816 baris | **LAMA** |
| `/galeri` | — | — | — | **BELUM ADA** (placeholder nav `nav-pending`) |

### 1.2 API/Auth Terkait UI

- `GET /api/auth/roblox/start` + `GET /api/auth/roblox/callback` — OAuth Roblox (`TASK 03L.2B.1–3`): token exchange nyata HTTP 200 dan trusted browser session telah terverifikasi. Isu A/B di atas tetap terbuka; bukan klaim OAuth production-ready.
- `POST /api/auth/verify` — **tombstone 410** `LEGACY_LOGIN_DISABLED` (login legacy mati).
- `GET /api/period/active` — `prisma.examPeriod.findFirst({isActive:true})`; auto-hitung `isAttendanceOpen` dari `openedAt/closedAt`; `{active:false}` bila tidak ada periode.
- Admin: 26 route `api/admin/*` (lihat §7); auth via `verify-staff` (adminKey + username Discord staff) → cookie `brk_admin_verified` (JWT, diverifikasi `middleware.ts`); halaman `/admin` sendiri publik, otorisasi sesungguhnya di level API. Klasifikasi route admin: 26 route backend dipertahankan (*preserved*), beberapa memiliki unit test (*tested*), tetapi belum diverifikasi penuh dengan E2E UI baru (*not verified*).
- `/api/admin/init`: GET = Diagnostik status schema read-only (mengembalikan status kesiapan tabel); POST = **410 Gone** (auto-DDL SQL string legacy telah dinonaktifkan total; skema V2 dikelola penuh oleh Prisma Migrate).

### 1.3 Footer & Navigasi — Temuan Eksplisit

- `src/components/landing/DesignFooter.tsx:17` — tautan **`LOGIN ADMIN` → `/admin`** di footer publik landing (desain baru sekalipun!).
- `src/components/layout/Footer.tsx` (legacy) — "Panel Admin" → `/admin` juga ada.
- `DesignNavbar` — `LOGIN SISWA` → `/login` (benar, tetap dipertahankan).

---

## 2. Perbedaan Visual Lama vs Baru

| Dimensi | Referensi V2 (`style.css` & halaman) | UI Legacy (`globals.css` + Tailwind) |
|---|---|---|
| **Background** | `#080909`–`#0b0b0b` solid gelap (admin `#0b0b0b`, student `#090909`) | Hitam + glass blur, radial hero, gradasi; dukungan tema **light** (`html:not(.dark)`) |
| **Surface** | `--surface #101212/#141414`, `--surface-2 #171919`, panel datar | `.glass` / `.glass-strong` translusen + backdrop-blur |
| **Aksen utama** | **Merah** `#b71920/#b52227` (tombol utama), aksen **gold** hanya di halaman student/admin (`#ad9564/#b79b69`) sebagai label kecil | **Gold** `#d4af37` dominan (teks, border, hover), crimson `#7b1113` sekunder |
| **Tipografi** | `DM Serif Display` (heading, weight 400, line-height ~0.98) + `Inter`; label uppercase 8–11px letter-spacing `.08–.16em` | `font-display` Tailwind + Inter; heading bold; tracking-wider |
| **Button** | `.btn-primary`: merah solid, radius **0** (persegi), hover `#d52a32` + `translateY(-1px)` | `ui/Button` rounded-lg, variant gold/ghost/danger |
| **Input** | Persegi, `min-height 50px`, border `rgba(255,255,255,.12)`, background `#101010`, focus border **gold** | `rounded-lg`, bg `white/5`, focus ring gold |
| **Card** | Persegi, border 1px tipis, padding besar (46px login card) | `rounded-xl` glass |
| **Header** | Landing: navbar brand + nav-links + tombol LOGIN SISWA. Admin: `system-header` (brand + label `ADMIN PANEL` + tombol tema ◐). Student: `student-header` 64px | `Navbar` fixed glass blur + hamburger mobile + ThemeToggle |
| **Footer** | `footer.footer` ringkas: brand + slogan + LOGIN ADMIN + copyright | `Footer` besar: logo, social media (2 TikTok), kolom menu, gold-line |
| **Grid admin** | `admin-nav` vertikal/tab + `grid-template-columns` mis. `1.35fr .65fr`, `repeat(4,1fr)` kartu statistik | Tab horizontal scroll (`periode/bank/rekap/casis/data/discord/settings/log`) |
| **Responsive** | Breakpoint eksplisit (600px login; 1019–1053px admin: nav jadi `repeat(2,1fr)` lalu 1 kolom) | Tailwind breakpoints (md/sm) |

**Ringkasan gap:** karakter identitas baru = **dark solid, aksen merah, sudut tajam (radius 0), serif display, label uppercase kecil, gold hanya sebagai aksen halus**. UI legacy = **glass-blur, gold dominan, sudut membulat, tema light-toggle**. Target: pindah ke karakter referensi, bukan sebaliknya.

**Catatan token referensi:** tiap halaman referensi punya `:root` sendiri dengan nilai nyaris identik (merah `#b71920/#b52227`, gold `#ad9564/#b79b69/#d4af37` di landing… tidak ada; gold hanya student/admin/registration). Landing asli (`style.css`) **tanpa gold** — hanya merah + success `#42c98a`. Ini harus dihormati: landing = merah/putih; gold = aksen khusus panel.

---

## 3. Route Mapping Target V2

| URL | Target | Chrome | Catatan |
|---|---|---|---|
| `/` | Landing (sudah benar) | `DesignNavbar` + `DesignFooter` (LOGIN ADMIN **dihapus**, lihat §3.1) | Pertahankan |
| `/daftar` | Registrasi (sudah benar) | `design-root` + `registration.css` | Pertahankan |
| `/login` | **Login Casis OAuth — tersedia** | `(casis)` + `CasisShell` + `RobloxLoginPanel`, label `PORTAL CASIS` | Anchor "MASUK DENGAN ROBLOX" → `/api/auth/roblox/start`; Student Claim terpisah, TASK 03L.2D |
| `/dashboard` | **Dashboard dasar — tersedia** | `(casis)` + `CasisShell` | Guard server-side; identitas minimum; tidak menebak status Application atau membuka fitur peserta |
| `/absen` | Panel siswa: absensi | Student chrome ala `student.html` | Butir guard `ApplicationStatus` (TASK terpisah) |
| `/ujian` | Panel siswa: ujian | Student chrome | Business logic tidak disentuh |
| `/hasil` | Panel siswa: hasil | Student chrome | — |
| `/review/[id]` | Panel siswa: review | Student chrome | — |
| `/tolak` | Halaman penolakan matra | Student chrome, tombol merah | Pertahankan `REDIRECT_BLOCKED_MESSAGE` |
| `/admin` | Admin panel (visual baru) | `system-header` + `admin-nav` ala `admin.html` | URL tetap; auth tetap `verify-staff` |
| `/galeri` | (nanti) | Desain baru | Ikut TASK galeri |

### 3.1 Penempatan Navigasi Admin (Opsi)

| Opsi | Deskripsi | Rekomendasi |
|---|---|---|
| **A. Hapus dari footer publik** | Tautan `LOGIN ADMIN` di `DesignFooter` & `Footer` legacy dihapus; `/admin` tetap dapat diakses langsung | **Direkomendasikan** — hilangkan iklan endpoint di halaman publik |
| B. Pindah ke URL non-tebak | `/admin` → path internal (mis. `/staff`) | Menambah security-by-obscurity; tidak menggantikan autentikasi |
| C. Biarkan | Sesuai referensi (admin.html memang punya akses dari index) | Tidak disarankan di produksi |

**Posisi tegas:** menyembunyikan URL **bukan** pengganti autentikasi. Kontrol nyata tetap: `middleware.ts` (prefix `/api/admin/*` wajib cookie `brk_admin_verified`) + `verify-staff` + ADMIN_KEY kuat. Opsi A hanya mengurangi surface reconnaissance.

---

## 4. Shared Design System Proposal

Fondasi Casis sudah memakai `src/styles/casis.css` dengan token lokal `.casis-root`. Ekstraksi `tokens.css`/`system.css` lintas Public, Casis, dan Admin di bawah ini masih rencana; tidak ditandai selesai oleh TASK 03L.2C.

### 4.1 Token Canonical (satu berkas, semua halaman)

`src/styles/tokens.css` — nilai **persis** dari referensi (bukan hasil redesign):

```css
:root {
  /* base (style.css / landing) */
  --bg: #080909;  --surface: #101212;  --surface-2: #171919;
  --border: rgba(255,255,255,.12);  --border-soft: rgba(255,255,255,.08);
  --text: #f1f1ed;  --text-muted: #9d9d98;  --text-dim: #666864;
  --red: #b71920;  --red-bright: #d52a32;  --success: #42c98a;
  /* aksen panel (student/admin/registration referensi) */
  --gold: #ad9564;
  /* tipografi */
  --display: "DM Serif Display", serif;  --sans: "Inter", sans-serif;
}
```

Aturan:
- Landing: **hanya** merah + success (tanpa gold), sesuai `style.css` asli.
- Panel siswa/admin: gold hanya untuk label kecil (`STUDENT PANEL`, `ADMINISTRATION`, `system-label`), focus input, dan step-indicator — sesuai `student-login.css`/`admin.css`.
- Radius: **0** untuk button/input/card (karakter referensi). Hindari rounded Tailwind di halaman yang dimigrasi.

### 4.2 Primitif Bersama (diimpor per halaman, tetap scoped)

| Primitif | Sumber referensi | Dipakai di |
|---|---|---|
| `login-header` / `login-brand` / `system-label` | `student-login.css` | `/login` |
| `login-card` + form input 50px + `.btn` merah | `student-login.css` | `/login` (dan klaim nanti) |
| `system-header` + `system-brand` | `admin.css` | `/admin` |
| `admin-nav` + `admin-panel` grid | `admin.css` | `/admin` |
| `student-header`, `student-status-section`, `student-grid` | `student.css` | `/absen`, `/hasil`, `/ujian`, `/review/[id]` |
| `.btn-primary` merah, `.eyebrow`, `.body-copy` | `style.css` (sudah ada di `landing.css`) | lintas halaman |

Pendekatan: port CSS per domain (seperti pola `landing.css`/`registration.css` yang sudah terbukti: di bawah namespace `.design-root` agar tidak bentrok dengan Tailwind selama masa transisi), **bukan** rewrite ke utility framework baru. Jangan campur Tailwind dan token baru di komponen yang sama.

### 4.3 Anti "AI-Slop"

- Jangan mengganti serif display dengan sans generik.
- Jangan menambahkan gradient/glass/blur baru — referensi datar dan tegas.
- Jangan "merapikan" ukuran font referensi ke skala baku; ikut clamp/px yang ada.
- Ikon: referensi memakai glyph teks (→, ◐) dan emoji di admin legacy; jangan memperkenalkan set ikon baru kecuali diminta.

---

## 5. Rencana Implementasi Bertahap

### Tahap 1 — Fondasi token + primitif (tanpa perubahan route)
- Buat `src/styles/tokens.css` (nilai referensi).
- Buat `src/styles/system.css`: primitif `system-header`/`admin-nav` (dari `admin.css`) + `student-header`/`student-grid` (dari `student.css`) + `login-card` (dari `student-login.css`), semua di bawah namespace masing-masing (`.design-root`, `.admin-root`, `.student-root`).
- **Acceptance:** landing & `/daftar` tidak berubah visual (screenshot before/after identik); token dapat diimpor tanpa konflik Tailwind; `npm run lint/typecheck/test` tetap PASS.

### Tahap 2 — Login UI & Dashboard Foundation (TASK 03L.2C) — SELESAI

- `/login` dipindah dari `(app)` ke `(casis)` tanpa duplikasi route; `LoginForm.tsx` tetap sebagai file legacy tidak aktif, bukan fallback.
- `RobloxLoginPanel` mengikuti komposisi `student-login.html`: eyebrow `AKSES CASIS`, judul serif, tombol merah berupa anchor eksplisit menuju `/api/auth/roblox/start`.
- Login bebas dari ExamPeriod/RecruitmentPeriod. Pemeriksaan `/api/period/active` hanya menjelaskan perilaku login legacy, bukan dependensi halaman aktif.
- Error OAuth memakai allowlist pesan tetap; nilai asing/berulang menjadi pesan generik. Parameter error tidak menghapus sesi valid atau memicu redirect/OAuth otomatis.
- `/dashboard` tersedia dengan guard `getSessionUser()` server-side, render dinamis, displayName dan username saja; tanpa query status Application, pangkat, grup, atau blacklist.
- Layout dan CSS terisolasi; tidak ada tindakan/prefetch ujian atau absensi. Mekanisme OAuth, JWT, cookie, PKCE, middleware, dan database tidak diubah.
- **Verifikasi:** 259/259 Vitest PASS, typecheck PASS, HTTP login 200, dashboard tanpa sesi 307 ke login, dashboard dengan trusted browser session PASS menurut operator. Desktop manual dan mobile otomatis dicatat terpisah pada status milestone.
- **Batas penutupan:** fondasi selesai; OAuth reliability, responsivitas lintas seluruh perangkat, dan portal peserta penuh belum dinyatakan selesai.

### Tahap 3 — Portal siswa lanjutan (chrome student.html) — BELUM SELESAI

Dashboard dasar sudah tersedia di Tahap 2. Tahap ini mencakup status Application yang benar dan fitur peserta setelah Student Claim (TASK 03L.2D) serta ApplicationStatus Guard.

- Ganti Navbar/Footer/MobileCTA/BackToTop legacy pada `/absen`, `/hasil`, `/ujian`, `/review/[id]`, `/tolak` dengan chrome `student-header` + footer ringkas ala `student.css`.
- Peta seksi `student.html` → halaman: `student-welcome` (sapaan + identitas Roblox dari sesi), `student-status-section` (status pendaftaran: MENUNGGU_VERIFIKASI/DITERIMA/dst. — **hasil OAuth ≠ DITERIMA**), `student-grid` (kartu aksi: Absensi, Ujian, Hasil), `student-information` (info periode), `student-closing`.
- **Acceptance:** konsistensi visual; status pendaftaran tampil benar dari `Application` (bukan asumsi); rute ujian/absensi tetap berfungsi; test existing PASS.

### Tahap 4 — Admin panel (visual admin.html, fungsi AdminPanel dipertahankan)
- `/admin` keluar dari `(app)` layout publik (tidak lagi dibungkus Navbar/Footer siswa).
- Kemas `AdminPanel` dengan `system-header` (brand + `ADMIN PANEL` + tombol tema opsional) + `admin-nav` referensi.
- Pemetaan tab (label referensi → tab existing):
  | Referensi | AdminPanel existing | Fitur API terkait |
  |---|---|---|
  | Ikhtisar | (bagian stats di `periode`) | `stats` |
  | Calon Siswa | `casis` | `users`, `candidates` |
  | Seleksi | `periode` + absensi | `period`, `attendance` |
  | Putusan | `data` | `verdicts(+bulk)`, `blacklist(+bulk, pusdik-search)` |
  | Bank Soal | `bank` | `questions` |
  | Rekap Nilai | `rekap` | `stats`, `export/[kind]`, `backup` |
  | Discord | `discord` | `discord-groups`, `discord/messages`, `discord-retry`, `pusdik-notify`, `check-name`, `channel-refs`, `groups` |
  | Audit Log | `log` | `logs` |
  | — | `settings` | `settings`, `diagnostics`, `init` |
- Login admin 2-tahap existing (Admin Key → Verifikasi Staff) **sudah sejajar** `admin.html` (stage `01/02`: Admin Key → Verifikasi Staff) — hanya restyle container, bukan alur.
- **Acceptance:** semua 26 endpoint admin tetap terpanggil dari UI yang sama (daftar fitur §7 tidak ada yang hilang); autentikasi/otorisasi tidak berubah; visual cocok `admin.html`.

### Tahap 5 — Bersih-bersih legacy
- Hapus tautan `LOGIN ADMIN` dari `DesignFooter` (dan `Footer` legacy saat Tahap 4 selesai).
- Hapus/diarsipkan: `Navbar` legacy, `Footer` legacy, `MobileCTA`, `BackToTop`, `ThemeToggle`, `Logo` (ganti aset baru), komponen `ui/Card`/`ui/Button` Tailwind bila tidak ada pemakai.
- **Acceptance:** `grep -r "text-gold\|glass\|gold-text" src/app src/components` ≈ 0 di route aktif; bundle CSS menyusut; semua route tampil konsisten referensi.

### Tahap 6 (opsional) — Tema terang
- Referensi `admin.css` punya `body.light-mode`. Legacy V2 punya sistem light/dark Tailwind. Keputusan: **apakah V2 perlu tema terang?** Jika ya, ikut pola `body.light-mode` admin.css; jika tidak (default gelap seperti semua halaman referensi kecuali admin), hapus toggle tema dari UI siswa. — butuh keputusan operator.

---

## 6. Dependensi Student Claim & OAuth

| Dependensi | Dampak ke Tahap | Status |
|---|---|---|
| **Real OAuth Smoke Test** (TASK 03L.2B.3) | Bukti callback sukses dan trusted browser session untuk fondasi | **PASS untuk jalur sukses yang diuji**; isu A/B tetap terbuka |
| **Student Claim API** (TASK 03L.2D) | Form Registration ID + Access Token (`student-login.html` referensi) dipasang setelah API claim terbukti. Algoritma hash: SHA-256 (`hashAccessToken`) dengan `timingSafeEqual`. `linkApplicationToUser` menautkan `userId` tanpa mengubah `ApplicationStatus` menjadi `DITERIMA` | Belum ada |
| **ApplicationStatus Guard** | Panel siswa (Tahap 3) menampilkan status `ApplicationStatus` (`MENUNGGU_VERIFIKASI`, `DITERIMA`, `DITOLAK`), tetapi rute ujian/absensi belum memeriksa `DITERIMA` — blocker fungsional sebelum peserta nyata | Belum ada (temuan 03L.2B.1) |
| **Security Hardening (ADMIN_KEY_FALLBACK & sessionStorage)** | `ADMIN_KEY_FALLBACK` (`"AdminBareskrim2026"`) wajib di-hardening (fail-closed) di Tahap 5 SEBELUM Tahap 9. Penyimpanan `sessionStorage.admin_key` di browser harus dihilangkan di Tahap 9 | Sebagian (`JWT_SECRET` fail-closed DONE; `ADMIN_KEY` belum) |
| **Data Periode Dev** | `/login` baru tidak bergantung periode; absensi/ujian tetap butuh `ExamPeriod` aktif saat diuji | Terpisah |

Urutan lanjutan: **Fondasi login/dashboard (03L.2C, selesai)** → **Student Claim (03L.2D)** → **ApplicationStatus Guard** → **portal peserta Tahap 3**. Konsolidasi token lintas area, Admin, dan pembersihan legacy tetap pekerjaan terpisah.

---

## 7. Fitur Admin yang WAJIB Dipertahankan

Inventaris dari `AdminPanel.tsx` + 26 route `api/admin/*` — migrasi visual **tidak boleh** menghilangkan satupun:

1. **Autentikasi admin:** 2 tahap (Admin Key → Verifikasi Staff dengan username Discord), sesi cookie `brk_admin_verified`, auto-login dari sessionStorage, logout (`session` GET/DELETE).
2. **Periode rekrutmen:** buat/ubah/tutup periode (`period` GET/POST/PATCH), status absensi/ujian.
3. **Bank soal:** CRUD PG & essay (`questions` GET/POST/DELETE).
4. **Kelola casis:** daftar user/candidate, hapus (`users`, `candidates` GET/DELETE), cek nama (`check-name`).
5. **Putusan & blacklist:** verifikasi/lulus/tidak lulus (`verdicts` + `verdicts/bulk`), blacklist tambah/hapus massal + pencarian Pusdik (`blacklist`, `blacklist/bulk`, `blacklist/pusdik-search`).
6. **Absensi:** pengelolaan/hapus record (`attendance` DELETE), export CSV.
7. **Rekap & ekspor:** statistik dashboard (`stats`), export CSV per jenis (`export/[kind]`), backup (`backup` GET).
8. **Discord:** grup/discord message (GET/DELETE), retry (`discord-retry`), notifikasi Pusdik (`pusdik-notify`), channel refs, groups.
9. **Pengaturan:** KKM/durasi/pangkat/discord (`settings` GET/PATCH), init schema (`init`), diagnostics, logs (GET/DELETE).
10. **Tombol tema** (opsional, sesuai referensi admin.html `◐`).

**Risiko keamanan yang dicatat:**
- `ADMIN_KEY_FALLBACK = "AdminBareskrim2026"` masih ada di `src/lib/constants.ts` — jika `ADMIN_KEY` kosong di environment production, `getAdminKey()` mengembalikan key publik yang diketahui. **Direkomendasikan TASK terpisah:** hapus fallback (fail-closed seperti `getJwtSecret`, TASK 03L.2B.2).
- `sessionStorage.admin_key` menyimpan key plaintext di browser (pola legacy). Pemindaian tetap diverifikasi server; pertimbangkan hapus penyimpanan key di klien pada Tahap 4 (cukup cookie sesi).
- Menyembunyikan tautan `/admin` dari footer (§3.1 Opsi A) mengurangi surface, **bukan** menggantikan autentikasi.

---

## 8. Acceptance Criteria Ringkas per Tahap

| Tahap | Kriteria utama | Verifikasi |
|---|---|---|
| 1 | Token/primitif baru terpasang; landing & daftar tak berubah | screenshot + lint/typecheck/test PASS |
| 2 — selesai | Login OAuth dan dashboard dasar aktif; legacy form tidak dirender; guard trusted session | 259/259 PASS, typecheck PASS; HTTP 200/307; dashboard sesi nyata dan desktop manual PASS; mobile otomatis terbatas |
| 3 | Chrome student pada 5 rute siswa; status pendaftaran tampil benar (bukan asumsi DITERIMA) | visual + alur absen/ujian existing tetap jalan |
| 4 | Admin visual `admin.html`; 8 tab referensi memetakan fitur §7 tanpa kehilangan; auth tak berubah | checklist §7 terpanggil semua |
| 5 | Legacy Tailwind dibersihkan dari route aktif; footer publik tanpa LOGIN ADMIN | grep tak ada sisa gold/glass; route lengkap diperiksa |

---

## Lampiran A — Pemetaan Fitur Existing → API (bukti audit)

- Auth admin: `verify-staff/route.ts` (cek `isAdminKeyValid` + username staff), `session/route.ts` (GET/DELETE), middleware `PROTECTED_PREFIXES = ["/api/admin/", "/api/attendance/list", "/api/cron/discord-retry"]`, exempt: `verify-staff`, `session`, `init`.
- `period/active/route.ts`: `findFirst({isActive:true})` → `{active:false}` bila kosong; `isAttendanceOpen` dihitung otomatis dari `openedAt/closedAt` — inilah sumber pesan "Belum Ada Periode Aktif" di `LoginForm.tsx:72`.
- `LoginForm.tsx` legacy memanggil `POST /api/auth/verify` (410), tetapi tidak lagi diimpor route `/login` aktif. File tersebut bukan fallback saat OAuth gagal.
- Referensi `AGENTS.md` (arsip statis): state demo di localStorage; V2 menggantinya dengan backend Prisma — jangan port perilaku localStorage.

## Lampiran B — Risiko & Keputusan Tertunda

1. Keputusan tema terang/dark (Tahap 6) — referensi admin punya light-mode; halaman lain gelap semua.
2. `ADMIN_KEY_FALLBACK` — TASK hardening terpisah.
3. `/galeri` belum ada — nav menampilkan placeholder `nav-pending`.
4. Pemetaan label tab admin (Bahasa Indonesia referensi: Ikhtisar/Calon Siswa/Seleksi/Putusan/Bank Soal/Rekap Nilai/Discord/Audit Log) vs label existing (Periode/Bank Soal/Rekap Nilai/Kelola Casis/Putusan & Blacklist/Discord/Pengaturan/Audit Log) — disarankan ikut label referensi, dengan `settings` dipindah ke area `system-header` (ikon ⚙) atau tetap jadi tab ke-9.
5. Komponen `CasisCard`/`HasilChecker`/`AttendanceChecker`/`ExamInterface` direstyling bertahap per Tahap 3 — scope besar; boleh dipecah per halaman dalam TASK masing-masing.
