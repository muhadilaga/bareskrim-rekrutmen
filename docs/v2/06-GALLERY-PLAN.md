# 06 — GALLERY PLAN: Route `/galeri`

Requirement: dedicated route `/galeri`, memakai aset existing `public/galeri-bareskrim/`, diakses via tombol navigasi khusus di Landing Page.

## 1. Aset aktual (audit `public/galeri-bareskrim/`)

28 file = 14 gambar × 2 format (PNG + WebP), pasangan bernomor `1–12` + 3 bertema unit:

```
1.png/webp … 12.png/webp
PROPAGANDA_JATANRAS.png/webp
PROPAGANDA_RESMOB.png/webp
```

Tidak ada file metadata/manifest — kategori harus ditentukan saat implementasi. `src/app/page.tsx` existing sudah mereferensikan folder `galeri` (temuan audit) — artinya ada hook navigasi lama yang bisa dipetakan ke tombol desain.

Catatan: selain galeri, ada aset lain `public/logos/` (4 file) dan `public/shield.svg` — terpisah, tidak ikut galeri.

## 2. Evaluasi kebutuhan

| Kebutuhan | Rencana | Alasan |
|---|---|---|
| Gallery grid | CSS grid responsif (mis. `repeat(auto-fill, minmax(280px, 1fr))`) — Tailwind V2 | Pola desain editorial (persegi, border 1px) cocok; tanpa library |
| Category filtering | State React + filter berdasarkan nama/kategori dari manifest | 14 gambar — kecil; filter kategori opsional fase pertama |
| Image preview | Lightbox sederhana (dialog + next/prev) atau link buka gambar penuh | Jangan tambah dependency untuk 14 gambar; `<dialog>` native cukup |
| Lazy loading | `loading="lazy"` + `decoding="async"` bila pakai `<img>`; default Next/Image | 28 file, sebagian besar <300 KB setelah pasangan WebP |
| Image optimization | Pakai **WebP** yang sudah ada; pertahankan `images.unoptimized: true` (konsisten V1) | PNG asli kemungkinan berat — WebP sudah tersedia, pilih WebP |
| Responsive layout | 1 kolom mobile → 2 → 3–4 kolom desktop; preview full-width mobile | Ikuti breakpoint desain (600/900/1100px) |

## 3. Struktur yang direncanakan

```
src/app/galeri/page.tsx          # server component + metadata
src/components/galeri/
├── GalleryGrid.tsx
├── CategoryFilter.tsx           # opsional fase pertama
└── ImagePreview.tsx             # <dialog> lightbox
public/galeri-manifest.json      # manifest: [{file, kategori, judul?}]
```

Manifest JSON (dibuat saat implementasi, bukan sekarang) — desain: array objek `{ "file": "1.webp", "kategori": "Kegiatan", "judul": "…" }`. Kategori awal usulan: `Kegiatan`, `Propaganda` (dari nama file `PROPAGANDA_*`). Judul/kategori final = keputusan user (aset tidak membawa metadata).

## 4. Navigasi

- Tombol `Galeri` di `Navbar` publik (landing + semua route publik) — desain navbar saat ini: Beranda/Rekrutmen/Tentang/Arsip + LOGIN SISWA; Galeri jadi item kelima (atau menggantikan salah satu bila user mau — keputusan).
- Bila `public/galeri-bareskrim/` kosong di environment tertentu → render empty state (jangan broken image).

## 5. Risiko galeri

1. PNG asli kemungkinan besar berukuran besar (karakteristik aset proyek ini: PNG 1,5–1,9 MB) — WebP pasangan harus diprioritaskan di srcset; pertimbangkan kompresi ulang PNG sumber saat implementasi.
2. `next.config.mjs` `images.remotePatterns` hanya untuk rbxcdn/roblox — gambar lokal tidak terpengaruh, aman.
3. CSP `img-src` mengizinkan `'self'` — gambar lokal aman.
4. Jangan mengubah isi folder `public/galeri-bareskrim/` (aset production V1 memakainya) — penambahan manifest boleh, penghapusan/penamaan ulang jangan tanpa approval.
