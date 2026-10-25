# 04 — RECRUITMENT FLOW: Alur Pendaftaran → Ujian

Keputusan requirement: Formulir Pendaftaran V2 jadi tahap awal → dilanjutkan verifikasi Roblox → sistem ujian existing. Alur target: **Landing → Registration → Roblox Verification → Dashboard → Attendance → Exam → Result → Discord**.

## 1. Audit model Prisma existing (12 model, `prisma/schema.prisma`)

| Model | Peran | Relevansi alur baru |
|---|---|---|
| `User` | Identitas Roblox (robloxId unique, username unique, displayName, discordUsername, snapshot rank/matra) | Dibuat saat verifikasi Roblox berhasil — **bukan** saat pendaftaran |
| `ExamPeriod` | Periode ujian (isActive, isAttendanceOpen, isExamOpen, examStart/EndTime, seed, mcq/essayCount, passThreshold) | Tidak terpengaruh; jendela ujian existing tetap |
| `Question` | Bank soal (MCQ/ESSAY, kunci/jawaban) | Tidak terpengaruh |
| `ExamAttempt` / `ExamAnswer` / `ExamResult` | Attempt, jawaban, hasil | Tidak terpengaruh |
| `Attendance` | Absensi per (period, user) | Gerbang sebelum ujian tetap |
| `BlacklistEntry` / `VerdictEntry` | Blacklist matra + putusan pusdik | Dipertahankan; pendaftar baru bisa dicek saat verifikasi |
| `AdminLog` / `StudentActionLog` | Audit | `StudentActionLog` belum dibuat `init-schema.ts` (gap known) |
| `PendingDiscordReport` | Antrean retry Discord | Tidak terpengaruh |

**Gap utama: tidak ada model pendaftaran.** `User` hanya tercipta lewat `/api/auth/verify` (resolve username Roblox → cek grup → blacklist → rank gate). Pendaftar yang belum pernah diverifikasi belum punya row apa pun — form pendaftaran butuh tabel sendiri.

## 2. Perubahan database yang dibutuhkan (rencana — TANPA migration di fase ini)

Model baru `Application` (usulan):

```prisma
enum ApplicationStatus {
  MENUNGGU_VERIFIKASI
  TERVERIFIKASI
  DITOLAK
}

model Application {
  id              String   @id @default(cuid())
  registrationId  String   @unique        // format server-side, mis. XLI-02-0147
  accessTokenHash String                  // SHA-256 dari token (token plaintext TIDAK disimpan)
  fullName        String
  robloxUsername  String                  // belum diverifikasi — snapshot saat daftar
  discordUsername String
  birthDate       DateTime
  gender          String                  // "L" | "P"
  origin          String
  roleplayExperience String
  motivation      String
  status          ApplicationStatus @default(MENUNGGU_VERIFIKASI)
  registeredAt    DateTime @default(now())
  verifiedAt      DateTime?
  rejectedAt      DateTime?
  verifiedBy      String?                 // staff/admin id
  linkedUserId    String?                 // diisi saat Roblox terverifikasi -> User.id

  @@index([status])
  @@index([registrationId])
}
```

Ketentuan:
- **Token**: hash SHA-256 (atau bcrypt) di server; plaintext hanya dikirim SEKALI di layar sukses. Desain menyimpan plaintext di localStorage — jangan ditiru.
- **registrationId**: di-generate server dengan uniqueness check + retry (desain memakai `Math.random` 4 digit — kolisi mungkin).
- **Relasi ke `User`**: via `linkedUserId` setelah verifikasi Roblox sukses. `User` tetap satu-satunya sumber identitas Roblox untuk absen/ujian.
- **Dual-write vs tabel terpisah**: tabel terpisah dipilih karena masa hidup data berbeda (pendaftaran = sebelum verifikasi; `User` = sesudah). Extending `User` akan memaksa `robloxId` terisi sebelum verifikasi — tidak mungkin.
- **Drift schema**: penambahan harus masuk BERSAMAANAN ke `prisma/schema.prisma` + `src/lib/init-schema.ts` + `prisma/init.sql` (kebijakan 3-file existing — jangan tambah ke satu tempat saja).

## 3. Alur verifikasi Roblox existing (dipertahankan penuh)

`/api/auth/verify` (`src/app/api/auth/verify/route.ts`):
1. Cache lookup `User` by username (snapshot rank → blokir cepat tanpa panggil API Roblox).
2. `resolveUserByUsername` → robloxId + info.
3. Auto-block `BlacklistEntry` (Polri & Pendidikan) sebelum panggil API Roblox lebih jauh.
4. Cek keanggotaan grup wajib `REQUIRED_GROUP_ID` (11902409).
5. Cek grup matra terlarang (`BANNED_GROUP_IDS`) → `matraBlocked`.
6. Cek rank Kepolisian `>= MIN_POLICE_RANK` (224, override: env → `RuntimeSetting` DB).
7. Upsert `User` + snapshot rank → `createSessionCookie` (JWT httpOnly).

Tidak ada perubahan pada langkah ini. Pendaftar baru masuk ke funnel ini **setelah** pendaftaran diverifikasi admin (`status=TERVERIFIKASI`).

## 4. Alur end-to-end V2 (target)

```
/ (landing)
  └─ tombol "Mulai Pendaftaran" → /daftar
       └─ Form 3 langkah (client state + validasi per langkah)
            └─ POST /api/registration  (zod server-side, rate limit)
                 └─ Buat Application (MENUNGGU_VERIFIKASI) + kirim token SEKALI
  /login (Registration ID + Access Token)  →  cookie JWT student
  /dashboard  →  status pendaftaran
       ├─ status MENUNGGU_VERIFIKASI → banner menunggu, fitur terkunci
       ├─ status DITOLAK → tombol "cek hasil"/tolak (alur existing /tolak)
       └─ status TERVERIFIKASI → form verifikasi Roblox
            └─ POST /api/auth/verify (existing) → User row + cookie
                 └─ /absen (Attendance, gerbang existing)
                      └─ /ujian (ExamAttempt, grading existing)
                           └─ /hasil + /review/[id]
                                └─ Discord report (PendingDiscordReport existing)
```

Titik keputusan penting: **di mana verifikasi Roblox dipicu**. Usulan: tombol di `/dashboard` saat status `TERVERIFIKASI` (meniru alur V1: user datang ke `/login` Roblox kapan pun setelah diverifikasi). Alternatif: otomatis redirect setelah login student — lebih rapuh bila Roblox API down.

## 5. Audit API existing vs kebutuhan baru

| Kebutuhan | API existing | Kebutuhan baru |
|---|---|---|
| Submit pendaftaran | — | `POST /api/registration` [BARU] |
| Status pendaftaran | — | `GET /api/registration/status` [BARU] |
| Login student (ID+token) | — | `POST /api/auth/student-login` [BARU] |
| Verifikasi Roblox | `/api/auth/verify` | — |
| Absensi | `/api/attendance/verify`, `/api/attendance/submit`, public variants | — |
| Ujian | `/api/exam/session`, `save`, `submit`, `report`, `review` | — |
| Hasil | `/api/hasil` — butuh sesi Roblox terverifikasi; hasil dibatasi milik user sesi | — |
| Admin kelola pendaftar | — | `/api/admin/applications` (list, verify, reject) [BARU] — pola CandidatesTab existing |
| Discord | webhook + bot role assign | Notifikasi pendaftaran baru (opsional, pakai webhook existing) |

> **Keamanan `/api/hasil` (TASK 03L.2E.4.4 / 03L.2E.4.5):** endpoint **memerlukan cookie sesi Roblox terverifikasi** (`getSessionUser`, sesi trusted v2) — tidak ada akses anonim. Hasil **dibatasi pada hasil milik `User` dari sesi**: ownership diikat ke `user.id`; `username`/`displayName`/`robloxId`/`registrationId`/`resultId`/`attemptId`/`userId` dari body klien **tidak pernah** dipakai sebagai identitas maupun bukti kepemilikan. Tanpa sesi → `401`; user di-soft-delete → `403` (tanpa menjalankan query hasil, fail closed); tanpa hasil → `404` generik (bukan oracle keberadaan user/hasil lain). Semua respons memakai `Cache-Control: private, no-store`. Halaman `/hasil` **tidak lagi menyediakan pencarian berdasarkan username publik** — sebelumnya endpoint dapat dipanggil anonim dan menerima `username`, sehingga hasil kandidat lain dapat dibaca.

## 6. Risiko integrasi alur

1. **Hash token vs keamanan**: tanpa rate limit kuat di `/api/auth/student-login`, token 8 karakter (32^8) bisa ditebak — wajib `rate-limit.ts` + lockout/eksponensial backoff.
2. **Konflik identitas**: `robloxUsername` di `Application` bisa berbeda dari `User.username` saat verifikasi (user ganti username) — verifikasi selalu lewat API live, field pendaftaran hanya referensi.
3. **Periode pendaftaran**: `ExamPeriod` mengatur ujian/absen, BUKAN pendaftaran. Perlu penanda periode pendaftaran (field di `Application` atau tabel `RecruitmentPeriod` baru) — keputusan user (opsi termurah: field `cohort` string di `Application`, angkatan/gelombang dari pengaturan admin).
4. **Backward compatibility**: casis V1 yang sudah login Roblox (cookie JWT existing) tidak boleh terdorong ke alur pendaftaran baru — `/dashboard` harus menangani kedua kondisi (punya `User` tapi tidak punya `Application`, dan sebaliknya).
5. **`init-schema.ts` drift**: `StudentActionLog` sudah gap; penambahan `Application` memperbesar risiko drift — perbaiki gap sekaligus saat implementasi (gate terpisah).
6. **Data pribadi**: `birthDate` + identitas lengkap = data pribadi — akses hanya admin terproteksi; jangan muncul di API publik; pertimbangkan enkripsi at-rest bila skala naik (catatan, bukan syarat fase ini).
