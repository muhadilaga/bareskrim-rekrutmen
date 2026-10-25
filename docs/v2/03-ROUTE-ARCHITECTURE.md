# 03 — ROUTE ARCHITECTURE: Peta Halaman & API V2

Basis: App Router Next.js 14 (`src/app/`), commit `67a79ab`. Halaman existing dipertahankan; route baru ditandai `[BARU]`.

## 1. Struktur route yang direncanakan

```
src/app/
├── page.tsx                    /            [REDESIGN] landing (desain index.html tab home)
├── rekrutmen/page.tsx          /rekrutmen   [BARU]     info penerimaan + countdown + jadwal
├── tentang/page.tsx            /tentang     [BARU]     filosofi + nilai + journey
├── arsip/page.tsx              /arsip       [BARU]     arsip angkatan/gelombang
├── daftar/page.tsx             /daftar      [BARU]     form pendaftaran 3 langkah
├── galeri/page.tsx             /galeri      [BARU]     galeri Bareskrim (aset existing)
├── dashboard/page.tsx          /dashboard   [BARU]     panel status siswa (student.html)
├── login/page.tsx              /login       [REDESIGN] form login (student-login.html)
├── absen/page.tsx              /absen       [PERTAHANAN] verifikasi+absensi Roblox
├── ujian/page.tsx              /ujian       [PERTAHANAN] halaman ujian (try-catch server, NEXT_REDIRECT)
├── hasil/page.tsx              /hasil       [PERTAHANAN] cek hasil
├── review/[id]/page.tsx        /review/:id  [PERTAHANAN] review jawaban
├── tolak/page.tsx              /tolak       [PERTAHANAN] halaman penolakan
├── admin/page.tsx              /admin       [REDESIGN VISUAL] shell admin baru
└── api/… (43 route, dipertahankan + penambahan registrasi)
```

Prinsip: **bukan** hash-tab seperti desain. Setiap "tab" `index.html` jadi route nyata (SEO, navigasi native, cache per route). Konten data (periode aktif, jadwal, arsip) diserahkan dari server/API — tidak hardcode di JSX.

## 2. Route baru yang dibutuhkan API

| Endpoint | Method | Fungsi | Auth |
|---|---|---|---|
| `/api/registration` | POST | Terima form pendaftaran, generate `registrationId`+`accessToken` server-side, simpan ke tabel baru (lihat `04-RECRUITMENT-FLOW.md`) | Publik + rate limit (pola `rate-limit.ts` existing) |
| `/api/registration/status` | GET | Status pendaftaran by Registration ID (opsional, untuk dashboard) | Token login (Opsi 1 di `02`) |
| `/api/auth/student-login` | POST | Login student: Registration ID + Access Token → cookie JWT | Publik + rate limit |
| `/api/public/recruitment` | GET | Data landing: status pendaftaran, tanggal, countdown deadline, ringkasan tahapan | Publik |
| `/api/public/gallery` | GET | Daftar gambar + kategori galeri (dari manifest JSON) | Publik |

Semua endpoint admin/ujian/absen existing TIDAK berubah contract-nya.

## 3. Middleware & proteksi (existing, dipertahankan)

`src/middleware.ts` — matcher `/api/:path*`, `PROTECTED_PREFIXES`:
- `/api/admin/` (dengan `EXEMPT_PATHS` untuk auth flow admin)
- `/api/attendance/list`
- `/api/cron/discord-retry`

Route baru `/api/registration` dan `/api/auth/student-login` **publik** — wajib memakai `rate-limit.ts` (IP + fallback) seperti `/api/auth/verify`. Jangan menambah prefix proteksi ke route ini.

## 4. Layout & shell

| Area | Layout existing | Rencana |
|---|---|---|
| Publik (landing/rekrutmen/tentang/arsip/galeri) | `layout.tsx` root + `Navbar`/`Footer` | Restyle Navbar/Footer ke desain (token baru); struktur layout dipertahankan |
| Form `/daftar` | — | Header ringkas desain (brand + ← KEMBALI) via layout khusus atau inline |
| `/login` | — | Header + kartu login terpusat (desain student-login) |
| `/dashboard` | — | Header dashboard (brand + nama + KELUAR) |
| `/admin` | — | Header ADMIN PANEL + toggle tema (light-mode admin.css) |
| Halaman ujian/absen/hasil | Layout root | Tidak diubah — jangan tarik Navbar baru ke `/ujian` (fokus ujian) |

Catatan: `next.config.mjs` `images.unoptimized: true` — pertahankan dulu (konsisten dengan V1/Vercel), kompresi aset dilakukan di asetnya (WebP).

## 5. Data routing halaman

| Halaman | Sumber data |
|---|---|
| `/`, `/rekrutmen` | `/api/public/recruitment` (status, tanggal, countdown) — fallback statis bila API kosong |
| `/arsip` | Manifest JSON statis (`public/` atau data file) — arsip historis tidak perlu DB |
| `/daftar` | POST `/api/registration` |
| `/dashboard` | `/api/registration/status` + data verifikasi Roblox existing |
| `/galeri` | Manifest JSON (lihat `06`) |
| `/admin` | API admin existing (24 route) |

## 6. Risiko routing

1. `/ujian` existing memakai `NEXT_REDIRECT` (hotfix `4a4b9d6`) — jangan refactor halaman ujian saat redesain; risiko regresi redirect.
2. Route baru jangan memakai path yang bentrok dengan API existing (`/api/registration` tidak ada — aman; `/galeri` tidak ada — aman).
3. `/dashboard` wajib guard: bila belum login student → redirect `/login`; bila belum verifikasi Roblox → tampil status terkunci (lihat dokumen 04/05).
4. SEO/metadata: route baru (`/rekrutmen`, `/tentang`, `/arsip`, `/galeri`) perlu `metadata` export per halaman.
5. `robots`/sitemap: belum ada di V2 — opsional, bukan prioritas fase ini.
