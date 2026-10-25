# 02 — COMPONENT MAPPING: Desain → Next.js V2

Basis: arsip desain (lihat `01-UI-AUDIT.md`) vs struktur aktual V2 (`src/components/`, `src/app/`, commit `67a79ab`). Tujuan: menentukan apa yang dipakai ulang, direfactor, dibuat baru, dan dipertahankan (business logic).

## 1. Invetaris komponen V2 aktual

```
src/components/
├── admin/       AdminPanel.tsx, BlacklistTab.tsx, CandidatesTab.tsx,
│                CasisManagement.tsx, DiscordMessagesTab.tsx
├── attendance/  AttendanceChecker.tsx
├── casis/       CasisCard.tsx
├── exam/        ExamForm.tsx, MCQQuestion.tsx, EssayQuestion.tsx,
│                CountdownTimer.tsx, TabLock.tsx
├── hasil/       HasilChecker.tsx
├── layout/      Navbar.tsx, Footer.tsx
├── login/       LoginForm.tsx
├── result/      ResultCard.tsx
└── ui/          BackToTop, Badge, Button, Card, ErrorBoundary, Logo,
                 MobileCTA, Skeleton, ThemeToggle, Toast
```

Halaman: `/` (page.tsx), `/absen`, `/ujian`, `/hasil`, `/review/[id]`, `/login`, `/admin`, `/tolak`.

## 2. Pemetaan halaman desain → route Next.js

| Desain (file) | Route V2 | Status | Catatan |
|---|---|---|---|
| `index.html` tab `home` | `/` | Redesign total | Landing baru: hero + recruitment card + intro + education + process + environment + archive preview + final CTA |
| `index.html` tab `recruitment` | `/rekrutmen` | Route BARU | Terpisah (bukan tab/hash) — SEO + App Router idiomatic |
| `index.html` tab `about` | `/tentang` | Route BARU | Filosofi, 3 nilai, journey, closing |
| `index.html` tab `archive` | `/arsip` | Route BARU | Daftar arsip angkatan/gelombang |
| `registration.html` | `/daftar` | Route BARU | Form 3 langkah → API registration |
| `student-login.html` | `/login` | Redesign + perubahan alur | Lihat §5 — mekanisme kredensial berbeda dari V2 existing |
| `student.html` | `/dashboard` | Route BARU | Shell status siswa + timeline |
| `admin.html` | `/admin` | Redesign visual | Pertahankan API existing, ganti shell UI |
| — | `/absen`, `/ujian`, `/hasil`, `/review/[id]`, `/tolak` | Dipertahankan | Tidak ada padanan desain; dipertahankan apa adanya (business logic ujian) |
| — | `/galeri` | Route BARU | Aset `public/galeri-bareskrim/` (lihat `06-GALLERY-PLAN.md`) |

Navigasi desain (`data-tab`) → `next/link` + `NavLink` aktif; hash routing `script.js` dibuang total.

## 3. Kategori komponen

### A. Reusable dari V2 (pakai apa adanya)
| Komponen | Alasan |
|---|---|
| `exam/ExamForm`, `MCQQuestion`, `EssayQuestion`, `TabLock` | Business logic ujian sudah stabil (termasuk hotfix `exam-window`), tidak ada padanan desain — jangan disentuh |
| `exam/CountdownTimer` | Dibutuhkan halaman `/ujian`; pola countdown desain (landing) bisa diturunkan dari pola yang sama |
| `hasil/HasilChecker`, `result/ResultCard` | Alur cek hasil existing tetap |
| `ui/ErrorBoundary`, `ui/Skeleton`, `ui/Toast`, `ui/Badge` | Utilitas lintas halaman, tidak terikat tema lama secara struktural |
| `layout/Navbar`, `layout/Footer` | Struktur direfactor visual (tema desain), hook/navigation pattern dipertahankan |
| `ui/ThemeToggle` | Hanya admin desain yang punya light mode; pertahankan untuk admin |

### B. Perlu refactor visual (struktur dipertahankan, styling/desain ulang)
| Komponen | Refactor |
|---|---|
| `Navbar.tsx` | Susunan desain: brand kiri (logo 42px + 2 baris teks), nav link, tombol LOGIN SISWA kanan; mobile: label disembunyikan |
| `Footer.tsx` | Footer desain: brand + tagline "Disiplin. Integritas. Profesional." + LOGIN ADMIN + copyright |
| `login/LoginForm.tsx` | Desain `student-login.html`: kartu login terpusat, eyebrow gold, input border 1px + fokus gold; TEKS pangkat minimal sudah benar "Bhayangkara Satu" (jangan tertulis ulang) |
| `attendance/AttendanceChecker.tsx` | Restyle ke token desain; logika verifikasi tetap |
| `hasil/HasilChecker.tsx` | Restyle ke token desain |
| `casis/CasisCard.tsx` | Restyle; dipakai admin panel |
| `ui/Button`, `ui/Card`, `ui/Badge`, `ui/Logo`, `ui/MobileCTA`, `ui/BackToTop` | Restyle token: persegi, border 1px, hover `translateY(-1px)` + red-bright, eyebrow uppercase |
| `admin/AdminPanel.tsx` + 4 tab | Redesign shell admin (lihat `05-ADMIN-SEPARATION.md`) |

### C. Komponen baru
| Komponen | Padanan desain | Route |
|---|---|---|
| `landing/Hero`, `landing/RecruitmentCard`, `landing/IntroSection`, `landing/EducationGrid`, `landing/ProcessList`, `landing/EnvironmentSection`, `landing/ArchivePreview`, `landing/FinalCta` | `index.html` tab home | `/` |
| `landing/RecruitmentHero` (countdown), `InformationGrid` (Persyaratan+Tahapan), `ScheduleList`, `RegistrationCta` | tab recruitment | `/rekrutmen` |
| `about/*` (hero, philosophy, principles, journey, closing) | tab about | `/tentang` |
| `archive/*` (hero, record list, note, closing) | tab archive | `/arsip` |
| `registration/RegistrationForm` (3-step), `registration/ProgressSidebar`, `registration/ReviewStep`, `registration/SuccessSection` | `registration.html` | `/daftar` |
| `dashboard/StatusPanel`, `dashboard/Timeline`, `dashboard/ProfileCard`, `dashboard/AnnouncementCard`, `dashboard/InformationCards` | `student.html` | `/dashboard` |
| `galeri/GalleryGrid`, `galeri/CategoryFilter`, `galeri/ImagePreview` | (baru) | `/galeri` |

### D. Dipertahankan karena business logic (jangan diubah perilakunya)
| File | Alasan |
|---|---|
| `src/lib/exam-service.ts`, `exam-window.ts` | Keputusan resume/create/block attempt + submittability — inti aturan ujian |
| `src/lib/grading.ts` | Grading server-side deterministik |
| `src/lib/rate-limit.ts` | Proteksi endpoint (hotfix `clientIp`) |
| `src/lib/auth.ts`, `admin-auth.ts`, `roblox.ts`, `constants.ts`, `runtime-settings.ts` | Auth/session/verifikasi Roblox/override settings |
| `src/middleware.ts` | Proteksi prefix `/api/admin/`, `/api/attendance/list`, `/api/cron/discord-retry` |
| Seluruh `src/app/api/**` | Contract API dipertahankan; desain hanya mengubah konsumen UI |
| `prisma/schema.prisma` + `init-schema.ts` | Basis data existing; penambahan model registrasi = perubahan terpisah (lihat `04-RECRUITMENT-FLOW.md`) |

## 4. Audit perilaku JavaScript desain → rencana penggantian

| Perilaku desain | Pengganti di V2 |
|---|---|
| Hash routing 4 tab (`script.js`) | App Router: route per halaman, `next/link`, `usePathname` untuk NavLink aktif |
| Countdown hardcoded `2026-09-30T23:59:59` | Ambil dari data periode (API `/api/period/active` atau endpoint pendaftaran baru); render client-side seperti `CountdownTimer` |
| Multi-step form + validasi per langkah (`registration.html` inline) | React state (`currentStep`), validasi per langkah di client + **zod di server** saat submit |
| Generate ID/token di browser | Server-side: `POST /api/registration` menghasilkan `registrationId` + `accessToken`, token di-hash sebelum persist |
| `localStorage` sebagai DB (5 key: `bareskrimApplication(s)`, `bareskrimAuditLog`, `bareskrimAdminSession`, `bareskrimStudentSession`) | Tabel Prisma baru (lihat dokumen 04) + API existing; **tidak ada satu pun data bisnis di localStorage** |
| Mock auth admin hardcoded (`admin.js:13-14`) | Auth admin existing V2: `x-admin-key` + JWT staff Discord (`verifyVerifiedAdminToken`, cek `staffRoleId`) — sudah server-side, JANGAN ditiru pola desain |
| Student login ID+token dari localStorage | Endpoint login baru + cookie JWT httpOnly (lihat §5) |
| Backup JSON via Blob download | Sudah ada fitur backup admin V2 (`/api/admin/backup`) — pertahankan |
| `escapeHtml` saat render data user | React escaping bawaan — tidak perlu reimplementasi |
| `window.print()` bukti pendaftaran | CSS `@media print` (registration.css punya polanya) dipertahankan |

## 5. Konflik alur login: desain vs V2 existing — PERLU KEPUTUSAN USER

Desain: student login = **Registration ID + Access Token** (dibuat saat pendaftaran).
V2 existing: login = **username Roblox** → `/api/auth/verify` (cek user, grup `11902409`, blacklist matra, rank Kepolisian `>= 224`) → cookie JWT.

Requirement user: "Formulir Pendaftaran V2 menjadi tahap awal, kemudian dilanjutkan verifikasi Roblox dan sistem ujian existing."

Dua opsi (diputuskan sebelum implementasi login):

- **Opsi 1 (disarankan) — Hybrid**: `/daftar` menghasilkan Registration ID + Access Token (akses dashboard status); verifikasi Roblox tetap terpisah (form username Roblox di dashboard → `/api/auth/verify` existing) sebagai gerbang absen/ujian. Login ID+token hanya membuka dashboard; tanpa verifikasi Roblox, tombol absen/ujian terkunci. Paling sedikit perubahan auth existing (tidak ada perubahan `auth.ts`/middleware), kredensial desain tetap dipakai.
- **Opsi 2 — Token sebagai satu-satunya login**: access token di-hash, login menghasilkan JWT; verifikasi Roblox jadi tahap wajib di dalam dashboard. Butuh tabel sesi baru + perubahan payload JWT (existing JWT membawa `robloxId` — user yang belum diverifikasi Roblox belum punya `User` row).

Risiko Opsi 2: seluruh endpoint existing (`/api/attendance/*`, `/api/exam/*`) mengasumsikan cookie JWT dengan `robloxId` valid — perlu audit menyeluruh middleware + route.

## 6. Temuan risiko mapping

1. `page.tsx` landing V2 existing akan ditulis ulang total — pastikan komponen lama (`MobileCTA`, `BackToTop`) tetap terpakai agar perilaku mobile tidak hilang.
2. CSP `next.config.mjs` (`connect-src 'self' https://api.roblox.com ...`) — route baru tidak butuh domain tambahan; font Google sudah diizinkan (`fonts.googleapis.com`).
3. Gambar desain 1,5–1,9 MB PNG — kompres ke WebP sebelum masuk `public/`; jangan naikkan mentah.
4. `admin.css` light-mode hanya di admin — pastikan Tailwind dark-mode strategy V2 tidak mengaktifkan light mode di halaman casis.
5. Status string desain (`MENUNGGU VERIFIKASI` dll.) harus dipetakan ke status baru tanpa memutus filter/counting admin existing.
