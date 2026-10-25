# 07 — IMPLEMENTATION PHASES: Urutan Pekerjaan V2

Basis: dokumen 01–06. Setiap fase punya gate verifikasi; coding dimulai HANYA setelah approval user per fase. V1 (`D:\bareskrim-rekrutmen`) tetap frozen — semua kerja di V2.

## Fase 0 — Fondasi desain (belum ada fitur)
- Satukan design tokens ke Tailwind config V2 (palet kanonik dari `01-UI-AUDIT.md` §2), font Inter + DM Serif Display (Google Fonts, CSP sudah mengizinkan).
- Restyle `ui/*` dasar (Button, Card, Badge) ke token baru.
- Salin + kompres aset desain (`assets/logo/logo-pusdik.png`, 6 gambar) ke `public/` V2 — WebP, target ≤150 KB.
- **Gate**: `typecheck + lint + test` hijau; landing existing masih berfungsi.

## Fase 1 — Landing + route publik baru
- Redesign `/` (hero, recruitment card, intro, education, process, environment, archive preview, final CTA) + route baru `/rekrutmen`, `/tentang`, `/arsip`.
- Countdown dari data (API `/api/public/recruitment`, fallback statis sementara) — bukan hardcoded.
- Navbar/Footer restyle + item Galeri.
- **Gate**: visual sesuai arsip desain; navigasi antar-route benar; e2e smoke existing tetap hijau (`npm run test:e2e` bila browser tersedia).

## Fase 2 — Route `/galeri`
- Manifest JSON + `GalleryGrid` + lightbox `<dialog>`; navigasi dari Navbar.
- **Gate**: grid responsif, gambar WebP termuat, empty state bila aset kosong.

## Fase 3 — Registration + model database (butuh keputusan + DB dev)
- Keputusan user dulu: hybrid login (Opsi 1 `02`) vs token-only (Opsi 2); format `cohort`/periode pendaftaran (`04` §6.3).
- DB dev tersedia (Supabase project terpisah ATAU Postgres lokal) → implementasi model `Application` + penambahan ke `schema.prisma` + `init-schema.ts` + `init.sql` (sekaligus menutup gap `StudentActionLog`).
- `POST /api/registration` (zod + rate limit + token hash + ID unik), `GET /api/public/recruitment`, route `/daftar` (form 3 langkah + layar sukses + print CSS).
- **Gate**: typecheck/lint/test hijau; submit pendaftaran tersimpan di DB dev; token tidak pernah di-log/disimpan plaintext.

## Fase 4 — Student login + dashboard
- `POST /api/auth/student-login` (rate limit + lockout), route `/login` restyle, route `/dashboard` (status, timeline, profil, pengumuman) dengan guard status (`MENUNGGU_VERIFIKASI`/`TERVERIFIKASI`/`DITOLAK`).
- Integrasi: tombol verifikasi Roblox saat TERVERIFIKASI → `/api/auth/verify` existing → `/absen` → `/ujian` (flow existing, tidak diubah).
- **Gate**: alur pendaftaran → login → dashboard → verifikasi Roblox → absen berjalan end-to-end di DB dev; user V1-existing tetap bisa login normal.

## Fase 5 — Admin visual redesign
- Shell admin baru (header + 8 tab desain) membungkus panel/API existing; login 2 tahap via endpoint `verify-staff`/`session` yang ada.
- Hardening: `STAFF_ROLE_ID` ke env/runtime, rate limit login admin, audit log aksi.
- Panel "Calon Siswa" menyatu dengan data `Application` (endpoint `/api/admin/applications` baru: list/verify/reject).
- **Gate**: semua aksi admin existing tetap berfungsi; light-mode hanya admin; audit log tercatat.

## Fase 6 — Hardening & rilis
- Rate limit penuh (registrasi, student login), pengecekan duplikat pendaftaran, review keamanan CSP/middleware.
- E2E smoke diperluas (daftar → dashboard → admin verify).
- Deploy ke project Vercel TERPISAH + DB dev — **bukan** production V1 (butuh approval eksplisit per langkah deploy).

## Risiko lintas fase (ringkas)
| Risiko | Fase | Mitigasi |
|---|---|---|
| Regresi halaman ujian (NEXT_REDIRECT hotfix) | 1, 6 | Jangan sentuh `exam-service`/`ujian/page.tsx` |
| Drift schema 3-file | 3 | Edit `schema.prisma` + `init-schema.ts` + `init.sql` bersamaan |
| Token student bocor/ditebak | 4 | Hash di DB, rate limit + lockout |
| Data pribadi (birthDate) terekspos | 3, 5 | Hanya API admin terproteksi |
| Aset galeri dirusak (dipakai V1) | 2 | Read-only terhadap `public/galeri-bareskrim/` |
| Login desain vs auth existing bentrok | 4 | Keputusan Opsi 1/2 sebelum Fase 4 |

## Keputusan yang masih menunggu user
1. **Opsi login student** (Opsi 1 hybrid — disarankan — vs Opsi 2 token-only) — `02-COMPONENT-MAPPING.md` §5.
2. **Format periode pendaftaran**: field `cohort` vs tabel `RecruitmentPeriod` — `04-RECRUITMENT-FLOW.md` §6.3.
3. **Sumber DB dev**: Supabase project baru vs Postgres lokal — prasyarat Fase 3.
4. **Kategori galeri + judul gambar** (manifest) — `06-GALLERY-PLAN.md` §3.
5. **Penempatan tombol Galeri di Navbar** (item ke-5 vs pengganti) — `06` §4.
6. **Approval per fase** — tidak ada coding sebelum instruksi eksplisit.
