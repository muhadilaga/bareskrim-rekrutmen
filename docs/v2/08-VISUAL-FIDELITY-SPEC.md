# 08 — VISUAL FIDELITY SPECIFICATION & IMPLEMENTATION READINESS

Tanggal: 2026-10-02. Sumber visual: `D:\Dev\References\bares-web-extracted\bares-web\` (ekstraksi RAR asli dari `D:\bareskrim-rekrutmen\references\bares-web.rar`, read-only). Dokumen ini adalah **spesifikasi visual source of truth** untuk implementasi Bareskrim Rekrutmen V2: implementasi wajib mempertahankan tampilan arsip dengan fidelity setinggi mungkin — tanpa reinterpretasi, tanpa penggantian tema, tanpa penyederhanaan layout, tanpa template generik.

---

## 1. Visual Baseline (bukti screenshot)

### 1.1 Parameter capture (konsisten untuk semua screenshot)

| Parameter | Nilai |
|---|---|
| Renderer | Chromium headless (ms-playwright `chromium-1243`, `chrome.exe` via `executablePath`) |
| Playwright | `playwright` dari `node_modules` V2 (playwright-core 1.62.1) |
| Sumber | Prototype dijalankan lokal via `python3 -m http.server 8123` (127.0.0.1) — **tanpa backend production, tanpa jaringan eksternal selain Google Fonts** |
| Viewport | Desktop **1440×900**, Tablet **768×1024**, Mobile **390×844** |
| deviceScaleFactor | **2** (konsisten di semua viewport) |
| Locale | `id-ID` |
| Penangkapan | `fullPage: true` (seluruh tinggi halaman) |
| Font loading | Menunggu `document.fonts.ready` + jeda 600 ms (countdown interval + render transisi) |
| Penyimpanan | `D:\Dev\Projects\bareskrim-rekrutmen-v2\docs\v2\visual-baseline\` (workspace V2) |
| Skrip | `D:\Dev\References\bares-web-extracted\shot-baseline.mjs` (direktori referensi terisolasi) |

### 1.2 Hasil: 27 screenshot (9 state × 3 viewport) — semua PASS

| Halaman/state | desktop-1440 | tablet-768 | mobile-390 |
|---|---|---|---|
| `index-home--*.png` | ✓ | ✓ | ✓ |
| `index-recruitment--*.png` | ✓ | ✓ | ✓ |
| `index-about--*.png` | ✓ | ✓ | ✓ |
| `index-archive--*.png` | ✓ | ✓ | ✓ |
| `registration--*.png` | ✓ | ✓ | ✓ |
| `student-login--*.png` | ✓ | ✓ | ✓ |
| `student-dashboard--*.png` (session di-seed) | ✓ | ✓ | ✓ |
| `admin-login--*.png` | ✓ | ✓ | ✓ |
| `admin-dashboard--*.png` (session di-seed) | ✓ | ✓ | ✓ |

Verifikasi visual (vision tool): `index-recruitment--desktop-1440` — hero + countdown + informasi (persyaratan 01–04, tahapan 01–05) + jadwal timeline + CTA + footer tampil, tema gelap+merah, tanpa area blank. `admin-dashboard--desktop-1440` — 8 tab nav, 4 stat cards (3/1/1/1 dari data seed), panel periode, akun aktif, tanpa form login.

### 1.3 Bugs prototype + patch baseline (WAJIB diketahui implementor)

Arsip asli punya 2 bug JS yang membuat capture awal tidak representatif. Patch **minimal** diterapkan HANYA di direktori ekstraksi terisolasi (arsip RAR asli & V1 tidak disentuh), diverifikasi via probe DOM:

| Bug | Bukti | Patch | Status |
|---|---|---|---|
| `index.html`: section `recruitment/about/archive` TIDAK punya atribut `data-page` (hanya `home` yang ada) — `script.js showTab()` mencari `[data-page="..."]` → "Tab tidak ditemukan" → hash `#recruitment` dst. tidak pernah menampilkan tab (screenshot awal ke-4 tab identik byte) | `script.js:7,57-61`; `grep data-page` = 1 kemunculan | Tambah `data-page="recruitment|about|archive"` ke `<section class="page-tab ...">` baris 724/1155/1376 | FIXED — probe: tab recruitment `active=true`, section tampil |
| `admin.html`: elemen `id="backupButton"` tidak ada di HTML padahal `admin.js:1207` memanggil `.addEventListener` padanya → TypeError → **auto-login & render dashboard tidak pernah dieksekusi** (screenshot dashboard = login) | `getElementById` list admin.js vs `id=` list admin.html | Tambah `<button id="backupButton" ... hidden>` di panel audit | FIXED — probe: `loginHidden=none`, `dashHidden=false` |

Konsekuensi untuk implementasi Next.js: kedua bug **tidak boleh direplikasi** — di React, routing tab = router (bukan querySelector), dan semua elemen yang di-referensikan JS ada secara struktural. Perilaku YANG BENAR (tab berfungsi via hash/link, dashboard admin tampil) adalah spesifikasi, bukan bug.

Catatan baseline: countdown di screenshot menampilkan `00:00:00:00` karena deadline hardcoded prototype (`2026-09-30T23:59:59`) sudah lewat pada tanggal capture — implementasi wajib memakai data jadwal dinamis. Panel "Pendaftar Terbaru" di admin-dashboard kosong (render recent memfilter field yang tidak cocok dengan seed) — struktur panel tetap terekam; data = milik backend.

---

## 2. Design tokens aktual (dari seluruh CSS)

### 2.1 Palet per file (nilai VERBATIM)

**`style.css` (publik — landing/recruitment/about/archive):**
```
--bg: #080909          --surface: #101212      --surface-2: #171919
--border: rgba(255,255,255,.12)   --border-soft: rgba(255,255,255,.08)
--text: #f1f1ed        --text-muted: #9d9d98   --text-dim: #666864
--red: #b71920         --red-bright: #d52a32   --success: #42c98a
--display: "DM Serif Display", serif            --sans: "Inter", sans-serif
```

**`registration.css`:**
```
--black: #090909       --black-soft: #101010   --panel: #141414
--white: #f1efe9       --muted: #918e88        --muted-dark: #5f5d59
--red: #b52227         --red-bright: #cf2d33   --gold: #ad9564   --green: #6aad78
```

**`student.css`:**
```
--bg: #090909          --surface: #131313       --surface-raised: #181818
--text: #f1efe9        --muted: #918e88         --dim: #65635f
--red: #b52227         --red-bright: #cf2d33    --gold: #ad9564  --green: #6aad78
--line: rgba(241,239,233,.12)
```

**`student-login.css`:** bg `#090909`, surface `#141414`, text `#f1efe9`, muted `#918e88`, red `#b52227`/`#cf2d33`, gold `#ad9564`, border `rgba(241,239,233,.12)`.

**`admin.css`:**
```
--bg: #0b0b0b          --surface: #111111   --surface-2: #171717   --surface-3: #1d1d1d
--text: #eeeae2        --muted: #918d86     --muted-2: #625e58
--red: #b52228         --red-hover: #c92b31
--green: #68b478       --gold: #b79b69
--border: rgba(238,234,226,.11)   --border-strong: rgba(238,234,226,.17)
```
Admin juga punya override tema terang: `body.light-mode` (baris 44 `admin.css`) — HANYA halaman admin.

### 2.2 Token kanonik untuk Tailwind V2 (satukan deviasi antar file)

| Token | Nilai kanonik | Catatan |
|---|---|---|
| bg / bg-soft | `#090909` / `#101010` | variasi `#080909`–`#0b0b0b` dianggap noise render |
| surface / surface-2 / surface-3 | `#141414` / `#171919` / `#1d1d1d` | panel kartu, panel terangkat |
| text / muted / dim | `#f1efe9` / `#918e88` / `#65635f` | |
| red / red-bright | `#b52227` / `#cf2d33` | aksen utama, tombol primary, judul italic |
| gold | `#ad9564` | eyebrow, aksen premium, fokus input |
| green | `#6aad78` | status aktif/sukses (dot, badge OPEN) |
| border / border-soft | `rgba(241,239,233,.12)` / `rgba(241,239,233,.08)` | 1px solid |
| radius | `0` (default), `3px` (kecil), `2px`, `99px` (pill), `50%` (dot) | desain NYARIS SUDUT TAJAM — jangan bulatkan |
| shadow | **nyaris nol** — hanya glow hijau: `0 0 13px rgba(106,173,120,.6)` (status dot/hero), `0 0 12px rgba(106,173,120,.5)` (registration), `0 0 0 4px rgba(173,149,100,.1)` (student status-dot gold ring) | JANGAN menambahkan bayangan kartu |

## 3. Tipografi

### 3.1 Font
- **Display**: `DM Serif Display` (400) — `h1`/`h2` besar, italic `<em>` sebagai aksen editorial.
- **Sans/UI**: `Inter` (400/500/600/700).
- Dimuat via Google Fonts di setiap halaman (CSP V2 sudah mengizinkan `fonts.googleapis.com`/`fonts.gstatic.com`).

### 3.2 Skala font-size aktual

| Kelas | Nilai | Pemakaian |
|---|---|---|
| Micro-label | 6px, 7px, 8px, 9px, 10px | eyebrow, metadata, label tabel (27× `8px`, 16× `11px`, 15× `7px` di `style.css`) |
| UI kecil | 11px, 12px, 13px | bantuan teks, tombol secondary |
| Body | 14px (admin 49×), 15px, 16px, 17px | body text, input (setelah polish) |
| Heading sedang | 20px, 22px, 26px, 27px, 30px, 31px, 32px, 42px, 43px, 44px | h2/h3 per section |
| Display besar | 58px, `clamp(52px,5vw,72px)`, `clamp(64px,7vw,104px)`, `clamp(64px,8vw,110px)` (registration), 70px (admin) | hero heading per halaman |
| Watermark | 260px (registration "XLI" raksasa) | dekoratif transparan |

Aturan: **judul display memakai `clamp()`** (sudut pandang responsif), label micro uppercase + `letter-spacing`. Blok "TYPOGRAPHY POLISH" di akhir `student-login.css` menaikkan ukuran font dasar (label 8px→11px, input 13px→15px) — pakai nilai SETELAH polish.

### 3.3 Letter-spacing aktual
`.07em` (tombol), `.08em`, `.10em`, `.14em`, `.15em`, `.16em`, `.18em` (eyebrow/nav uppercase), `-.025em` (heading display serif — tracking rapat).

## 4. Spacing & dimensi komponen penting

| Komponen | Dimensi aktual |
|---|---|
| Header publik | `min-height: 75px`, padding `28px 5vw` (versi lebar) / `20px 6vw` (recruitment), border-bottom 1px |
| Header student | `min-height: 58px` (mobile), padding `0 20px` |
| Brand logo | 42px (header publik), 34px (student) |
| Tombol primary/next/submit | `min-height: 48px`, padding `0 18px`, font 13px, letter-spacing `.07em` |
| Tombol secondary/outline | `min-height: 40–44px`, border 1px, transparan |
| Input/select | height 44–48px, border 1px, radius kecil, padding horizontal ~14–16px |
| Container utama publik | `max-width: 1250px` (registration form-layout), section content ~900px |
| Kartu pendidikan gambar | `height: 390px` |
| Hero | `min-height` 680–900px per halaman (home 720–900px, recruitment/about/archive 750–780px), padding besar |
| Panel admin | padding 22–28px, border 1px, surface `#111111`–`#1d1d1d` |
| Kartu student | `padding: 22px`, border `1px solid var(--line)`, surface |
| Stat card admin | 4 kolom grid (desktop), label 14px + angka besar + sub |
| Max-width kecil (kartu/form) | 380/390/440/450/500/510/520/620px (konteks per kartu) |

## 5. Struktur halaman & section

| Halaman | Section (urutan) |
|---|---|
| **index — tab home** | navbar (Beranda/Rekrutmen/Tentang/Arsip + LOGIN SISWA) → hero (judul display + gambar hero base64) → recruitment card (PENERIMAAN SAAT INI 2026) → intro section (gambar intro + teks) → education grid 3 kartu (390px gambar + overlay + meta: DISCIPLINE/INTEGRITY/PROFESSIONAL) → process list → environment section (bg cover) → archive preview → final CTA → footer (brand + tagline "Disiplin. Integritas. Profesional." + LOGIN ADMIN + copyright) |
| **index — tab recruitment** | hero (ANGKATAN XLI + status PENDAFTARAN DIBUKA + countdown kanan: HARI/JAM/MENIT/DETIK) → informasi penerimaan (kartu A Persyaratan 01–04 + kartu B Tahapan 01–05 dengan status OPEN/NEXT) → jadwal (eyebrow IMPORTANT DATES + timeline 4 baris tanggal + status) → CTA (judul campur putih/merah + tombol MULAI PENDAFTARAN + watermark XLI) |
| **index — tab about** | about hero → filosofi (judul + paragraf) → 3 prinsip (Disiplin/Integritas/Profesional) → journey/timeline → closing CTA |
| **index — tab archive** | archive hero → daftar arsip (baris angkatan/gelombang + tanggal) → catatan → closing |
| **registration** | header (brand + ← KEMBALI) → intro (status PENDAFTARAN DIBUKA + judul "Daftarkan dirimu." + meta ANGKATAN XLI · GELOMBANG 02 + watermark XLI) → form layout 2 kolom: sidebar (PENDAFTARAN XLI + progress 01 Identitas/02 Profil/03 Pernyataan + catatan) + form-container 3 step (fields + form-actions) → success section (centang, REGISTRATION ID, ACCESS TOKEN, credential note, status MENUNGGU VERIFIKASI, aksi: kembali/masuk panel/simpan bukti) |
| **student-login** | header minimal (brand + label sistem) → kartu login terpusat (eyebrow, judul, label+input Registration ID, label+input Access Token, tombol masuk, bantuan teks) → footer ringkas |
| **student** | header (brand + CALON SISWA/nama + KELUAR) → welcome (eyebrow + "Selamat datang, {nama}" + id-card REGISTRATION ID) → status pendaftaran (status panel + tanggal + timeline 01 Pendaftaran→02 Verifikasi→03 Seleksi→04 Pendidikan) → grid (DATA PESERTA + PENGUMUMAN) → informasi penerimaan (3 kartu: rekrutmen/pendidikan/dokumen-locked) → closing → footer |
| **admin — login** | header (brand + ADMIN PANEL + toggle ◐) → login card 2 stage (01 Admin Key → 02 Discord Username + Staff Key, indikator 01/02) → footer |
| **admin — dashboard** | header (sama) → dashboard-top (judul + account-box: online dot, nama staff, Discord, Keluar) → nav 8 tab (Ikhtisar/Calon Siswa/Seleksi/Putusan/Bank Soal/Rekap Nilai/Discord/Audit Log) → panel Ikhtisar (periode header + badge AKTIF + 4 stat cards + kolom: Pendaftar Terbaru + kartu Periode) → panel Calon Siswa (toolbar search+filter+refresh + case list) → panel Seleksi (process rows AKTIF/MENUNGGU) → panel kosong (Putusan/Bank Soal setting/Rekap/Discord/Audit) → footer |

## 6. Inventaris aset desain + mapping base64

### 6.1 Base64 di `index.html` (8 kemunculan, VERIFIED via SHA-256)

| # | MIME | Byte | Identitas (sha256[:16]) | Posisi |
|---|---|---|---|---|
| 1, 8 | png | 468.489 | `d425e50d3530cfb1` = **`assets/logo/logo-pusdik.png`** | header + footer (2×) |
| 2–7 | png | 1.640.496 | `7987f21f8b61c03e` = **`assets/images/hero.png`** | hero tab home + digunakan ulang di section lain (6×) |

Tidak ada file HTML lain yang memuat base64 (`registration/student/student-login/admin`: 0 kemunculan).

### 6.2 Referensi file (non-base64)

| Aset | Byte | Referensi |
|---|---|---|
| `assets/logo/logo-pusdik.png` | 468.489 | `<img src>` di registration/student/student-login/admin (6× total lintas file) |
| `assets/images/hero.png` | 1.640.496 | `style.css` `url()` 3× (background hero per tab) |
| `assets/images/environment.png` | 1.861.744 | `style.css:3135` `url()` 1× (environment section) |
| `assets/images/intro.png` | 1.689.430 | **TIDAK direferensikan di HTML/CSS mana pun** (aset mati) |
| `assets/images/education-discipline.png` | 1.575.633 | **tidak direferensikan** — kartu pendidikan memakai base64 hero (duplikat) |
| `assets/images/education-integrity.png` | 1.805.286 | **tidak direferensikan** (sama) |
| `assets/images/education-professional.png` | 1.522.899 | **tidak direferensikan** (sama) |

Keputusan migrasi aset: pakai **file** (bukan base64), salin ke `public/` V2, kompres ke WebP target ≤150 KB. Untuk kartu pendidikan, gunakan `education-*.png` yang sebenarnya ada (lebih benar daripada duplikasi hero seperti arsip), TAPI hal ini = **perbedaan visual yang diperbolehkan** (lihat §10) karena sumber desainnya sendiri tidak konsisten — konfirmasi user saat implementasi. Logo `logo-pusdik.png` tetap dipakai apa adanya.

## 7. Animasi, transition, hover, focus, active

| Keadaan | Aturan aktual |
|---|---|
| Transisi global | `.2s ease` (kebanyakan), `.25s ease` (beberapa), satu `transform .8s ease` |
| Tombol primary hover | background → `--red-bright` + `translateY(-1px)` |
| Link hover | perubahan warna teks (→ `--red`/`--white`) `.2s ease` |
| Input focus | border → `--gold` |
| Tab nav active | teks putih + **garis bawah/aksen merah** (underline bar) |
| Status dot | `border-radius: 50%`, glow hijau (lihat §2.2) |
| Countdown | update teks per detik (`setInterval 1000`) — TANPA animasi angka |
| Reveal-on-scroll | **TIDAK ADA** — `@keyframes` nol di seluruh arsip; jangan menambahkan |
| Print | `registration.css` punya `@media print` (bukti pendaftaran) — pertahankan |

## 8. Breakpoint asli (responsif)

| File | Breakpoint |
|---|---|
| `style.css` (publik) | 1100px, 900px, 760px, 600px, 520px, 481px (+ rentang 481–769px untuk hero) |
| `registration.css` | 900px, 600px + `@media print` |
| `student.css` | 950px, 600px |
| `student-login.css` | 600px (brand text + label sistem disembunyikan) |
| `admin.css` | 820px, 600px |

Pola umum: multi-kolom → satu kolom; sidebar progres registration → atas; tabel data admin → kartu bertumpuk; header menyusut + label disembunyikan di mobile. Implementasi Tailwind: pakai nilai breakpoint ini (bukan default Tailwind mentah) atau map ke `screens` config.

## 9. Interaksi JavaScript yang WAJIB direplikasi dengan React

| # | Perilaku arsip | Implementasi React/Next | Status backend |
|---|---|---|---|
| 1 | Hash-tab routing 4 halaman (`script.js` + `history.replaceState`) | Route terpisah `/`, `/rekrutmen`, `/tentang`, `/arsip` + `next/link`; aktif state via `usePathname` | — |
| 2 | Countdown deadline (interval per detik, `padStart(2,"0")`, reset `00` saat lewat) | Client component dengan data deadline dari API/periode — BUKAN hardcode | `/api/public/recruitment` |
| 3 | Internal smooth scroll (`scrollIntoView` untuk link data-home-scroll) | `scrollIntoView` di client atau anchor biasa dengan `scroll-behavior` | — |
| 4 | Multi-step form 3 langkah (toggle `.active`, progress sidebar completed/active, `scrollTo(0)`) | React state `currentStep` + kondisional render; validasi per langkah | — |
| 5 | Validasi per langkah (`checkValidity`/`reportValidity` per field, lewati checkbox) | Validasi client (required + zod) per step sebelum lanjut | — |
| 6 | Review step (salin nilai field ke ringkasan saat masuk step 3) | Derive dari state form | — |
| 7 | Submit: cek agreement → generate ID/token → simpan → layar sukses → sembunyikan form | POST `/api/registration`; server generate `registrationId`+`accessToken`; token ditampilkan SEKALI; state success client-side | `Application` table |
| 8 | Token generator (alphabet 32 char tanpa 0/O/1/I, `crypto.getRandomValues`) | Reproduksi pola alphabet di server (Node crypto) | server-side |
| 9 | `window.print()` untuk bukti pendaftaran + `@media print` | Tombol cetak + print CSS | — |
| 10 | Student login (cocokkan ID+token → buat sesi → guard redirect) | POST `/api/auth/student-login` → cookie JWT httpOnly; guard `/dashboard` | student session |
| 11 | Student logout (hapus sesi → redirect login) | Hapus cookie via endpoint logout → redirect | — |
| 12 | Admin login 2 stage (stage1 key → stage2 staff, error inline, indikator 01/02) | Representasi ulang alur `x-admin-key` + `verify-staff` existing — JANGAN hardcode key desain | admin auth existing |
| 13 | Admin auto-login dari sesi tersimpan | Cek cookie JWT admin existing | — |
| 14 | Admin tab switching (8 tab, `.active`) | State tab React (atau segment routes) | — |
| 15 | Admin cases: search (nama/Roblox/Discord/ID), filter status, refresh, action verify/reject (update status + audit) | Komponen CandidatesTab existing direstyle; aksi ke API admin existing + endpoint applications baru | `/api/admin/*` |
| 16 | Admin summary counting (total/menunggu/terverifikasi/ditolak) | Dihitung server dari data | stats API |
| 17 | Admin audit log (append aksi, render list) | `AdminLog` existing | existing |
| 18 | Backup JSON download (Blob + `bareskrim-backup-{ts}.json`) | Pertahankan `/api/admin/backup` existing | existing |
| 19 | Toggle tema light (admin only) | `ui/ThemeToggle` existing, scope admin saja | — |
| 20 | Password/visibility toggle input admin | Komponen kecil client-side | — |
| 21 | Escape HTML saat render data user | React escaping bawaan — jangan reimplementasi | — |

## 10. Acceptance criteria — screenshot comparison

Untuk setiap halaman/state, bandingkan screenshot implementasi vs baseline (`docs/v2/visual-baseline/`) pada **viewport identik** (1440×900, 768×1024, 390×844; DSF 2; fullPage; font sudah load). Kriteria:

1. **Warna**: bg/surface/teks/aksen/aksen-emas/hijau status sesuai §2.2 (selisih warna tidak terlihat mata).
2. **Tipografi**: DM Serif Display untuk display heading + italic aksen; Inter untuk UI; hierarki ukuran sesuai §3.2 (bandingkan tinggi judul relatif terhadap viewport).
3. **Layout**: urutan section, jumlah kolom per breakpoint, posisi nav/header/footer, alignment kiri/konten-center sesuai §5 & §8.
4. **Bentuk**: sudut nyaris tajam (radius 0–3px), border 1px translusen, tanpa bayangan kartu (§2.2).
5. **Konten wajib tampil**: seluruh teks label/eyebrow/heading utama (angka data boleh berbeda — lihat §11).
6. **State**: tab nav aktif benar; hover/focus mengikuti §7 (uji manual/klik).
7. **Toleransi otomatis**: jika memakai pixel-diff, threshold ~5–8% piksel berbeda per halaman dianggap PASS (font rendering antar mesin tidak identik); di atas itu wajib ditinjau manual.
8. **Regression check**: setelah tiap fase, capture ulang state terkait dengan parameter §1.1 dan bandingkan.

## 11. Perbedaan visual yang DIPERBOLEHKAN (kebutuhan integrasi backend)

| Perbedaan | Alasan |
|---|---|
| Angka countdown, statistik (Total Pendaftar, jumlah peserta), tanggal jadwal, daftar arsip | Data dinamis dari DB/periode — baseline memakai contoh/hardcode |
| Teks fallback saat data kosong (mis. "—", empty state) | Backend belum punya data; arsip selalu terisi contoh |
| Tombol yang terhubung fitur belum ada (mis. "Pengaturan Periode", kartu Dokumen Peserta "locked") | Disembunyikan/disabled — jangan mematikan fitur yang belum ada backend |
| Gambar: format/kompresi (PNG → WebP), resolusi lebih kecil | Optimasi aset; bentuk & posisi identik |
| Kartu pendidikan memakai `education-*.png` (bukan duplikat hero base64) | Aset benar sudah ada; arsipnya tidak konsisten — konfirmasi user |
| Countdown tampil `00:00:00:00` di baseline (deadline lewat) | Implementasi memakai deadline dinamis — angka boleh berbeda |
| Label "ANGKATAN XLI / GELOMBANG 02" → nama periode aktif dari DB | Data-driven |
| Elemen yang dihasilkan React (hydration-safe) vs string HTML identik | Struktur DOM boleh berbeda selama render visual identik |
| Dark-mode default di semua halaman; light-mode HANYA admin | Sesuai arsip |

**TIDAK diperbolehkan**: mengganti palet/font, membulatkan sudut, menambah bayangan/animasi reveal, menyederhanakan layout (mis. menggabungkan section), memakai template generik, menghapus eyebrow/metadata editorial, mengganti hierarki tipografi.

## 12. Risiko visual fidelity

1. Font Google gagal dimuat (jaringan/CSP) → fallback serif/sans mengubah tampilan drastis — pastikan `next/font`/link + fallback stack (Georgia untuk display, system-ui untuk sans) dan verifikasi CSP izinkan domain font.
2. Gambar base64 hero 1,6 MB × banyak → kompresi WebP bisa mengubah nuansa (bandingkan visual); jangan apply filter berlebih.
3. Layout hero dengan gambar full-cover + overlay gelap — kompresi/`object-fit` harus identik; baseline jadi pembanding.
4. Countdown 4 digit lebar berbeda (mis. "0" vs "00") — implementasi wajib `padStart(2,"0")` seperti arsip.
5. `clamp()` display heading — pastikan nilai min/mid/max persis seperti §3.2 agar proporsi di 1440/768/390 identik.
6. Baseline memakai Chromium 153 headless — Chrome biasa bisa membedakan sub-pixel rendering tipis; gunakan toleransi §10.7.
