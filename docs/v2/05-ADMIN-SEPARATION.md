# 05 — ADMIN SEPARATION: Pemisahan Admin Panel

Target jangka panjang user: `admin.[CUSTOM_DOMAIN]`. Batasan prompt: jangan membuat aplikasi kedua / monorepo sekarang; rencanakan pemisahan berbasis route/layout vs separate application berdasarkan dependensi & keamanan existing.

## 1. Kondisi admin existing V2 (audit aktual)

**Struktur** — sudah modular rapi:
- UI: `src/app/admin/page.tsx` + `src/components/admin/` (AdminPanel.tsx, BlacklistTab, CandidatesTab, CasisManagement, DiscordMessagesTab).
- API: 24 route di `src/app/api/admin/**` (auth, period, questions, users, blacklist, verdicts, stats, backup, export CSV/PDF, settings/runtime, logs, init, diagnostics, discord, groups, channel-refs, pusdik-notify).
- Auth: `src/lib/admin-auth.ts` — 2 jalur: (a) `x-admin-key` valid + JWT staff (`verifyVerifiedAdminToken` — jose HS256, cek `staffRoleId === STAFF_ROLE_ID`), (b) `verifyAdminKeyAndDiscordStaff(discordUsername)` — validasi via Discord bot API.
- Middleware: `PROTECTED_PREFIXES` melindungi `/api/admin/` (kecuali `EXEMPT_PATHS`: auth/verify-staff, auth/session, init).

**Desain admin (`admin.html`)** — referensi visual:
- Login 2 tahap: stage 1 "Admin Key", stage 2 "Discord Username + Staff Key" (pola yang SUDAH ada di backend V2 — tinggal direpresentasikan ulang).
- Dashboard 8 tab: Ikhtisar (stat cards + pendaftar terbaru + kartu periode), Calon Siswa (search + filter status + verify/reject), Seleksi (proses rows), Putusan (empty state), Bank Soal (setting jumlah MCQ/essay), Rekap Nilai (empty state), Discord (empty state), Audit Log.
- Fitur admin.js demo: backup JSON Blob download, audit log, light-mode toggle, escapeHtml saat render data user.

**Perbandingan fitur desain vs backend existing** — backend V2 LEBIH KAYA dari desain: desain hanya punya subset (verifikasi pendaftar, statistik, backup, audit). Backend existing punya 24 API termasuk export PDF/CSV, blacklist pusdik, runtime settings, diagnostics. Kesimpulan: **redesign visual admin = membungkus API existing dengan shell desain**, bukan membangun fitur baru.

## 2. Perbandingan opsi pemisahan

| Aspek | Route/layout separation (rekomendasi fase ini) | Separate application (target jangka panjang) |
|---|---|---|
| Struktur | `/admin` tetap di app yang sama, layout/admin terpisah | App/deployment kedua (mis. subdomain `admin.`) |
| Auth | Middleware existing sudah isolasi `/api/admin/` | Perlu CORS/allowlist, cookie scope domain, atau token antar-app |
| Database | Langsung pakai Prisma client existing | Perlu connection terpisah atau API gateway |
| Deploy | Satu Vercel project | Project Vercel kedua + custom domain |
| Biaya/risiko | Rendah — tidak ada perubahan infra | Medium — keamanan lintas domain, env terpisah, duplikasi build |
| Kapan | Sekarang | Setelah V2 stabil + ada custom domain |

**Keputusan teknis**: fase ini pakai route/layout separation. Fondasi pemisahan sudah ada (auth terpisah, prefix middleware terpisah, komponen `components/admin/` terisolasi). Jalur termurah ke `admin.` nanti: pindahkan `src/app/admin` + `src/app/api/admin` + `src/components/admin` ke app kedua yang memanggil API yang sama — kontrak API tidak berubah, jadi migrasi nanti bukan rewrite.

## 3. Rencana redesign visual admin

| Elemen desain | Implementasi di V2 |
|---|---|
| Header: brand + label "ADMIN PANEL" + toggle tema ◐ | `components/admin/AdminShell` baru; pertahankan `ui/ThemeToggle` |
| Login 2 tahap (key → discord staff) | Restyle login admin mengikuti `student-login.css` (kartu terpusat, eyebrow gold); alur tetap `x-admin-key` + `verify-staff` existing — JANGAN meniru `ADMIN_KEY`/`STAFF_KEY` hardcoded dari `admin.js` |
| Nav 8 tab | Map ke panel existing: Ikhtisar→stats, Calon Siswa→CandidatesTab/CasisManagement, Seleksi→view informasi (data dari `ExamPeriod`), Putusan→VerdictEntry existing, Bank Soal→questions API existing, Rekap Nilai→results/stats existing, Discord→DiscordMessagesTab existing, Audit Log→`/api/admin/logs` (AdminLog) |
| Stat cards (Total/Menunggu/Terverifikasi/Ditolak) | `/api/admin/stats` existing — cek field yang tersedia; bila belum ada hitungan `Application`, tambah endpoint terpisah |
| Toolbar search + filter status | `CandidatesTab.tsx` existing sudah punya pola search/filter — restyle saja |
| Light-mode | Hanya admin; jangan aktifkan di halaman casis |
| Backup JSON | `/api/admin/backup` existing — pertahankan, restyle tombol |

## 4. Auth admin — rencana ulang (tanpa mock)

Prinsip (permintaan user): jangan memakai mock login desain frontend untuk production.

Kondisi: backend V2 **sudah** server-side (admin key + JWT staff Discord + verifikasi role via bot). Yang direncanakan ulang hanyalah representasi UI + hardening:

1. UI login mengikuti desain 2 tahap (key dulu, lalu verifikasi staff) — memakai endpoint `verify-staff` + `session` existing.
2. `STAFF_ROLE_ID` di `src/middleware.ts` hardcoded — pindahkan ke env/runtime setting (temuan audit baseline, risiko R4/observasi keamanan).
3. `ADMIN_KEY` wajib kuat min 32 char (audit baseline: contoh `.env.example` V1 pernah memuat nilai lemah — di V2 sudah placeholder).
4. Cookie admin `brk_admin_verified` — pastikan `secure`+`httpOnly`+`sameSite` (ikuti pola `auth.ts`).
5. Rate limit login admin (pola `rate-limit.ts`) — belum ada, tambah saat implementasi UI login.
6. Audit log setiap aksi admin (AdminLog existing) — pertahankan; desain punya `bareskrimAuditLog` lokal yang jangan dipakai.

## 5. Risiko pemisahan

1. Subdomain `admin.` butuh custom domain + konfigurasi Vercel + perubahan cookie domain — jangan dijadwalkan sebelum domain siap.
2. CSP `next.config.mjs` berlaku global — bila admin jadi app terpisah, CSP harus dikonfigurasi ulang per app.
3. Export PDF (`pdfkit`) berjalan di serverless existing — saat pindah app, pastikan runtime mendukung (binary Prisma sudah `rhel-openssl-3.0.x`).
4. Jangan mencampur komponen admin baru (desain) dengan komponen casis saat refactor — folder `components/admin/` dipertahankan sebagai batas.
