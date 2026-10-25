# TASK 03 — REGISTRATION SPECIFICATION & CONTRACT

Dokumen ini mendokumentasikan spesifikasi antarmuka pendaftaran (TASK 03A), model data, dan kontrak API yang telah **diimplementasikan dan di-hardening** pada TASK 03B.1 dan TASK 03B.2 di Bareskrim Rekrutmen V2 (`D:\Dev\Projects\bareskrim-rekrutmen-v2`).

**Pembaruan terakhir**: TASK 03B.2 (Registration Backend Hardening & Database Readiness).

---

## 1. Structure Form Pendaftaran (/daftar)

Formulir pendaftaran mengadopsi struktur wizard 3 tahap sesuai desain asli `registration.html`:

### Step 01: Identitas Peserta
| Field ID | Label | Tipe HTML | Aturan Validasi (Server: Zod) | Autocomplete / Options |
|---|---|---|---|---|
| `fullName` | NAMA LENGKAP | `text` | min 3, **maks 100** karakter | `name` |
| `robloxUsername` | USERNAME ROBLOX | `text` | min 3, **maks 40** karakter, regex `/^[a-zA-Z0-9_]+$/`, awalan `@` dipangkas otomatis | `off` |
| `discordId` | DISCORD USERNAME | `text` | min 2, **maks 32** karakter, awalan `@` dipangkas otomatis | `off` |
| `birthDate` | TANGGAL LAHIR | `date` | Tanggal valid, **1950-01-01 s.d. hari ini** (tidak boleh masa depan) | `bday` |
| `gender` | JENIS KELAMIN | `select` | Enum `L` (Laki-laki) atau `P` (Perempuan) | - |

### Step 02: Profil Peserta
| Field ID | Label | Tipe HTML | Aturan Validasi (Server: Zod) |
|---|---|---|---|
| `origin` | ASAL / DOMISILI | `text` | min 2, **maks 100** karakter |
| `experience` | PENGALAMAN ROLEPLAY | `textarea` (5 rows) | min 10, **maks 2000** karakter |
| `motivation` | MOTIVASI PENDAFTARAN | `textarea` (5 rows) | min 10, **maks 2000** karakter |

### Step 03: Pernyataan & Konfirmasi
| Field ID | Label | Tipe HTML | Aturan Validasi |
|---|---|---|---|
| `agreement` | PERNYATAAN KEBENARAN DATA | `checkbox` | Wajib `true` |

### Sanitasi Input (server-side, Zod `.transform`)
- **Strip karakter tak kasat mata** (zero-width, NBSP, dsb.) dari semua field teks.
- **Strip awalan `@`** dari `robloxUsername` dan `discordId`.
- **Batasi ukuran body permintaan**: maksimal **10.000 byte** → `413 Payload Too Large`.

---

## 2. Aturan Validasi Client-Side (TASK 03A)

1. **Step Transition Gate**:
   - Step 1 → Step 2 hanya setelah seluruh field Step 1 terisi valid.
   - Step 2 → Step 3 hanya setelah seluruh field Step 2 terisi valid.
2. **Review Summary**: Pada Step 3, `review-box` menampilkan `fullName`, `robloxUsername`, `discordId`, `origin` secara real-time.
3. **Submission Gate**: Tombol "KIRIM PENDAFTARAN" wajib `agreement` dicentang.
4. **Integrasi Backend (TASK 03B)**:
   - Submit memanggil `POST /api/applications`.
   - **Layar sukses hanya ditampilkan setelah server mengonfirmasi (status 201)** dengan `registrationId` dan `accessToken` dari server.
   - Gagal / 503 / 409 / 429 → banner error server yang jujur, **tanpa success palsu**.
   - **Tidak ada penulisan `localStorage`** (0 write, diverifikasi Playwright).

---

## 3. Model Data (Diimplementasikan di `prisma/schema.prisma`)

### Enums
```prisma
enum ApplicationStatus {
  MENUNGGU_VERIFIKASI
  DITERIMA
  DITOLAK
}

enum Gender {
  L
  P
}
```

### Model RecruitmentPeriod (TASK 03B.2 — **belum dimigrasikan**, definisi/schema-only)
Periode pendaftaran **terpisah** dari `ExamPeriod` (sistem ujian existing tidak diubah):

```prisma
model RecruitmentPeriod {
  id        String   @id @default(cuid())
  code      String   @unique // prefix registrasi, mis. "XLI-02"
  name      String   // mis. "Angkatan XLI Gelombang 02"
  openedAt  DateTime
  closedAt  DateTime
  isActive  Boolean  @default(false) // gerbang on/off admin
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  applications Application[]

  @@index([isActive])
  @@index([deletedAt])
}
```

### Model Application (Diimplementasikan)
```prisma
model Application {
  id                   String            @id @default(cuid())
  recruitmentPeriodId  String
  registrationId       String            @unique // Format: XLI-02-8492
  accessTokenHash      String            @unique // SHA-256 hash dari raw access token
  fullName             String
  robloxUsername       String            // tampilan asli (BELUM diverifikasi)
  robloxUsernameKey    String            // lowercase utk uniqueness
  discordId            String
  birthDate            DateTime
  gender               Gender
  origin               String
  experience           String            @db.Text
  motivation           String            @db.Text
  agreementAcceptedAt  DateTime          @default(now())
  status               ApplicationStatus @default(MENUNGGU_VERIFIKASI)
  rejectionReason      String?           @db.Text
  verifiedAt           DateTime?
  verifiedBy           String?
  userId               String?
  user                 User?             @relation(..., onDelete: SetNull)
  recruitmentPeriod    RecruitmentPeriod @relation(fields: [recruitmentPeriodId], references: [id])
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt
  deletedAt            DateTime?

  @@unique([recruitmentPeriodId, robloxUsernameKey])
  @@index([registrationId])
  @@index([robloxUsername])
  @@index([discordId])
  @@index([status])
  @@index([recruitmentPeriodId])
  @@index([deletedAt])
}
```

### Aturan Uniqueness & Collision
- **Satu pendaftaran per identitas Roblox per periode** dijamin `@@unique([recruitmentPeriodId, robloxUsernameKey])` di tingkat database — **race-safe**, menangani *concurrent submission*.
- **Collision `registrationId`** (format 6 karakter base32, 30-bit space — TASK 03F): API melakukan **retry hingga 3×** dengan `registrationId` baru. Jika tetap bentrok → `409` generik.
- **Duplicate submission**: pre-check + penanganan `P2002` Prisma. `P2002` pada unique constraint username-periode → `409` pesan jelas. Error tak terduga → `500` generik (detail database tidak pernah bocor).
- **Relasi ke `User`**: opsional (`userId` nullable, `onDelete: SetNull`) — diisi baru setelah verifikasi Roblox di Student Dashboard selesai. **Tidak ada tabel User kedua**.
- **Catatan keamanan**: `robloxUsername` adalah **input teks belum terverifikasi** sampai proses verifikasi Roblox/Student Dashboard selesai.

---

## 4. Kontrak API (Diimplementasikan)

### POST `/api/applications`

| Aspek | Nilai |
|---|---|
| Auth | Tidak ada (publik) |
| Rate limit | In-memory, 5 request / menit / IP → `429` |
| CSRF/Origin | Jika header `Origin` dikirim, harus sama dengan `Host` → selain itu `403` |
| Body max | 10.000 byte → `413` |

**Request Body**:
```json
{
  "fullName": "Budi Santoso",
  "robloxUsername": "BudiReskrim_01",
  "discordId": "budi_reskrim",
  "birthDate": "2005-08-17",
  "gender": "L",
  "origin": "Ternate",
  "experience": "Pengalaman 2 tahun di POLRI RBX sebagai penyidik.",
  "motivation": "Ingin bergabung dengan Pusdik Reserse untuk berkembang.",
  "agreement": true
}
```

**Response Matrix**:

| Status | Kondisi |
|---|---|
| `201` | Sukses — DB tersimpan. `registrationId` + `accessToken` (raw) dikembalikan **sekali** |
| `400` | Body invalid / validasi Zod gagal / tanggal lahir tidak valid / input kepanjangan |
| `403` | Origin tidak cocok, atau **periode pendaftaran tidak terbuka** |
| `409` | Duplikat per periode (pre-check / concurrent `P2002`) / collision `registrationId` berturut-turut |
| `413` | Body > 10.000 byte |
| `429` | Melebihi rate limit 5/menit/IP |
| `500` | Error tak terduga — pesan generik, tanpa detail database |
| `503` | Database development belum tersedia (guard placeholder) |

**Gerbang Periode**: Pendaftaran hanya diterima bila ada `RecruitmentPeriod` dengan `isActive=true`, `deletedAt=null`, `openedAt <= now <= closedAt`. Selain itu → `403`.

**Contoh Response Error**:
```json
{ "success": false, "error": "Username Roblox \"BudiReskrim_01\" sudah terdaftar pada periode pendaftaran ini." }
```

---

## 5. Strategi Penyimpanan Token (Hardening TASK 03B.2)

### Audit Temuan & Perbaikan
| Aspek | TASK 03B.1 (sebelum) | TASK 03B.2 (sesudah) |
|---|---|---|
| Entropi token | **64 bit** (`randomBytes(8)`) — di bawah minimum | **160 bit** (`randomBytes(20)` → 32 char base32) — memenuhi ≥128 bit |
| Bias modulo | Nol (20 byte → 32 char tepat) | Nol |
| Fungsi regId vs token | Terpisah | Terpisah (regId: `randomBytes(2)` + rejection sampling) |
| `Math.random` | Tidak ada | Tidak ada (statik-check unit test) |
| Hash | SHA-256 | SHA-256 (sesuai untuk entropi ≥128 bit; brute force tidak masuk akal, tanpa salt) |

### Format Token — **PERUBAHAN FORMAT DOKUMENTASI** (keamanan > kemewahan tampilan)
```
Lama : XLI-02-XXXX-XXXX          (64 bit — TIDAK AMAN, sudah diganti)
Baru : XLI-02-XXXXXXXX-XXXXXXXX-...  (XLI-02 + 8 grup × 4 char = 32 char, 160 bit)
```
Gaya visual dipertahankan: prefix angkatan `XLI-02`, grup 4 karakter dipisah tanda hubung, kapital, alphabet tanpa karakter ambiguitas (tidak ada `0/O/1/I`).

### Aturan Penyimpanan
1. **Raw token TIDAK PERNAH** disimpan di database dan **TIDAK PERNAH** dicetak ke log server (log hanya mencatat `Error.name`).
2. Database menyimpan `accessTokenHash = SHA-256(rawToken)` (`@unique`).
3. **Raw token hanya dikembalikan ke client SEKALI**, setelah operasi penyimpanan database berhasil (status 201).
4. Verifikasi Student Panel (TASK 03B.3+) dihitung dengan hash input lalu membandingkan `accessTokenHash`.

---

## 6. Status Implementasi

| TASK | Status | Keterangan |
|---|---|---|
| **TASK 03A** (UI Migration) | **SELESAI** | Wizard 3-step, CSS scoped, validasi visual, tanpa mock DB |
| **TASK 03B.1** (Backend Foundation) | **SELESAI** | Skema `Application`, API `POST /api/applications`, token generator, rate limit |
| **TASK 03B.2** (Hardening & DB Readiness) | **SELESAI** | Token 160-bit, `RecruitmentPeriod`, limit input, P2002/concurrent handling, CSRF/Origin, fail-closed Prisma |
| **TASK 03B.2+** (Migration & DB Dev) | **MENUNGGU APPROVAL** | Migration nyata, provisioning database development — lihat `docs/v2/10-DATABASE-READINESS.md` |
| **TASK 03B.3** (Student Login / Verifikasi) | **PENDING** | Belum dikerjakan (sesuai batasan TASK 03B.2) |

### Hasil Verifikasi (TASK 03B.2)
- **Prisma Validate** (offline, placeholder URL): **PASS 🚀**
- **TypeScript Typecheck**: **PASS** (0 error)
- **ESLint**: **PASS** (0 warning/error)
- **Vitest**: **PASS — 57/57 unit test** (termasuk 13 hardening test API route & 12 test service)
- **Playwright Interaction (regresi)**: **PASS — 11/11** (wizard, 503 guard, 0 localStorage, 4 public route TASK 02)
- **Database Integration**: **BLOCKED** — database development belum tersedia (tidak diklaim PASS)

### Database Integration yang Masih Diperlukan
1. Penyediaan `DATABASE_URL` PostgreSQL **development** (terisolasi, bukan production Supabase).
2. Penjalanan `prisma migrate dev --name init_registration` **(belum dilakukan — menunggu approval)**.
3. Seed `RecruitmentPeriod` aktif (periode `XLI-02`).
4. Pengujian integrasi nyata: create, duplikat `P2002`, relasi `Application` ↔ `User`.
5. Untuk production multi-instance: migrasi rate limiter ke distributed store (mis. Upstash Redis) — in-memory hanya *best effort*.
