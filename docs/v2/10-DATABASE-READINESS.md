# DATABASE READINESS & MIGRATION PLAN

Dokumen ini menjelaskan kesiapan database untuk TASK 03B.2+ (Registration Backend Hardening & Database Readiness) di Bareskrim Rekrutmen V2 (`D:\Dev\Projects\bareskrim-rekrutmen-v2`).

**Pembaruan TASK 03D:** keputusan arsitektur = **Prisma Migrate (Opsi A)** sebagai penulis skema tunggal. Rencana transisi, audit `ensureSchema`/`init.sql`, perluasan Registration ID, dan daftar perintah yang menunggu approval ada di `docs/v2/11-PRISMA-MIGRATION-STRATEGY.md`. Dokumen ini tetap merinci privasi data dan acceptance criteria; jangan menjalankan migrate dari sini tanpa membaca dokumen 11.

---

## 1. Kebutuhan Database Development

### Persyaratan
- **PostgreSQL terisolasi** (development/staging). **DILARANG** memakai `DATABASE_URL` V1 atau Supabase production.
- Dapat diakses dari environment development lokal (`DATABASE_URL` di `.env`).
- Dukungan untuk `prisma migrate` (Prisma 5.22).

### Kondisi Saat Ini
- `DATABASE_URL` development **belum tersedia** (status: **BLOCKED**).
- Seluruh endpoint yang menyentuh database (create `Application`, query `RecruitmentPeriod`) saat ini mengembalikan `503 Service Unavailable` dengan pesan jujur.
- **Tidak ada mock success / fallback in-memory** — sesuai batasan keamanan.

---

## 2. Migration Plan (Belum Dilakukan — Menunggu Approval)

### Prasyarat
1. Provisioning database PostgreSQL development.
2. Set `DATABASE_URL` di `.env` lokal (atau environment variable) ke koneksi development.

### Perintah (Contoh — jalankan hanya setelah approval)
```bash
# 1. Validasi skema (sudah PASS — offline)
npx prisma validate

# 2. Buat migration (dengan nama descriptive)
npx prisma migrate dev --name init_registration_schema

# 3. Regenerate Prisma Client
npx prisma generate

# 4. Seed RecruitmentPeriod aktif (XLI-02)
#    (diimplementasikan lewat script/CLI terpisah, bukan seed bawaan V1)
```

### Catatan Migrasi
- Migrasi hanya menyentuh tabel baru: `Application`, `RecruitmentPeriod`.
- Tabel existing (`User`, `ExamPeriod`, `ExamAttempt`, dll.) tidak diubah strukturnya.
- Relasi `Application.userId` bersifat opsional (`SetNull`) — aman untuk tabel existing.

---

## 3. Rollback Plan

Jika migrasi gagal atau terdeteksi masalah di production:

### Fallback Kode
- Kode API (`POST /api/applications`) saat ini memiliki **guard placeholder** (`DATABASE_URL` berisi `placeholder` → 503). Ini memungkinkan rollback kode tanpa menulis data.
- Jika migration perlu di-rollback:
  ```bash
  npx prisma migrate revert --name init_registration_schema
  ```

### Monitoring Setelah Migrasi
- Pantau `AdminLog` / `StudentActionLog` untuk aktivitas pendaftaran.
- Verifikasi `recruitmentPeriodId` terisi untuk setiap `Application` yang dibuat.
- Cek `status` (default `MENUNGGU_VERIFIKASI`) — pastikan tidak ada `status` kosong/null.

---

## 4. Acceptance Criteria untuk TASK Berikutnya

### TASK 03B.2+ (Migration & DB Development) — **BELUM DIMULAI**
- [ ] Database PostgreSQL development tersedia dan dapat diakses.
- [ ] `DATABASE_URL` di-set ke koneksi development.
- [ ] `npx prisma migrate dev --name init_registration_schema` sukses.
- [ ] `npx prisma generate` sukses (client ter-regenerate dengan `Application`, `RecruitmentPeriod`).
- [ ] `RecruitmentPeriod` seed dengan `code="XLI-02"`, `isActive=true`, `openedAt <= now <= closedAt`.
- [ ] Unit test API route (`POST /api/applications`) **201 Created** — sukses create nyata ke DB.
- [ ] Unit test duplikat (`P2002` `robloxUsernameKey`) → `409` — diterima DB.
- [ ] Unit test collision `registrationId` → retry → sukses.
- [ ] Playwright integration test submit pendaftaran sukses → `201` + `registrationId` + `accessToken` (raw) dikembalikan.
- [ ] Verifikasi `accessTokenHash` di DB = SHA-256(raw token).
- [ ] Verifikasi `Application` ↔ `User` relasi (nullable `userId`) — saat `userId=null`, akses data hanya lewat `registrationId` (Student Panel belum ada).

### TASK 03B.3 (Student Login / Verifikasi Roblox) — **PENDING**
- [ ] Endpoint login Student Panel berbasis `registrationId` + `accessToken` (hash compare).
- [ ] Integrasi dengan Roblox API untuk verifikasi `robloxUsername`.
- [ ] Set `userId` pada `Application` setelah verifikasi sukses.

---

## 5. Data Privacy & Kebijakan Retensi

### Field Data Pribadi yang Disimpan
| Field | Jenis Data | Alasan Penyimpanan |
|---|---|---|
| `fullName` | Nama lengkap | Identitas peserta, wajib administrasi |
| `robloxUsername` | Username Roblox | Identitas game (BELUM diverifikasi sampai verifikasi selesai) |
| `discordId` | Discord username | Komunikasi, assignment role |
| `birthDate` | Tanggal lahir | Validasi usia, administrasi |
| `gender` | L/P | Statistik, kelengkapan administrasi |
| `origin` | Asal/domisili | Statistik rekrutmen |
| `experience`, `motivation` | Teks | Evaluasi pendaftaran |
| `accessTokenHash` | SHA-256 hash | Autentikasi Student Panel (raw token tidak disimpan) |

### Aturan Akses Data Peserta
1. **Hanya admin** (terautentikasi `User` dengan role admin) yang dapat membaca `Application` data via panel admin.
2. **Student Panel** (TASK 03B.3+) hanya dapat membaca **data sendiri** (berdasarkan `registrationId` + `accessToken`).
3. **API publik** (`/api/applications`) hanya mengembalikan `registrationId` + `accessToken` (raw) ke client yang membuat pendaftaran; data lain tidak pernah dipublikasikan.
4. **Tidak ada API publik** untuk membaca list pendaftar atau detail pribadi lain.

### Retention Policy (Diusulkan)
- **Data pendaftaran**: Disimpan minimal **12 bulan** setelah periode berakhir (audit & penelusuran administrasi).
- **Setelah 12 bulan**: `deletedAt` diisi (soft delete), data tetap ada untuk audit trail.
- **Hard delete**: Tidak ada otomatis; dilakukan manual oleh admin jika diperlukan (mis. penghapusan atas permintaan peserta sesuai kebijakan perlindungan data).

### Mekanisme Soft Delete
- Kolom `deletedAt DateTime?` pada `Application`.
- Query aplikasi menyaring `deletedAt: null` (sudah diimplementasikan di pre-check duplikat).
- Data soft-deleted tidak tampil di UI admin secara default, tetapi tetap tersedia di DB untuk audit.

### Data yang TIDAK BOLEH Ditampilkan di API Publik
| Field | Alasan |
|---|---|
| `accessTokenHash` | Materi kredensial (hash) — tidak boleh bocor ke publik |
| `fullName`, `birthDate`, `discordId`, `origin` | Data pribadi — hanya untuk admin / Student Panel sendiri |
| `experience`, `motivation` | Evaluasi pribadi — tidak untuk publik |
| `status`, `verifiedBy`, `verifiedAt` | Informasi internal proses rekrutmen |
| `recruitmentPeriodId` | Info internal |
| `userId` | Tautan akun Student Panel — privasi |
| `createdAt`, `updatedAt` | Metadata internal (kecuali untuk audit admin) |

**Satu-satunya data yang dapat dipublikasikan** (via API response sukses ke client pembuat): `registrationId` dan `accessToken` (raw). `accessToken` hanya dikembalikan **sekali** saat pembuatan.

---

## 6. Ringkasan Risiko & Rekomendasi

| Risiko | Tingkat | Mitigasi |
|---|---|---|
| **Database development belum tersedia** | Tinggi | Endpoint mengembalikan `503` jujur; tidak ada mock success. **BLOCKED** sampai provisioning selesai. |
| **Migration belum dijalankan** | Tinggi | Skema Prisma valid (offline PASS), tapi tabel `Application`, `RecruitmentPeriod` belum ada di DB development. Menunggu approval + provisioning. |
| **Rate limiter in-memory** | Sedang | Untuk single instance OK; **production multi-instance perlu distributed rate limiter** (Upstash Redis / sejenisnya) — dijadwalkan di deployment production. |
| **Collision `registrationId`** | Rendah | Retry 3× dengan ID baru; peluang kecil (1/9000); DB unique constraint jadi jaring pengaman akhir. |
| **Duplikat concurrent submission** | Rendah | `@@unique([recruitmentPeriodId, robloxUsernameKey])` di tingkat DB — race-safe. |
| **Raw token bocor ke log** | Rendah | Unit test statik memverifikasi `route.ts` tidak memanggil `console.log/info/debug/warn` dan tidak mencetak `rawAccessToken` di `console.error`. |

---

## 7. Persiapan untuk TASK 03B.2+ (Migration & DB Development)

1. **Database Development Provisioning**: Sediakan PostgreSQL development terisolasi.
2. **Environment Variable**: Set `DATABASE_URL` di `.env` lokal (jangan commit `.env` — gunakan `.env.example` yang sudah tersedia).
3. **Migration Execution**: `npx prisma migrate dev --name init_registration_schema`.
4. **Seed Periode**: Buat `RecruitmentPeriod` aktif dengan `code="XLI-02"`.
5. **Integration Testing**: Jalankan ulang unit test API route dengan mock → ganti ke test nyata ke DB development.
6. **Playwright E2E**: Submit pendaftaran nyata lewat `/daftar` → verifikasi `201` + `registrationId` + `accessToken` di client.
7. **Distributed Rate Limiter**: Konfigurasi Upstash Redis atau sejenisnya untuk production multi-instance (di luar scope TASK 03B.2 — dijadwalkan di deployment production).

---

**Status**: **BLOCKED** — menunggu provisioning database development dan approval untuk menjalankan migration.
