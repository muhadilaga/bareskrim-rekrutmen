# 🛡️ PUSDIK RESERSE BARESKRIM POLRI — Sistem Rekrutmen & Portal Casis V2

Sistem portal seleksi dan evaluasi calon siswa (casis) Pusdik Reserse Bareskrim Polri Roblox Community. Dibangun dengan **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Prisma ORM**, dan **PostgreSQL (Supabase PgBouncer)**. Mengusung identitas visual prestisius Pusdik Reserse (**Midnight Navy & Pure Gold/Brass**) dengan arsitektur terisolasi antara portal publik, portal casis mandiri, dan panel instruktur/admin.

---

## ✨ Fitur Utama V2

| Fitur | Keterangan & Arsitektur |
|---|---|
| 🎨 **Identitas Visual Pusdik Reserse** | Desain dark editorial premium dengan palet Navy (`#070b12`), Accent Gold (`#d4af37`), dan tipografi *Cinzel* + *Outfit* + *JetBrains Mono*. Bebas dari palet crimson/merah legacy. |
| 📋 **Portal Casis Mandiri (`/dashboard`)** | Portal presensi apel dan pengecekan hasil seleksi mandiri tanpa ketergantungan OAuth login Roblox. Casis dapat input kehadiran apel dan memeriksa apakah status sudah diverifikasi instruktur serta memperoleh role tahap akademik. |
| 🛡️ **Pemisahan Panel Admin (`/admin`)** | Halaman admin sepenuhnya terpisah dari rute casis guna mencegah kebocoran otorisasi. Dilindungi autentikasi sesi admin independen (`AUTH_COOKIE_NAME` + `ADMIN_KEY` / verifikasi Discord Staff Pusdik). |
| ⚙️ **Konfigurasi Konten Dinamis** | Seluruh detail teks landing page, pengumuman, tahapan timeline seleksi (`/rekrutmen`), kuota angkatan, dan batas waktu periode dapat dikonfigurasi langsung dari Admin Panel tanpa restart server. |
| 📝 **Ujian Online & Auto-Grading** | Bank soal terisi 20 Pilihan Ganda (4 poin) + 5 Esai (4 poin) = 100 poin. Kunci jawaban dan kata kunci esai tersimpan aman di server (anti-cheat client-side). Dilengkapi fitur *tab-lock monitor*. |
| 🖼️ **Galeri Dokumentasi & Arsip** | Halaman `/galeri` untuk dokumentasi kegiatan Pusdik Reserse dan `/arsip` untuk rekam jejak lulusan angkatan sebelumnya. |
| 📊 **Verifikasi Presensi Instruktur** | Instruktur dapat memvalidasi kehadiran casis, mengubah status presensi (`APPROVED`/`PENDING`/`REJECTED`), dan menentukan kelayakan role tahap akademik casis. |
| 🔒 **Security Hardened & Trust Boundary** | Melewati audit keamanan ketat: pencegahan query injection pada 50 raw SQL queries, proteksi 51 route handlers `/api/admin/*`, dan isolasi token sesi pada endpoint pengecekan presensi publik. |
| 🚀 **Optimal untuk Vercel & Supabase** | Konfigurasi runtime serverless-ready, bypass bootstrap skema otomatis di produksi, serta kompatibel dengan PostgreSQL connection pooler (port 6543). |

---

## 🏗️ Tech Stack

- **Framework:** Next.js 14.2 (App Router) + React 18
- **Bahasa:** TypeScript 5
- **Database & ORM:** PostgreSQL + Prisma ORM 5
- **Styling:** CSS Modules / Vanilla CSS Scoped (`casis.css`, `admin.css`, `landing.css`) + Tailwind CSS
- **Autentikasi & Enkripsi:** JOSE (JWT) dengan cookie HTTP-only terisolasi
- **Validasi Data:** Zod Schema Validation
- **Testing:** Vitest (51+ Test Suites, >780 Unit & Integration Tests)
- **Deployment Platform:** Vercel (Produksi) / PostgreSQL via Supabase Pooler

---

## 📁 Struktur Rute & Direktori

```
bareskrim-rekrutmen-v2/
├── prisma/
│   ├── schema.prisma              # Skema 14 model database PostgreSQL
│   └── seed.ts                    # Seeder bank soal MCQ, Esai, dan periode seleksi
├── public/
│   ├── galeri-bareskrim/          # Aset dokumentasi foto kegiatan Pusdik
│   └── lambang-polri-gold.png     # Lambang resmi Pusdik Reserse
└── src/
    ├── app/
    │   ├── (landing)/             # Rute publik (Beranda, Rekrutmen, Galeri, Arsip, Tentang)
    │   │   ├── page.tsx           # Beranda resmi Pusdik Reserse
    │   │   ├── rekrutmen/page.tsx # Jadwal, persyaratan & countdown seleksi
    │   │   ├── galeri/page.tsx    # Dokumentasi visual kegiatan Pusdik
    │   │   └── arsip/page.tsx     # Arsip angkatan & riwayat kelulusan
    │   ├── (casis)/               # Rute portal siswa
    │   │   └── dashboard/page.tsx # Form presensi & cek hasil verifikasi akademik
    │   ├── (app)/                 # Rute pelaksanaan ujian casis
    │   │   ├── ujian/page.tsx     # Ruang ujian & pengerjaan 25 butir soal
    │   │   ├── hasil/page.tsx     # Rekap perolehan skor & status kelulusan
    │   │   ├── review/[id]/       # Peninjauan jawaban pasca ujian
    │   │   └── tolak/page.tsx     # Halaman penolakan akses
    │   ├── admin/                 # Panel komando instruktur & administrator
    │   │   ├── page.tsx           # Dashboard admin, verifikasi presensi & konten
    │   │   └── layout.tsx         # Isolasi layout & theme khusus admin
    │   └── api/                   # Route handlers backend
    │       ├── admin/             # API pengelolaan casis, soal, periode, dan audit
    │       ├── attendance/        # API submit & check presensi casis
    │       ├── exam/              # API sesi ujian, simpan progres & auto-grade
    │       └── auth/logout/       # Endpoint pembersihan cookie & session
    ├── components/
    │   ├── admin/                 # Komponen manajemen admin & pengaturan dinamis
    │   ├── attendance/            # Komponen form presensi & status verifikasi casis
    │   ├── exam/                  # Form butir soal, tab lock, timer countdown
    │   ├── galeri/                # Komponen viewer dokumentasi foto
    │   └── landing/               # Komponen navbar, hero, timeline, dan footer V2
    ├── lib/
    │   ├── auth.ts                # Token signing & session verification
    │   ├── exam-service.ts        # Engine sesi ujian & grading deterministik
    │   ├── prisma.ts              # Prisma Client instance
    │   └── site-content.ts        # Helper pembacaan konfigurasi konten dinamis
    └── styles/
        ├── admin.css              # Token visual & layout panel admin
        ├── casis.css              # Token visual portal casis & ruang ujian
        └── landing.css            # Styling beranda, jadwal rekrutmen, dan galeri
```

---

## 🚀 Panduan Instalasi Lokal

### 1. Prasyarat Sistem
- **Node.js:** Versi `>= 18.18.0` atau `20.x`
- **Package Manager:** `npm` (atau `pnpm` / `bun`)
- **Database:** PostgreSQL (Lokal atau Cloud seperti Supabase)

### 2. Langkah Setup
```bash
# 1. Masuk ke direktori proyek
cd bareskrim-rekrutmen-v2

# 2. Pasang dependensi
npm install

# 3. Konfigurasi Environment Variables
cp .env.example .env
# Sesuaikan isi DATABASE_URL, DIRECT_URL, JWT_SECRET, dan ADMIN_KEY

# 4. Sinkronisasi Skema Database & Generate Client
npx prisma generate
npx prisma db push

# 5. Seeding Bank Soal & Periode Angkatan Pertama
npm run db:seed

# 6. Jalankan Server Development
npm run dev
# Buka http://localhost:3000 pada browser
```

---

## 🧪 Pengujian & Verifikasi Kualitas

Seluruh fungsionalitas dan aspek keamanan diuji secara otomatis:

```bash
# Menjalankan seluruh test suite Vitest
npm test

# Menjalankan type-checking TypeScript
npm run typecheck

# Menjalankan linting ESLint
npm run lint

# Kompilasi build produksi Next.js
npm run build
```

---

## 🛡️ Catatan Penting Deployment Produksi (Vercel)

1. **Database Connection Pooler:**
   - Gunakan `DATABASE_URL` dengan Supabase PgBouncer (Transaction Mode) pada port **`6543`** untuk menangani concurrency koneksi serverless.
   - Gunakan `DIRECT_URL` pada port **`5432`** khusus untuk operasi migrasi / schema push.
2. **Environment Variables Wajib di Vercel:**
   - `DATABASE_URL`: Connection string PostgreSQL pooler.
   - `DIRECT_URL`: Connection string PostgreSQL langsung.
   - `JWT_SECRET`: Kunci rahasia enkripsi token sesi admin.
   - `ADMIN_KEY`: Kunci sandi instruktur/admin untuk login pertama kali.
   - `NEXT_PUBLIC_APP_URL`: Domain resmi website (contoh: `https://rekrutmen-bareskrim.org`).
3. **Custom Domain:**
   - Tambahkan custom domain melalui dashboard Vercel (**Settings > Domains**), lalu arahkan CNAME/A record DNS sesuai instruksi Vercel.

---

## 📄 Lisensi & Hak Cipta

Proyek ini dikembangkan khusus untuk keperluan seleksi dan komunitas **Pusdik Reserse Bareskrim Polri Roblox Roleplay**. Seluruh lambang, atribut, dan materi grafis kepolisian digunakan dalam koridor simulasi komunitas bermain peran dan tidak untuk tujuan penipuan atau komersialisasi di luar ketentuan.
