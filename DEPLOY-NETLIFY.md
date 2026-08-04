# Deploy ke Netlify

Proyek sudah dikonfigurasi untuk Netlify dengan `@netlify/plugin-nextjs`.

## Setup

### 1. Push ke GitHub

```cmd
cd bareskrim-rekrutmen
git init
git add .
git commit -m "Bareskrim Rekrutmen - siap deploy"
git branch -M main
git remote add origin https://github.com/USERNAME/bareskrim-rekrutmen.git
git push -u origin main
```

### 2. Deploy di Netlify

1. Buka [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. Pilih **GitHub** → pilih repo `bareskrim-rekrutmen`
3. Build settings otomatis:
   - **Build command:** `npm run build`
   - **Publish directory:** `.next`

### 3. Environment Variables

Buka **Site settings → Environment variables**, tambahkan semua ini:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql://...?sslmode=require` |
| `JWT_SECRET` | string acak ≥32 karakter |
| `ADMIN_KEY` | kunci admin rahasia |
| `KKM` | `70` |
| `MCQ_COUNT` | `15` |
| `ESSAY_COUNT` | `5` |
| `MCQ_POINTS` | `4` |
| `ESSAY_POINTS` | `8` |
| `EXAM_DURATION_MINUTES` | `45` |
| `REQUIRED_GROUP_ID` | `11902409` |
| `REQUIRED_GROUP_NAME` | `[RI] Republic Indonesia` |
| `POLICE_GROUP_ID` | `14460225` |
| `POLICE_GROUP_NAME` | `Kepolisian` |
| `MIN_POLICE_RANK` | `225` |
| `MIN_POLICE_RANK_NAME` | `Bhayangkara Kepala` |
| `BANNED_GROUP_IDS` | `367050757,34766643` |
| `BANNED_GROUP_NAMES` | `TNI AD,TNI AL` |
| `DISCORD_WEBHOOK_URL` | URL webhook channel pusdik |
| `DISCORD_BOT_NAME` | `Sistem Rekrutmen Bareskrim Polri` |
| `DISCORD_PUSDIK_WEBHOOK_URL` | URL webhook pusdik |
| `DISCORD_GUILD_ID` | `1106203569675313232` |
| `DISCORD_CHANNEL_ID` | `1532464247865610390` |
| `DISCORD_BOT_TOKEN` | token bot Discord |
| `TAHAP_AKADEMIK_ROLE_ID` | `1247044385489686539` |
| `DISCORD_PUTUSAN_CHANNEL_ID` | `1054380482697121792` |
| `DISCORD_BLACKLIST_POLRI_CHANNEL_ID` | `1465357421512888592` |
| `DISCORD_BLACKLIST_PENDIDIKAN_CHANNEL_ID` | `1418119877746757714` |

### 4. Aktivasi

1. Klik **Deploy site** → tunggu sampai Published
2. Buka `https://NAMA-SITE.netlify.app/admin`
3. Masukkan `ADMIN_KEY`
4. Klik **Initialize Database** jika muncul kartu warning
5. Tambahkan soal PG (15) dan Essay (5)
6. Buka periode rekrutmen

### 5. Verifikasi

- `https://NAMA-SITE.netlify.app/api/health` → `{"ok":true,...}`
- Login dengan username Roblox
- Submit ujian → cek Discord channel pusdik
