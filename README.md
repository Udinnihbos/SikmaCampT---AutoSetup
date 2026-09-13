# Autosetup Bot

Bot Discord (discord.js v14, ES Modules) buat eksekusi blueprint yang digenerate dari website autosetup. Command `/autosetup <token>` ambil rancangan server (roles/categories/channels) dari website lewat token sekali-pakai, terus dibangun langsung ke server.

## Alur singkat

```
/autosetup token:<token> [wipe:true/false]
  → cek permission user (harus Administrator) & bot (Manage Channels + Manage Roles)
  → fetch config dari GET <AUTOSETUP_WEB_URL>/api/setup/<token>
  → tampilin ringkasan + tombol Konfirmasi/Batal
  → kalau confirm & wipe:true → hapus semua channel yang ada
  → bikin roles → bikin categories → bikin channels di masing-masing category
  → kirim ringkasan hasil (jumlah dibuat + error kalau ada)
```

## Setup

```bash
npm install
cp .env.example .env
# isi DISCORD_TOKEN, CLIENT_ID, AUTOSETUP_WEB_URL, AUTOSETUP_BOT_SECRET
npm run deploy   # daftarin slash command /autosetup
npm start
```

File .env setup
```
# Token bot dari https://discord.com/developers/applications
DISCORD_TOKEN=

# Application ID (Client ID) dari halaman General Information bot kamu
CLIENT_ID=

# Opsional: isi Guild ID buat register command cuma di 1 server (instant, enak buat testing).
# Kosongin kalau mau command global (bisa delay sampai ~1 jam nyebar ke semua server).
GUILD_ID=

# URL website autosetup yang udah di-deploy ke Vercel
AUTOSETUP_WEB_URL=https://your-app.vercel.app

# HARUS SAMA PERSIS dengan AUTOSETUP_BOT_SECRET di env website
AUTOSETUP_BOT_SECRET=
```

`AUTOSETUP_BOT_SECRET` **harus sama persis** dengan yang diisi di env website (Vercel), karena endpoint token di website nolak request tanpa header secret yang cocok.

Saran waktu development: isi `GUILD_ID` di `.env` biar command langsung muncul di 1 server tanpa nunggu propagasi global (~1 jam).

## Deploy ke Pterodactyl

Sama kayak bot fishing lo sebelumnya:
1. Upload semua file (kecuali `node_modules`) ke server Pterodactyl.
2. Startup command: `npm install && npm run deploy && npm start` (atau pisahin `deploy` jadi one-time command manual, biar gak register ulang tiap restart).
3. Isi environment variables di panel Pterodactyl sesuai `.env.example`.

## Permission bot yang dibutuhin

Waktu invite bot ke server, minimal centang:
- Manage Roles
- Manage Channels
- Use Application Commands

## Kenapa role gak ikut ke-wipe

Opsi `wipe:true` cuma hapus channel, sengaja **tidak** menghapus role — soalnya role bot sendiri, role booster, integrasi, dll ikut ke-drag dan resikonya lebih tinggi daripada manfaatnya. Kalau nanti mau nambahin wipe roles juga, tinggal bikin fungsi baru di `lib/executor.js` yang skip role @everyone dan role yang lebih tinggi dari role bot (gak akan bisa dihapus bot soalnya, tapi baiknya di-skip eksplisit).

## Kalau mau custom field JSON

Schema config di-generate sama website (lihat `lib/prompt.js` di project web). Kalau nambah field baru (misal permission overwrite per-channel), update juga `lib/executor.js` di sini biar sinkron dua sisi.
