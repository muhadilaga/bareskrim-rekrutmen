# 16 — FEATURE PARITY MATRIX: V1 vs V2

## Status milestone — 4 Oktober 2026

**TASK 03L.2D — Student Claim: SELESAI (IMPLEMENTED) untuk API, Service, & UI Form.** TASK 03L.2D memverifikasi implementasi, konkurensi PostgreSQL, dan UI Form; TASK 03L.2D.5 menyinkronkan dokumentasi dan menutup milestone ini. **Milestone berikutnya adalah TASK 03L.2E — ApplicationStatus Guard.**

| Bukti | Hasil dan batas verifikasi |
|---|---|
| Otomatis: unit/integration | Full Vitest **336/336 PASS**, targeted regression **90/90 PASS**, StudentClaimForm UI **9/9 PASS**, TypeScript typecheck **PASS** |
| PostgreSQL Concurrency | **6/6 Reported PASS** pada cluster disposable PostgreSQL 18.6 (Run ID `78a047f1`, port 55439, PID 26468; 3 koneksi independen `CONN1`, `CONN2`, `VERIFIER`). Fixture sintetis dibersihkan total (`Application`: 0, `User`: 0, `RecruitmentPeriod`: 0); cluster dihentikan dan folder disposable dihapus. Telemetry raw `pg_locks` tidak dipertahankan (`EVIDENCE NOT RETAINED`) |
| HTTP lokal | `GET /login` **200**; `GET /dashboard` tanpa sesi **307 ke /login**; `GET /api/applications/claim` **405** (tidak memutasi DB) |
| Student Claim Semantics | Menghubungkan `Application.userId = user.id` via `registrationId` + raw `accessToken` (SHA-256 via `hashAccessToken` & `timingSafeEqual`). Access token bersemantik *one-time disclosure*, bukan *one-time redemption*. Klaim berulang dengan token valid bersifat **idempotent** (`isAlreadyLinked: true`, `verifiedAt` tidak ditimpa). Claim **TIDAK** mengubah `ApplicationStatus` atau memberikan akses ujian/absensi |
| Desktop & Mobile Layout | **PASS** untuk bagian yang ditinjau operator via screenshot browser nyata (Roblox Login & Student Claim Form, layout mobile sampai tombol submit utuh tanpa overflow horizontal visual) |
| Open Verification Items | Manual real-claim E2E dengan akun nyata, keyboard/focus interaction lengkap, seluruh variasi state visual dashboard, dan visual recheck setelah patch CSS `TASK 03L.2D.4` **belum dikonfirmasi** |
| Rate Limiter Note | Limiter Student Claim (`rate-limit.ts`) masih berbasis in-memory LRU. Memerlukan strategi shared rate limiting (Redis/DB/Gateway) sebelum deployment multi-instance produksi |

**Batas milestone:** dashboard menampilkan identitas user dan form Student Claim. Trusted session tetap mensyaratkan `authVersion: 2`, `authMethod: ROBLOX_OIDC`, dan `isOwnershipVerified: true`. Sesi tidak valid atau user tidak ditemukan diarahkan ke `/login`. Student Claim tidak menyimpulkan pendaftaran diterima, dan dashboard tidak membuka rute ujian atau absensi.

**OAuth belum dinyatakan production-ready. Dua isu tetap terbuka:**

- **A — Intermittent `TOKEN_EXCHANGE_NETWORK_FAILURE` / `UND_ERR_CONNECT_TIMEOUT`.** Pernah terjadi walaupun ada token exchange nyata sukses HTTP 200; root cause spesifik **UNCONFIRMED**.
- **B — ID token verification gagal sekitar 5015 ms.** Kemungkinan berkaitan dengan JWKS masih berupa hipotesis; root cause **UNCONFIRMED**. Event ini terpisah dari callback sukses; correlation ID berbeda tidak digabung sebagai satu percobaan.

**Blocker akses peserta:** ApplicationStatus Guard belum tersedia dan ditetapkan sebagai **TASK 03L.2E** (wajib selesai sebelum akses ujian/absensi dibuka ke peserta sungguhan). Menyembunyikan tombol bukan pengamanan endpoint. Redesign Admin, CMS, dan gallery belum dinyatakan selesai.

> **Catatan:** V1 production **FROZEN** di `D:\bareskrim-rekrutmen` (tidak boleh diakses tanpa approval). Matrix ini disusun berdasarkan audit kode V2, dokumen snapshot V2 (`docs/v2/01-14`), dan inventaris fitur dari TASK 03L.3A.

**Legenda Status:**
- ✅ Active — fitur berjalan dan teruji
- 🔄 Preserved — kode V1 dipertahankan tanpa perubahan di V2
- ⬆️ Improved — ada di V1, ditingkatkan di V2
- 🆕 New — tidak ada di V1, diimplementasi di V2
- ⛔ Tombstone — endpoint mati, return 410
- 🚫 Not Implemented — belum diimplementasi
- 📋 Planned — direncanakan, belum ada kode

---

## Autentikasi & Sesi

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| Login siswa via Roblox username | ✅ Active | ⛔ Tombstone 410 | `LEGACY_LOGIN_DISABLED` — endpoint return 410, tidak bisa dipakai |
| Login siswa via Roblox OAuth OIDC | Tidak ada | 🆕 Implemented; verifikasi lokal PASS | Jalur sukses HTTP 200 dan trusted browser session terverifikasi; UI TASK 03L.2C aktif. Isu A/B tetap terbuka; belum production-ready |
| Student Claim (Registration ID + Access Token) | Tidak ada | 🆕 Implemented — TASK 03L.2D (SELESAI) | Terpasang `StudentClaimForm.tsx` & `/api/applications/claim`. Verify raw `accessToken` via `hashAccessToken` (SHA-256) & `timingSafeEqual`. Semantik *one-time disclosure*, klaim berulang *idempotent*. `linkApplicationToUser` menautkan `userId` tanpa mengubah `ApplicationStatus` ke `DITERIMA` |
| Admin auth 2-stage AdminKey+Discord | ✅ Active | 🔄 Preserved | Mekanisme sama: AdminKey → Discord OAuth verify |
| Admin session cookie `brk_admin_verified` | ✅ Active | 🔄 Preserved | Cookie name dan logic identik (signed JWT 12 jam) |
| JWT & AdminKey hardcoded fallback | ✅ Ada fallback | ⬆️ Improved (partial) | `getJwtSecret` fail-closed semua env (TASK 03L.2B.2); **TAPI** `ADMIN_KEY_FALLBACK` (`"AdminBareskrim2026"`) & `sessionStorage` AdminKey masih ada — **RISIKO KEAMANAN** |

---

## Registrasi

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| Registration form multi-step | Tidak ada | 🆕 Implemented | `RegistrationWizard` 555 baris + `registration.css`, port dari design reference |
| `RecruitmentPeriod` model | Tidak ada | 🆕 Implemented | Schema Prisma aktif, relasi ke `Application` (SSOT pendaftaran) |
| `Application` model dengan `accessTokenHash` | Tidak ada | 🆕 Implemented | Dihash SHA-256 (`hashAccessToken`). Raw token TIDAK PERNAH disimpan di DB atau dicetak di log |
| `ApplicationStatus` enum (`MENUNGGU_VERIFIKASI` / `DITERIMA` / `DITOLAK`) | Tidak ada | 🆕 Schema exists | Schema ada, **guard NOT IMPLEMENTED** — route exam/attendance tidak cek status `DITERIMA` (beda dari hasil blacklist `BERSIH`/`VERIFIKASI_PETUGAS`/`TERCATAT_BLACKLIST` & `VerdictStatus`) |

---

## Profil & Identitas Roblox

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| Username resolution | ✅ `resolveUserByUsername` | 🔄 Preserved | `lib/roblox.ts` identik |
| Avatar headshot | ✅ Active | 🔄 Preserved | Multi-endpoint fallback sama |
| Group/rank lookup | ✅ `getUserGroups` | 🔄 Preserved | `lib/roblox.ts` identik |
| Rank snapshot on User model | ✅ `policeGroupRankNumber` etc | 🔄 Preserved | Schema Prisma identik |
| Matra block (`bannedGroupIds`) | ✅ Active | 🔄 Preserved | Logic pengecekan sama |
| Profile sync on OAuth login | N/A | 🚫 Partial | Callback upsert `username` + `displayName` saja; **group/rank NOT synced** on login |

---

## Blacklist

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| `BlacklistEntry` table `POLRI`/`PENDIDIKAN` | ✅ Active | 🔄 Preserved | Schema identik |
| Admin CRUD blacklist | ✅ Active via admin routes | 🔄 Preserved | Route sama |
| Bulk blacklist import | ✅ Active | 🔄 Preserved | `/admin/blacklist/bulk` |
| Pusdik Discord channel search | ✅ Active | 🔄 Preserved | `blacklist-pusdik.ts` (299 baris) + `discord-api.ts` (495 baris) identik |
| Casis self-check blacklist | Tidak ada | 🚫 Not Implemented | Planned — siswa bisa cek status blacklist sendiri |
| Blacklist guard on exam | ✅ `isBlockedByAdminLists` | 🔄 Preserved | `exam-service` logic identik |

---

## Absensi

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| Attendance submit with session | ✅ Active | ✅ Active | Requires trusted JWT v2 di V2 |
| Attendance check | ✅ Active | 🔄 Preserved | Logic sama |
| Public attendance submit | ✅ Active | ⛔ Tombstone 410 | Endpoint publik dimatikan |
| Discord role assign on attendance | ✅ Active | 🔄 Preserved | `assignDiscordRoleAndNickname` via `discord-api.ts` |
| Attendance uniqueness per period per user | ✅ `@@unique([userId,periodId,tahap])` | 🔄 Preserved | Constraint Prisma identik |

---

## Ujian

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| Exam session start | ✅ Active | 🔄 Preserved | Guards: matraBlocked, rank, blacklist, verdict, attendance, role, period |
| Exam save progress | ✅ Active | 🔄 Preserved | Auto-save answers |
| Exam submit | ✅ Active | 🔄 Preserved | Final submission + scoring |
| Exam review | ✅ Active | 🔄 Preserved | Review jawaban setelah submit |
| Exam report to Discord | ✅ Active | 🔄 Preserved | Via `PendingDiscordReport` model |
| Auto-submit cron | ✅ `/api/cron/auto-submit` | 🔄 Preserved | Route sama |
| Bank soal CRUD | ✅ Active | 🔄 Preserved | Admin route identik |
| ExamPeriod seed-based question randomization | ✅ Active | 🔄 Preserved | Randomisasi soal berbasis seed |

---

## Admin Panel

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| 26 Route API Admin (backend) | ✅ Active | 🔄 Preserved | Kode 26 file API route dipertahankan. Backend syntactically PASS, tapi E2E UI baru belum diuji (*Not Verified*) |
| Period management | ✅ Active | 🔄 Preserved | CRUD periode rekrutmen |
| Stats dashboard | ✅ Active | 🔄 Preserved | Statistik kandidat/ujian/absensi |
| Candidate management | ✅ Active | 🔄 Preserved | List, search, detail kandidat |
| Verdict/decision management | ✅ Active | 🔄 Preserved | Keputusan lulus/tidak (`VerdictStatus`: `LULUS`/`TIDAK_LULUS`) |
| Export CSV (attendance/results/blacklist/verdicts) | ✅ Active | 🔄 Preserved | Multiple export endpoint |
| Backup | ✅ Active | 🔄 Preserved | Database backup via admin |
| Discord integration (groups, messages, retry, pusdik-notify) | ✅ Active | 🔄 Preserved | Full Discord integration suite |
| Audit log | ✅ `AdminLog` + `StudentActionLog` | 🔄 Preserved | Model dan logging identik |
| Runtime settings CRUD | ✅ Active | 🔄 Preserved | Dynamic config via admin |
| Diagnostics | ✅ Active | 🔄 Preserved | System health check |
| Init schema (`/api/admin/init`) | ✅ Auto-DDL | ⬆️ Improved | GET = Diagnostik read-only (status kesiapan tabel); POST = **410 Gone** (auto-DDL SQL string legacy dinonaktifkan; DDL dikelola Prisma Migrate) |

---

## UI/UX

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| Landing page | ✅ Tailwind legacy | ⬆️ Improved | Design reference port DONE via `landing.css` (3618 baris) |
| Registration page | Tidak ada | 🆕 Implemented | Design reference port DONE via `registration.css` |
| Login page | ✅ Tailwind legacy `LoginForm.tsx` | ⬆️ Implemented — TASK 03L.2C | `(casis)/login`, anchor Roblox OAuth, error allowlist, tanpa dependensi periode. LoginForm tidak lagi menjadi route aktif |
| Dashboard dasar `/dashboard` | Komponen legacy `CasisCard`; bukan bukti route `/dashboard` tersedia | 🆕 Implemented — TASK 03L.2C | Guard server-side `getSessionUser()`, identitas minimum; render trusted browser session nyata dikonfirmasi operator |
| Portal peserta lanjutan | Route ujian/absensi/hasil legacy | 📋 Planned UI & guard | Dashboard dasar tidak menyelesaikan Student Claim, ApplicationStatus Guard, profil/grup, atau integrasi portal penuh |
| Admin panel | ✅ Tailwind legacy `AdminPanel.tsx` (1816 baris) | 🔄 Preserved | Legacy UI masih aktif |
| Navbar/Footer consistency | ✅ Single Tailwind set | ⬆️ Partial | Public memakai DesignNavbar/DesignFooter; login/dashboard memakai CasisShell terisolasi. Admin dan route peserta lama masih memakai layout legacy; konsolidasi penuh belum selesai |
| Galeri page | Tidak ada | 🚫 Not Implemented | Placeholder di nav, belum ada halaman |
| Responsive design | ✅ Tailwind breakpoints | ⬆️ Partial | Desktop login/dashboard ditinjau manual operator; mobile diperiksa otomatis pada ukuran terbatas, bukan sign-off semua layar |
| Theme light/dark toggle | ✅ Active `globals.css` | ⚠️ Partial | Login/dashboard dark-only dalam `.casis-root`; konsolidasi tema global dan Admin tetap terpisah |

---

## CMS (Fitur Baru)

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| Admin manages public content | Tidak ada | 📋 Planned | Belum ada kode |
| Gallery management | Tidak ada | 📋 Planned | Belum ada kode |
| Draft/Published workflow | Tidak ada | 📋 Planned | Belum ada kode |

---

## Keamanan

| Fitur | V1 Status | V2 Status | Catatan |
|-------|-----------|-----------|---------|
| `ADMIN_KEY_FALLBACK` hardcoded | ⚠️ Ada | ⚠️ Masih ada | **RISIKO** — harus dihapus sebelum production |
| `JWT_SECRET` fail-closed | ❌ Ada fallback | ⬆️ Improved | Fail-closed DONE semua environment (TASK 03L.2B.2) |
| OAuth OIDC ES256 verification | Tidak ada | 🆕 Implemented | Verifikasi signature Roblox OIDC token |
| Rate limiting | ✅ Active | 🔄 Preserved | Kode identik |
| Middleware admin route protection | ✅ Active | 🔄 Preserved | Kode identik |
| `ApplicationStatus` authorization guard | N/A | 🚫 Not Implemented | Route exam/attendance **tidak cek** status `DITERIMA` — siswa `MENUNGGU_VERIFIKASI` bisa akses ujian |

---

## Ringkasan Paritas

### Status Milestone Terkait

Ringkasan ini menggantikan hitungan lama yang tidak memisahkan fondasi dashboard dari portal peserta penuh. Baris matriks dapat saling berkaitan sehingga tidak dijumlahkan sebagai fitur independen.

| Milestone | Status |
|---|---|
| TASK 03L.2C — Login UI & Dashboard Foundation | **SELESAI** untuk cakupan lokal yang diverifikasi |
| TASK 03L.2C.1 — runtime/browser | **PASS**; login 200, dashboard tanpa sesi 307 ke login |
| TASK 03L.2C.2 — dokumentasi | **SELESAI**; sinkronisasi empat dokumen |
| TASK 03L.2D — Student Claim | **Planned**, belum diimplementasikan sebagai alur UI/API lengkap |
| ApplicationStatus Guard | **Belum tersedia; blocker pembukaan ujian/absensi** |
| Portal peserta penuh / redesign Admin / CMS / gallery | **Belum selesai** |

### Risiko Paritas Kritis

1. **Reliabilitas OAuth belum tuntas** — UI login aktif, tetapi intermittent `TOKEN_EXCHANGE_NETWORK_FAILURE` / `UND_ERR_CONNECT_TIMEOUT` dan kegagalan ID token verification sekitar 5015 ms tetap terbuka. Hipotesis JWKS pada isu kedua belum terbukti; keduanya **UNCONFIRMED**.
2. **ApplicationStatus guard missing** — Schema `DITERIMA`/`DITOLAK` ada tapi route exam dan attendance tidak enforce. Siswa yang belum diverifikasi bisa ikut ujian.
3. **ADMIN_KEY_FALLBACK** — Hardcoded secret masih ada di V2. Harus dihapus sebelum deploy production.
4. **Konsolidasi UI belum penuh** — Public dan fondasi Casis sudah memiliki layout masing-masing; Admin dan route peserta lama belum dimigrasi. Review desktop tidak menyelesaikan verifikasi manual mobile.
5. **Profile sync incomplete** — OAuth login hanya sync `username` + `displayName`, tidak sync group/rank. Data rank bisa stale.

### Prioritas Implementasi Berikutnya

1. ⚠️ **SECURITY** — Hapus `ADMIN_KEY_FALLBACK`, implementasi `ApplicationStatus` guard
2. 🔑 **AUTH** — Implementasi Student Claim flow (TASK 03L.2D); lanjutkan observability isu OAuth A/B secara terpisah
3. 🎨 **UI** — Lanjutkan portal peserta berizin dan konsolidasi layout; tambah verifikasi manual mobile di luar milestone fondasi yang sudah selesai
4. 📋 **NEW** — CMS, gallery, casis self-check blacklist
