# Discord Bot - Rekrutmen Bareskrim Polri

Bot Discord untuk mengelola role otomatis pada sistem rekrutmen.

## Fitur

- ✅ Assign role "Tahap Akademik" otomatis saat casis absen
- ✅ API endpoint untuk integrasi dengan web app
- ✅ Health check endpoint

## Setup

### 1. Discord Developer Portal

1. Buka https://discord.com/developers/applications
2. Klik "New Application" → Beri nama "Bareskrim Rekrutmen Bot"
3. Tab "Bot" → Klik "Reset Token" → Copy token
4. Enable "Message Content Intent" di bagian Privileged Gateway Intents
5. Tab "OAuth2" → Copy "Client ID"

### 2. Invite Bot ke Server

1. Tab "OAuth2" → "URL Generator"
2. Scope: `bot`, `applications.commands`
3. Bot Permissions: `Manage Roles`, `Send Messages`, `Use Slash Commands`
4. Copy URL → Buka di browser → Invite ke server

### 3. Buat Role di Server

1. Buka Discord Server → Server Settings → Roles
2. Buat role baru: "Tahap Akademik"
3. Copy Role ID (klik kanan role → Copy Role ID)

### 4. Environment Variables

Copy `.env.example` ke `.env` dan isi:

```bash
cp .env.example .env
```

| Variable | Deskripsi |
|----------|-----------|
| `DISCORD_TOKEN` | Token bot dari Developer Portal |
| `CLIENT_ID` | Client ID dari Developer Portal |
| `GUILD_ID` | ID server Discord |
| `TAHAP_AKADEMIK_ROLE_ID` | ID role "Tahap Akademik" |
| `PORT` | Port untuk API server (default: 3001) |
| `WEB_API_SECRET` | Secret key untuk auth dengan web app |

### 5. Install & Run

```bash
# Install dependencies
npm install

# Run locally
npm start

# Run in dev mode (auto-restart)
npm run dev
```

## API Endpoints

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/api/health` | GET | Health check |
| `/api/assign-role` | POST | Assign role ke user |
| `/api/remove-role` | POST | Remove role dari user |
| `/api/check-role/:userId/:roleName` | GET | Cek apakah user punya role |

### Assign Role

```bash
POST /api/assign-role
Headers: x-bot-secret: <your-secret>
Body: { "userId": "123456789", "roleName": "Tahap Akademik" }
```

### Response

```json
{
  "ok": true,
  "message": "Role \"Tahap Akademik\" assigned to username"
}
```

## Deploy ke Railway

1. Buat akun di https://railway.app
2. Klik "New Project" → "Deploy from GitHub repo"
3. Pilih repo `bareskrim-rekrutmen/discord-bot`
4. Tab "Variables" → Tambah semua environment variables
5. Deploy otomatis

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Bot tidak online | Cek token Discord benar |
| Role tidak terassign | Cek GUILD_ID dan TAHAP_AKADEMIK_ROLE_ID |
| API error 401 | Cek WEB_API_SECRET cocok dengan web app |
