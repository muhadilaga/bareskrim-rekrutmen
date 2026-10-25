# 01 — UI AUDIT: Arsip Desain `bares-web`

Tanggal audit: 2026-10-02. Sumber: `D:\Dev\References\bares-web-extracted\bares-web\` (ekstraksi RAR v5, 24 file, 12.443 baris kode). Arsip asli: `D:\bareskrim-rekrutmen\references\bares-web.rar` (dibaca read-only, tidak dimodifikasi).

## 1. Ringkasan arsip

Prototype situs rekrutmen statis berbahasa Indonesia untuk "Pusdik Reserse Bareskrim Polri RBX". Tanpa framework, tanpa build tool, tanpa backend — setiap halaman memuat CSS/JS relatif sendiri. Data disimpan di `localStorage` browser per-origin. Dokumentasi internal arsip (`AGENTS.md`) menyatakan eksplisit: auth admin adalah demo client-side, storage tidak durable/aman/multi-user.

| File | Peran | Baris |
|---|---|---|
| `index.html` | Landing publik: 4 view tab (home, recruitment, about, archive) dalam satu file | 1.614 |
| `style.css` | Styling publik (4 tab + responsive) | 3.582 |
| `script.js` | Tab navigation via hash, in-page scroll, countdown | 160 |
| `registration.html` | Form pendaftaran 3 langkah + script inline | 1.308 |
| `registration.css` | Styling + print treatment | 1.257 |
| `student-login.html/.css/.js` | Login student panel (Registration ID + Access Token) | 52/98/64 |
| `student.html/.css` | Dashboard status siswa + script inline | 535/282 |
| `admin.html/.css/.js` | Login admin 2 tahap + dashboard 8 tab | 801/1.139/1.461 |
| `assets/logo/logo-pusdik.png` | Logo bersama (468 KB) | — |
| `assets/images/` | 6 PNG (hero, intro, environment, 3 education) — masing-masing 1,5–1,9 MB | — |
| `AGENTS.md` | Kontrak antar-file, aturan desain visual, batasan | 65 |
| `CLAUDE.md` | Instruksi tool visual editor (Zaemit) — tidak relevan untuk migrasi | 25 |

Temuan markup: `index.html:415` punya tag `<section>` rusak (`<section class="process" <div="" ...`) — artefak visual editor; `index.html` juga penuh inline style `!important` bekas editor. Gambar di `index.html` di-embed sebagai base64 inline (14 MB), sementara salinan file PNG asli ada di `assets/images/` — migrasi harus memakai file `assets/`, bukan base64. `registration.html:41` menautkan brand ke `recruitment.html` yang tidak ada (bug tautan, dikonfirmasi `AGENTS.md`).

## 2. Design tokens

Palet hampir identik antar halaman (deviasi kecil antar file CSS):

| Token | `style.css` (publik) | `registration.css` | `admin.css` | `student-login.css` |
|---|---|---|---|---|
| Background | `--bg #080909` | `--black #090909` | `--bg #0b0b0b` | `#090909` |
| Surface | `#101212` / `#171919` | `#101010` / `#141414` | `#111111`/`#171717`/`#1d1d1d` | `#141414` |
| Teks | `#f1f1ed` | `#f1efe9` | `#eeeae2` | `#f1efe9` |
| Muted | `#9d9d98` | `#918e88` | `#918d86` | `#918e88` |
| Merah (aksen utama) | `#b71920` / bright `#d52a32` | `#b52227` / `#cf2d33` | `#b52228` / hover `#c92b31` | `#b52227` / `#cf2d33` |
| Emas (sekunder/premium) | — | `#ad9564` | `#b79b69` | `#ad9564` |
| Hijau (sukses/aktif) | `--success #42c98a` | `#6aad78` | `#68b478` | — |
| Border | `rgba(255,255,255,.12)`/`.08` | — | `rgba(238,234,226,.11)`/`.17` | `rgba(241,239,233,.12)` |

Keputusan migrasi: satukan ke satu palet di Tailwind config V2 — nilai kanonik: bg `#090909`, surface `#141414`/`#171919`, teks `#f1efe9`, muted `#918e88`, red `#b52227` (hover `#cf2d33`), gold `#ad9564`, green `#6aad78`, border `rgba(241,239,233,.12)`. Deviasi antar file CSS desain dianggap noise render, bukan token terpisah.

## 3. Tipografi

- Body/UI: **Inter** (400/500/600/700), dimuat via Google Fonts di setiap halaman.
- Display heading: **DM Serif Display** (weight 400), dipakai `h1`/`h2` besar dengan italic `<em>` sebagai aksen editorial.
- Hierarki editorial: eyebrow/metadata uppercase + letter-spacing `.08–.16em` ukuran kecil (8–11px); heading serif besar (`clamp(38px,5vw,54px)`, `line-height ~.98`); kontrol/label sans kompak (13–15px).
- Catatan: blok "TYPOGRAPHY POLISH" di akhir `student-login.css` menaikkan ukuran font dasar (mis. label 8px → 11px, input 13px → 15px) — versi "final" yang benar adalah setelah polish; jangan pakai nilai awal yang terlalu kecil.

## 4. Spacing, bentuk, bayangan

- Panel persegi (`border-radius` tidak dipakai / nyaris nol), border 1px translusen, perubahan surface halus, whitespace generous.
- Tabel data: baris bergaris tipis, tanpa zebra warna; status berupa teks kecil berwarna (hijau/emas/merah) + titik.
- Bayangan berat, sudut membulat, warna cerah ceria: dihindari (aturan `AGENTS.md`).
- Header tiap halaman: tinggi 74–78px, border-bottom 1px, brand kiri (logo 42px + teks dua baris), label sistem kanan (gold, uppercase).

## 5. Navigasi

- **Publik** (`index.html`): navbar `Beranda / Rekrutmen / Tentang / Arsip` + tombol `LOGIN SISWA`. Navigasi tab via `data-tab` + `history.replaceState` hash (`#recruitment`, `#about`, `#archive`), tanpa reload — di Next.js berarti 4 route terpisah dengan NavLink aktif.
- **Registration**: header ringkas (brand + "← KEMBALI"); sidebar progres 3 langkah (Identitas → Profil → Pernyataan) dengan progress line.
- **Student**: header (brand + nama user + KELUAR); konten = welcome + status + timeline 4 tahap + grid kartu (data peserta, pengumuman) + kartu informasi.
- **Admin**: header (brand + label ADMIN PANEL + toggle tema ◐); nav tab horizontal 8 tab: Ikhtisar, Calon Siswa, Seleksi, Putusan, Bank Soal, Rekap Nilai, Discord, Audit Log.
- Footer publik: brand, tagline "Disiplin. Integritas. Profesional.", tautan `LOGIN ADMIN`, copyright.
- Tema light: hanya `admin.css` yang punya override `body.light-mode`; halaman lain dark-only.

## 6. Animasi & interaksi

- Transisi CSS saja (`.2s ease`): tombol primary hover → `--red-bright` + `translateY(-1px)`; link hover → warna teks; fokus input → border gold.
- **Tidak ada `@keyframes` di seluruh arsip** — tanpa animasi dekoratif, tanpa reveal-on-scroll.
- Countdown rekrutmen: `script.js:92` memakai deadline hardcoded `2026-09-30T23:59:59`, update per detik via `setInterval`, elemen `#days/#hours/#minutes/#seconds`.
- Admin: aksi Verify/Reject per kasus, search + filter status, refresh, backup JSON download (`Blob` + `link.download`), audit log tumbuh dari `localStorage`, toggle light mode.
- Aksesibilitas: form memakai `<label for>` + `required` + `checkValidity()/reportValidity()` native; admin memakai `escapeHtml`/`escapeAttribute` untuk data user yang dirender ke HTML.

## 7. Responsive

| Halaman | Breakpoint |
|---|---|
| Publik (`style.css`) | 1100px, 900px, 760px, 600px, 520px, 481px (hero) + rentang 481–769px |
| Registration | 900px, 600px + `@media print` (cetak bukti pendaftaran) |
| Student | 950px, 600px |
| Student login | 600px (brand text + label sistem disembunyikan) |
| Admin | 820px, 600px |

Pola umum: kolom multi → satu kolom, sidebar progres jadi horizontal/atas, tabel data jadi kartu bertumpuk.

## 8. Perilaku JavaScript (temuan integrasi kritis)

| Halaman | Mekanisme | Konsekuensi migrasi |
|---|---|---|
| `registration.html` | Inline script: navigasi langkah, validasi per-langkah, generate `registrationId` `XLI-02-####` (Math.random) + `accessToken` `XLI-02-XXXX-XXXX` (crypto.getRandomValues, alphabet 32 char tanpa 0/O/1/I), simpan objek application ke `localStorage["bareskrimApplication"]`, layar sukses tampilkan ID+token, tombol cetak `window.print()` | Ganti: React state multi-langkah + POST ke API server; ID/token digenerate **server-side**; token di-hash di DB |
| `student-login.js` | Cocokkan `registrationId`+`accessToken` dari `localStorage`, buat sesi `bareskrimStudentSession` | Ganti: endpoint login + cookie JWT httpOnly |
| `student.html` | Baca sesi, redirect bila tidak ada, render field dari `localStorage`, logout = remove key | Ganti: server component + API status |
| `admin.js` | Login 2 tahap (kunci demo hardcoded di `admin.js:13-14` — nilai tidak dicatat di sini, sengaja), kelola `bareskrimApplications` + `bareskrimAuditLog` + `bareskrimAdminSession`, aksi verify/reject, backup JSON | **Jangan dipertahankan** — gunakan auth backend V2 yang sudah ada (admin key + JWT staff Discord) |
| `script.js` | Hash routing + countdown hardcoded | Ganti: App Router + data jadwal dari API/DB |

Status string yang harus konsisten (dipakai filter & counting di desain): `MENUNGGU VERIFIKASI`, `TERVERIFIKASI`, `DITOLAK`.

## 9. Aset gambar

- `assets/images/`: hero.png, intro.png, environment.png, education-discipline.png, education-integrity.png, education-professional.png (1,5–1,9 MB PNG masing-masing) + `assets/logo/logo-pusdik.png` (468 KB).
- Strategi migrasi: salin ke `public/` V2 saat implementasi, kompres/resize (target ≤150 KB/webp) — `next.config.mjs` V2 saat ini `images.unoptimized: true`; optimasi lokal file lebih dulu, aktifkan optimizer Next bila mau.
- Galeri Bareskrim sendiri sudah ada di `public/galeri-bareskrim/` (28 file png/webp) — terpisah dari aset arsip ini (lihat `06-GALLERY-PLAN.md`).

## 10. Temuan risiko desain

1. Credential admin demo hardcoded di `admin.js` — nilai tidak pernah dipakai production; jangan ditiru polanya.
2. Semua data di `localStorage` — hilang antar perangkat, tidak ada keamanan; seluruh layer data harus pindah ke server.
3. Countdown/jadwal hardcoded — harus dinamis dari `ExamPeriod`/periode pendaftaran.
4. Gambar base64 inline di HTML sumber — jangan ikut di-embed ke komponen React; pakai file dari `assets/`.
5. Markup rusak (`index.html:415`) + inline style `!important` bekas editor — jangan disalin harfiah ke JSX; struktur ulang bersih dengan class yang sama.
