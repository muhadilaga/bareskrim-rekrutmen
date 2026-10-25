# TASK 03D — PRISMA MIGRATION STRATEGY

Dokumen ini merencanakan transisi Bareskrim Rekrutmen V2 ke **Prisma Migrate** sebagai satu-satunya sistem pengelolaan skema database development.

**Keputusan arsitektur (user, TASK 03D):** Opsi A — Prisma Migrate.

**Mode dokumen:** PLAN ONLY. Tidak ada `prisma migrate`, `db push`, `reset`, `seed`, atau koneksi database yang dijalankan pada tahap ini.

**Target database:** project Supabase baru `bareskrim-rekrutmen-v2-dev` (Singapore). Bukan V1. Bukan production.

---

## 1. Sumber Utama Skema

| Peran | Path | Status |
|---|---|---|
| **Sumber kebenaran V2** | `prisma/schema.prisma` | Aktif — 6 enum + 14 model |
| **Jalur lama (SQL idempoten)** | `prisma/init.sql` | Warisan V1 — **tidak lengkap** vs schema.prisma |
| **Jalur lama (runtime)** | `src/lib/init-schema.ts` (`initSchema` / `ensureSchema`) | Warisan V1 — **tidak lengkap**; dipanggil dari banyak endpoint |
| **Riwayat Prisma Migrate** | `prisma/migrations/` | **Belum ada** |
| **Seed** | `prisma/seed.ts` | Bank soal + `ExamPeriod` saja; **belum** `RecruitmentPeriod` |

Initial migration **wajib mencakup seluruh** enum dan model di `schema.prisma`, bukan subset Application/RecruitmentPeriod.

### Inventaris lengkap (`schema.prisma`)

**Enum (6):** `QuestionType`, `AttemptStatus`, `BlacklistCategory`, `ApplicationStatus`, `Gender`, `VerdictStatus`.

**Model (15):** `User`, `ExamPeriod`, `Question`, `ExamAttempt`, `ExamAnswer`, `ExamResult`, `BlacklistEntry`, `VerdictEntry`, `Attendance`, `AdminLog`, `StudentActionLog`, `PendingDiscordReport`, `RecruitmentPeriod`, `Application`, `RuntimeSetting` (ditambahkan TASK 03G.1).

---

## 2. Audit Jalur Schema Existing

### 2.1 Gap `init.sql` vs `schema.prisma`

`prisma/init.sql` (162 baris) hanya membuat:

- Enum: `QuestionType`, `AttemptStatus`, `BlacklistCategory`, `VerdictStatus`
- Tabel: `User`, `ExamPeriod`, `Question`, `ExamAttempt`, `ExamAnswer`, `ExamResult`, `BlacklistEntry`, `VerdictEntry`

**Tidak ada di init.sql:**

- Enum `ApplicationStatus`, `Gender`
- Tabel `Attendance`, `AdminLog`, `StudentActionLog`, `PendingDiscordReport`, `RecruitmentPeriod`, `Application`

### 2.2 Gap `init-schema.ts` vs `schema.prisma`

`src/lib/init-schema.ts` membuat 11 tabel (lebih lengkap dari init.sql):

- Sama dengan init.sql **plus** `AdminLog`, `PendingDiscordReport`, `Attendance`

**Tidak ada di init-schema.ts:**

- Enum `ApplicationStatus`, `Gender`
- Tabel `StudentActionLog`, `RecruitmentPeriod`, `Application`

`schemaExists()` hanya memeriksa keberadaan `ExamResult`, `BlacklistEntry`, `VerdictEntry`, `Attendance` plus beberapa kolom `User` / `ExamPeriod` / `ExamResult` / `Attendance`. **Tidak memeriksa** `Application` atau `RecruitmentPeriod`. Konsekuensi: setelah skema ujian lama dianggap “siap”, `ensureSchema()` **tidak akan pernah** membuat tabel pendaftaran.

### 2.3 Dependensi `ensureSchema()` / `initSchema()`

Panggilan aktif (jangan dihapus sebelum transisi selesai):

| File | Fungsi |
|---|---|
| `src/lib/init-schema.ts` | definisi `initSchema`, `ensureSchema`, `schemaExists` |
| `src/app/api/admin/init/route.ts` | `GET`/`POST` inisialisasi admin (memakai `initSchema` langsung) |
| `src/app/api/admin/backup/route.ts` | `ensureSchema()` |
| `src/app/api/admin/candidates/route.ts` | 2× |
| `src/app/api/admin/discord-retry/route.ts` | 2× |
| `src/app/api/admin/export/[kind]/route.ts` | 1× |
| `src/app/api/admin/questions/route.ts` | 1× |
| `src/app/api/admin/users/route.ts` | 1× |
| `src/app/api/attendance/list/route.ts` | 1× |
| `src/app/api/attendance/verify/route.ts` | 1× |
| `src/app/api/auth/verify/route.ts` | 1× |
| `src/app/api/cron/discord-retry/route.ts` | 1× |
| `src/app/api/exam/report/route.ts` | 1× |
| `src/app/api/hasil/route.ts` | 1× |
| `src/app/api/period/active/route.ts` | 1× |
| `src/lib/exam-service.ts` | 2× (`ensureSchema` sebelum alur ujian) |

**Total:** 1 definisi + 1 endpoint admin init + 16 call site di backend (termasuk 2 di `exam-service.ts`).

> **Catatan keamanan:** pemanggilan `ensureSchema()` di `/api/hasil` **bukan** berarti route publik. Sejak TASK 03L.2E.4.4/4.5 endpoint memerlukan sesi Roblox terverifikasi dan hanya mengembalikan hasil milik user dari sesi (ownership terikat `user.id`); user soft-deleted ditolak `403` sebelum query, dan tidak ada lagi pencarian username publik. Baris tabel di atas hanya mencatatkan call site, bukan kontrak akses.

`prisma/init.sql` tidak di-import oleh TypeScript. Dipakai sebagai skrip SQL Editor / dokumentasi bootstrap V1.

### 2.4 Konflik jika dua jalur hidup bersamaan

| Skenario | Akibat |
|---|---|
| `ensureSchema()` jalan dulu di DB kosong, lalu `prisma migrate dev` | Prisma melihat tabel existing tanpa `_prisma_migrations` → **P3005** / drift. Migrasi gagal atau membuat baseline yang tidak sesuai schema.prisma (tabel Application belum ada). |
| `prisma migrate` jalan dulu, lalu `ensureSchema()` | `schemaExists()` bisa true (tabel ujian ada) → `ensureSchema` no-op. Relatif aman **hanya jika** migrate sudah lengkap. Tetap berbahaya jika admin menekan `/api/admin/init` (`initSchema` selalu `$executeRawUnsafe` seluruh statement — `CREATE TABLE IF NOT EXISTS` biasanya no-op, tetapi enum/`CREATE TYPE` dan index bisa bentrok dengan objek yang sudah dibuat Prisma). |
| `init.sql` dijalankan manual di SQL Editor Supabase, lalu migrate | Sama seperti baris 1: drift, history Prisma kosong. |
| Kedua jalur terus dipakai di production V2 | Dua sumber kebenaran. Perubahan schema.prisma tidak otomatis masuk init-schema.ts. Bug “tabel Application tidak pernah dibuat” sudah terbukti dari gap di atas. |

**Kesimpulan audit:** dua jalur **tidak boleh** hidup bersamaan sebagai penulis skema. Prisma Migrate menjadi penulis tunggal. `init.sql` dan `init-schema.ts` **tidak dihapus** pada tahap ini; dinonaktifkan secara terencana setelah migrasi pertama sukses.

---

## 3. Strategi Transisi (Satu Penulis Skema)

Urutan yang disetujui untuk TASK berikutnya (setelah approval + DB dev tersedia):

1. **Baseline kosong.** Database `bareskrim-rekrutmen-v2-dev` harus **benar-benar kosong** (tidak ada tabel public, tidak ada enum). Jangan restore dump V1.
2. **Initial migration penuh.** `prisma migrate dev --name init_v2_baseline` dari `schema.prisma` utuh. Hasil: folder `prisma/migrations/<timestamp>_init_v2_baseline/` + tabel `_prisma_migrations`.
3. **Guard runtime (setelah migrate sukses, TASK terpisah).** Ubah `ensureSchema()` menjadi:
   - cek tabel `_prisma_migrations` / `schemaExists` yang baru;
   - jika history Prisma ada → **return segera**, jangan `$executeRawUnsafe`;
   - jika history tidak ada di production/dev yang seharusnya sudah di-migrate → **throw** (fail-closed), jangan silently `initSchema()`.
4. **Endpoint `/api/admin/init`.** Setelah guard: `POST` menolak inisialisasi SQL idempoten; merespons bahwa skema dikelola Prisma Migrate. `GET` boleh tetap melaporkan “initialized” berdasarkan `_prisma_migrations`.
5. **Arsip, jangan hapus.** `prisma/init.sql` dan `src/lib/init-schema.ts` tetap di repo sebagai referensi V1 / rollback dokumentasi sampai semua 16 call site memakai guard no-op dan diuji. Penghapusan file = TASK terpisah setelah verifikasi.
6. **Jangan `db push`.** `package.json` masih punya `"db:push": "prisma db push"` — dilarang di V2-dev setelah keputusan Opsi A. `db push` tidak menulis history migrasi.

V1 (`D:\bareskrim-rekrutmen`) **tidak** diubah dan **tidak** menerima migration V2.

---

## 4. Rencana Initial Migration (Database Kosong)

### Cakupan satu file migrasi `init_v2_baseline`

Prisma men-generate SQL untuk **seluruh** objek di schema.prisma (baseline final TASK 03G.1: 15 tabel):

1. Enum: `QuestionType`, `AttemptStatus`, `BlacklistCategory`, `ApplicationStatus`, `Gender`, `VerdictStatus`
2. Tabel independen: `User`, `ExamPeriod`, `Question`, `BlacklistEntry`, `VerdictEntry`, `AdminLog`, `StudentActionLog`, `PendingDiscordReport`, `RecruitmentPeriod`, `RuntimeSetting`
3. Tabel bertingkat: `ExamAttempt` → `ExamAnswer`, `ExamResult`; `Attendance`; `Application` (FK ke `RecruitmentPeriod` wajib, FK ke `User` opsional `ON DELETE SET NULL`)

Unique / index penting yang ikut tercipta:

- `User.robloxId`, `User.username`
- `ExamPeriod.seed`
- `ExamAttempt.attemptKey`, `@@unique([periodId, userId])`
- `Application.registrationId`, `Application.accessTokenHash`
- `Application @@unique([recruitmentPeriodId, robloxUsernameKey])` — satu Roblox per periode, race-safe

### Pemeriksaan kesesuaian (preflight, sudah dilakukan tanpa DB)

- `npx prisma validate` dengan `DATABASE_URL` placeholder: **PASS** (TASK 03B.2).
- Relasi `Application.user` opsional, tidak memaksa tabel User kedua.
- `ExamPeriod` tidak diubah kontrak; `RecruitmentPeriod` terpisah.

### Yang **tidak** masuk initial migration

- Data seed (soal, periode ujian, periode pendaftaran) — langkah terpisah setelah migrate.
- Perubahan generator Registration ID — kode, bukan DDL. Direncanakan di bagian 5; dieksekusi **sebelum** migrate jika disetujui, agar test + schema komentar selaras, tetapi tidak mengubah DDL (`registrationId` tetap `String @unique`).

---

## 5. Registration ID — Perluasan (DIIMPLEMENTASIKAN di TASK 03F)

### Kondisi sekarang (kode, belum diubah pada TASK 03D)

```
{RecruitmentPeriod.code}-{4 digit}
contoh visual: XLI-02-8492
ruang: 1000–9999 = 9.000 nilai
generator: crypto.randomBytes(2) + rejection sampling
constraint: Application.registrationId @unique
retry API: 3× pada P2002 registrationId
```

Peluang collision ≈ n²/(2×9000). Untuk 100 pendaftar ~0,56%; untuk 500 ~1,4%. Masih ditangani retry, tetapi rapat untuk gelombang besar.

### Usulan (minimal 6 karakter, crypto-secure)

| Aspek | Nilai usulan |
|---|---|
| Format | `{code}-{XXXXXX}` — 6 karakter dari alphabet yang sama dengan access token: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (tanpa 0/O/1/I) |
| Contoh visual | `XLI-02-K8M2N4` (bukan nilai nyata) |
| Entropi | 6 × 5 bit = **30 bit** (~1,07 miliar ruang). Bukan kredensial; cukup sebagai ID publik. |
| Prefix | Dinamis dari `RecruitmentPeriod.code` (sudah dipasang di API) |
| Generator | `crypto.randomBytes` + packing base32 (pola yang sama dengan `generateRawAccessToken`, panjang 6). **Tanpa `Math.random`.** |
| Unique | Tetap `registrationId String @unique` — tidak perlu ubah Prisma DDL |
| Collision | Retry 3× + P2002 tetap. Peluang praktis nol pada skala ribuan. |
| Access token | **Tidak diubah** (tetap 160 bit, 8 grup × 4). ID dan token tetap fungsi terpisah. |

Alasan menolak 6 **digit** murni: 1.000.000 ruang lebih baik dari 9.000, tetapi 6 karakter base32 memberi ruang ~1000× lebih besar dengan panjang tampilan sama, dan konsisten dengan gaya visual token.

**TASK 03D tidak mengimplementasikan generator baru.** Perubahan kode `generateRegistrationId` + unit test menunggu approval terpisah (bisa digabung dengan TASK eksekusi migrasi).

---

## 6. Rencana Seed Development (Setelah Migrasi)

`prisma/seed.ts` saat ini:

- `deleteMany` pada `ExamResult`, `ExamAttempt`, `Question`, `ExamPeriod` (berbahaya jika salah sasaran DB)
- membuat bank soal + satu `ExamPeriod` aktif
- **tidak** membuat `RecruitmentPeriod`

Rencana seed V2-dev (eksekusi **hanya** setelah migrate sukses + URL terverifikasi):

1. Guard di `seed.ts`: tolak jalan jika `DATABASE_URL` mengandung host V1 / tidak mengandung penanda dev yang disepakati / `NODE_ENV=production`.
2. Tambah `RecruitmentPeriod`:
   - `code`: `"XLI-02"`
   - `name`: `"Angkatan XLI Gelombang 02"`
   - `isActive`: `true`
   - `openedAt`: sekarang − 1 hari
   - `closedAt`: sekarang + 30 hari (atau jendela yang Anda tetapkan)
3. Pertahankan seed bank soal + `ExamPeriod` untuk alur ujian existing di V2-dev.
4. Jangan seed `Application` palsu.

Tanpa baris (2), `POST /api/applications` akan selalu `403` “Pendaftaran tidak sedang dibuka”.

---

## 7. Verifikasi Target `DATABASE_URL` (Sebelum Perintah Berbahaya)

Checklist **wajib** (manual, oleh operator) sebelum `migrate` / `seed`:

1. File `.env` ada di root V2, **tidak** di-commit.
2. `DATABASE_URL` host = project `bareskrim-rekrutmen-v2-dev` (Supabase Singapore), **bukan** project V1.
3. Bandingkan host dengan `.env.example` (hanya placeholder localhost) — URL nyata tidak boleh tertinggal di git.
4. `npx prisma migrate status` (setelah approval) harus menunjuk DB kosong / “Database schema is not in sync” pada DB baru, bukan DB berisi data ujian production.
5. Fail-closed `src/lib/prisma.ts`: production menolak placeholder; development boleh placeholder sampai URL diisi.

Tidak ada koneksi yang dijalankan pada TASK 03D.

---

## 8. Rollback & Pemulihan Development

Karena target adalah **database kosong milik V2-dev**:

| Situasi | Tindakan |
|---|---|
| Migrasi gagal di tengah | `prisma migrate resolve` / perbaiki SQL di folder migration **hanya jika belum applied**. Jika applied sebagian: drop schema public di **V2-dev saja**, ulangi migrate. |
| Seed salah | `deleteMany` terbatas pada tabel yang di-seed; jangan `migrate reset` di sembarang URL. |
| Salah URL (terhubung V1) | **STOP.** Jangan rollback. Putuskan proses. Rotasi kredensial V1 jika ada write. Ini skenario yang harus dicegah oleh checklist bagian 7. |
| Ingin ulang dari nol di V2-dev | Dashboard Supabase → SQL `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` lalu `prisma migrate deploy` / `migrate dev`. Hanya di project dev. |

Production V1: **bukan** target rollback V2. Tidak ada `migrate resolve` ke V1.

---

## 9. Integration Test `POST /api/applications` (Setelah DB + Seed)

Urutan bukti (semua **BLOCKED** sampai DB ada):

1. Unit test existing (57) tetap hijau tanpa DB.
2. `POST` payload valid + periode aktif → `201`, `registrationId` sesuai format baru (setelah generator 6 karakter disetujui), `accessToken` ada, hash di DB = SHA-256(raw), raw **tidak** di kolom manapun.
3. Submit duplikat `robloxUsername` (beda kapital) → `409`.
4. Periode `closedAt` di masa lalu / `isActive=false` → `403`.
5. Body > 10 KB → `413`; Origin beda host → `403`.
6. Playwright `/daftar`: layar sukses **hanya** setelah 201; 0 `localStorage`.

---

## 10. Prasyarat Sebelum Migration (Gate)

- [ ] Project Supabase `bareskrim-rekrutmen-v2-dev` region Singapore sudah dibuat **oleh user**.
- [ ] `.env` V2 berisi `DATABASE_URL` project itu (bukan V1, bukan placeholder yang menyerupai host nyata palsu).
- [ ] Operator mengonfirmasi host URL secara lisan/tulisan sebelum perintah dijalankan.
- [ ] Approval eksplisit untuk: (a) `prisma migrate dev`, (b) perubahan generator Registration ID 6 karakter, (c) seed `RecruitmentPeriod`.
- [ ] Tidak ada proses yang memegang `query_engine-windows.dll.node` (hentikan `next dev` sebelum `prisma generate` / migrate di Windows).
- [ ] V1 freeze tetap: tidak commit/push/deploy/migrate ke `D:\bareskrim-rekrutmen`.

---

## 11. Daftar Perintah yang Menunggu Approval

**Jangan dijalankan sekarang.** Setelah gate bagian 10:

```bash
# 0. Hentikan next dev (Windows file lock Prisma)
# 1. Pastikan cwd = D:\Dev\Projects\bareskrim-rekrutmen-v2
# 2. Pastikan .env DATABASE_URL = project bareskrim-rekrutmen-v2-dev

npx prisma validate
npx prisma migrate status
npx prisma migrate dev --name init_v2_baseline
npx prisma generate
npx prisma db seed          # HANYA setelah seed.ts di-guard + RecruitmentPeriod ditambah
npm run typecheck
npm run lint
npm run test
```

Perintah yang **tetap dilarang** meski setelah approval migrasi dev, kecuali ada approval terpisah: `prisma db push`, `prisma migrate reset`, `prisma migrate deploy` ke host non-dev, segala koneksi ke V1.

---

## 12. Risiko yang Masih Terbuka

| # | Risiko | Mitigasi |
|---|---|---|
| 1 | `ensureSchema` menulis skema parsial sebelum/sesudah migrate | Guard no-op setelah baseline; jangan hapus file dulu |
| 2 | `/api/admin/init` tetap bisa `initSchema()` | Ubah respons setelah migrate; sampai saat itu jangan klik tombol init di V2-dev |
| 3 | `db:push` masih ada di package.json | Kebijakan: jangan pakai; hapus script = TASK terpisah |
| 4 | `seed.ts` `deleteMany` tanpa guard URL | Tambah guard sebelum seed pertama |
| 5 | Registration ID 4 digit rapat di gelombang besar | Perluasan 6 karakter — menunggu approval implementasi |
| 6 | Salah isi `DATABASE_URL` V1 | Checklist host + fail-closed; tidak ada migrate otomatis |
| 7 | `schemaExists()` false-negative/positive vs tabel Application | Setelah migrate, ganti deteksi ke `_prisma_migrations` |

---

**Status TASK 03D:** dokumentasi selesai. Tidak ada perubahan skema runtime, tidak ada koneksi database, tidak ada credential yang dibaca.

---

## 13. TASK 03E — Supabase Connection & Migration Execution Preflight

### 13.1 Arsitektur Koneksi (Dua Environment Variable)

Prisma 5.22.0 (CLI + client) dipertahankan. Perubahan yang sudah dilakukan (static, tanpa DB):

- `prisma/schema.prisma` — datasource: `url = env("DATABASE_URL")` + `directUrl = env("DIRECT_URL")`.
- `.env.example` — placeholder `DATABASE_URL` (Transaction Pooler, port 6543) dan `DIRECT_URL` (Session Pooler / Direct, port 5432). Placeholder — bukan credential nyata.
- `src/lib/prisma.ts` — komentar arsitektur; guard fail-closed tetap pada `DATABASE_URL` saja (runtime PrismaClient tidak membaca `DIRECT_URL`).

| Variable | Jalur Supabase | Pemakai |
|---|---|---|
| `DATABASE_URL` | Transaction Pooler (port 6543) | Runtime aplikasi (PrismaClient) |
| `DIRECT_URL` | Session Pooler atau Direct Connection (port 5432) | Prisma Migrate / schema engine |

Aturan: kedua URL menunjuk ke project **yang sama** — `bareskrim-rekrutmen-v2-dev`. Credential tidak dicetak di terminal/laporan; operator menyalin dari Dashboard Supabase → Settings → Database.

### 13.2 Metode Pooler yang Dibutuhkan

- **Runtime**: Transaction Pooler (port 6543) — sesuai pola serverless Next.js (banyak koneksi pendek).
- **Migrate**: Session Pooler atau Direct (port 5432) — Prisma Migrate butuh sesi penuh / DDL transaksi; transaction pooler tidak cocok untuk schema engine.
- Supabase hosted: `sslmode=require` menyertai keduanya; connection string bawaan Dashboard sudah mencakup parameter ini.

### 13.3 Strategi Migration Kompatibel Supabase (Shadow Database Dihindari)

`prisma migrate dev` pada Postgres hosted **membuat shadow database** (schema terpisah di host yang sama). Di Supabase hosted:

- Project baru **tidak** mengizinkan `CREATE DATABASE` untuk role `postgres` biasa → `migrate dev` sering gagal pada tahap shadow database.
- Menyiapkan shadow database secara manual di project mana pun merepotkan dan mudah salah target.

**Risiko shadow database**: (1) gagal provisioning di Supabase hosted, (2) drift false-positive bila shadow terisi dari dump, (3) operator salah menunjuk `shadowDatabaseUrl` ke project lain / V1.

**Rekomendasi (pendekatan utama):** migration SQL yang **ditinjau dahulu**, lalu deploy via Prisma Migrate:

1. Generate SQL tanpa menyentuh remote DB:
   ```bash
   npx prisma migrate diff \
     --from-empty \
     --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/20261002000000_init_v2_baseline/migration.sql
   ```
2. **Tinjau manual** seluruh `migration.sql` (14 model, 6 enum, FK, unique index).
3. Deploy ke `bareskrim-rekrutmen-v2-dev` (memakai `DIRECT_URL`):
   ```bash
   npx prisma migrate deploy
   ```
   `migrate deploy` **tidak** memakai shadow database — aman untuk Supabase hosted.
4. Verifikasi: `npx prisma migrate status` + `npx prisma generate`.

Fallback di masa depan jika shadow tetap diinginkan: `shadowDatabaseUrl` ke **project Supabase terpisah khusus dev-shadow** — tidak pernah ke V1. Saat ini tidak diperlukan.

### 13.4 Pemeriksaan Kesesuaian Model/Enum (Preflight Statis)

**TASK 03F + 03G.1:** `migration.sql` untuk `init_v2_baseline` **sudah final** di `prisma/migrations/20261002000000_init_v2_baseline/migration.sql` + `migration_lock.toml`. Struktur final: **15 tabel, 6 enum, 15 PK, 9 FK, 13 unique index, 40 index**. Regenerasi konsisten (`migrate diff --from-empty` == file final). Belum dieksekusi ke database mana pun.

- `npx prisma validate` (placeholder `DATABASE_URL` + `DIRECT_URL`): **PASS**.
- Cakupan `init_v2_baseline` dari schema.prisma utuh: 6 enum + 14 model (inventaris bagian 1). FK `Application.recruitmentPeriodId` wajib, `Application.userId` opsional `SET NULL` — urutan CREATE ditangani Prisma.
- Unique/index ikut ter-generate: `Application.registrationId`, `Application.accessTokenHash`, `@@unique([recruitmentPeriodId, robloxUsernameKey])`, `User.robloxId/username`, `ExamPeriod.seed`, `ExamAttempt` unique pair.
- `prisma migrate dev --create-only` (dianggap bagian approval di 13.8) dapat dipakai sebagai alternatif generate SQL tanpa shadow database — tetapi tetap butuh `DATABASE_URL` valid; `migrate diff --from-empty` lebih ringan karena tanpa koneksi sama sekali.

### 13.5 Status `.env` Development — BLOCKED

Pemeriksaan isi file `.env` di workspace **tidak dilakukan** (operator menolak pembacaan credential; permintaan tidak diulang). Status:

- Ketersediaan `.env` berisi `DATABASE_URL` + `DIRECT_URL` project `bareskrim-rekrutmen-v2-dev`: **BLOCKED — konfirmasi operator**.
- Tidak ada pengambilan kredensial dari project lain (termasuk V1).

### 13.6 Transisi `ensureSchema()` — DIIMPLEMENTASIKAN di TASK 03G

- `src/lib/init-schema.ts` dirombak: `ensureSchema()` kini **read-only** — memverifikasi 14 tabel + kolom kritis `Application`/`RecruitmentPeriod` via `information_schema`. Bila belum lengkap → throw `SCHEMA_NOT_READY` (daftar objek hilang). Tidak ada DDL; `initSchema()` dinonaktifkan (throw `INIT_SCHEMA_DISABLED`).
- Deteksi **tidak** memakai `_prisma_migrations` saja — memeriksa seluruh tabel & kolom kritis schema V2.
- DB tidak dapat diakses → dianggap BELUM SIAP (bukan "sehat").
- 16 call site tetap kompatibel (kontrak `Promise<void>` + throw dipertahankan; error bubble ke handler seperti INIT_SCHEMA_FAIL lama).
- `/api/admin/init`: GET = diagnostic read-only (status + `missing`); POST = **410 Gone** (tidak ada DDL). Auth `x-admin-key` dipertahankan.
- `prisma/init.sql` ditandai LEGACY (header, alasan penghentian) — tidak dihapus, tidak dieksekusi skrip aplikasi.

**Temuan & koreksi (TASK 03G.1 — SELESAI):** `src/lib/runtime-settings.ts` menjalankan `CREATE TABLE IF NOT EXISTS "RuntimeSetting"` setiap dipanggil — model itu tidak ada di schema/migration (jalur DDL tersembunyi). TASK 03G menghapus DDL-nya; TASK 03G.1 menyelaraskan schema: model `RuntimeSetting` (`key` TEXT PK, `value` JSONB, `updatedAt` TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP) ditambahkan ke `schema.prisma` **identik kontrak SQL lama**, dan `migration.sql` diregenerasi offline (OPS1: banding dulu ke folder temporary — diff bersih: hanya blok `RuntimeSetting`, tanpa perubahan lain — lalu finalisasi). Baseline final: **15 tabel, 6 enum, 9 FK, 13 unique index, 40 index, 15 PK**. Guard `ensureSchema` kini memeriksa 15 tabel + kolom kritis `RuntimeSetting` (key/value/updatedAt).

### 13.7 Generator Registration ID (DIIMPLEMENTASIKAN di TASK 03F)

- Terpasang: `{RecruitmentPeriod.code}-` + 6 karakter base32 acak kriptografis (`crypto.randomBytes(4)` → 30 bit, tanpa modulo bias).
- Contoh format (bukan nilai nyata): `XLI-02-K8M2N4`.
- Access token 160-bit: **tidak diubah**. ID unik via `@unique` + retry P2002.
- Unit test: format regex, suffix6 karakter, tanpa 0/O/1/I, prefix dinamis, uniqueness 200 ID.

### 13.8 Tindakan yang Membutuhkan Approval

1. Operator mengisi `.env` V2 dengan dua URL project `bareskrim-rekrutmen-v2-dev` (checklist host: bukan V1).
2. Generate `migration.sql` via `prisma migrate diff --from-empty` (tanpa koneksi remote; tetap menulis file migration → butuh approval).
3. Tinjau isi `migration.sql` bersama operator.
4. `npx prisma migrate deploy` ke V2-dev.
5. `prisma generate` + verifikasi `migrate status`.
6. Seed `RecruitmentPeriod` `XLI-02` (terpisah, setelah deploy).
7. ~~Implementasi generator Registration ID 6 karakter~~ — SELESAI di TASK 03F.
8. ~~Guard `ensureSchema` + respons `/api/admin/init`~~ — SELESAI di TASK 03G.
9. ~~Koreksi `RuntimeSetting`~~ — SELESAI di TASK 03G.1 (model + regenerasi baseline 15 tabel).

Setelah baseline final: eksekusi `prisma migrate deploy` ke `bareskrim-rekrutmen-v2-dev` (TASK 03H, menunggu approval), lalu seed `RecruitmentPeriod`.
