# Pembaruan Monitoring Settings — 9 November 2026

Status: **[VERIFIED — lokal]** Implementasi, 28 pemeriksaan terarah, lint file terkait, build produksi Webpack, dan tinjauan UI desktop/mobile lulus. **[UNCERTAIN — produksi]** Paket belum dipasang pada server Ubuntu; pengiriman pesan ke penerima nyata tidak diuji.

## Yang tersedia

1. Form khusus perangkat/IP, interface/ISP, kebijakan PM2, service Ubuntu, SLA, dan maintenance. Pengguna tidak perlu mengganti payload JSON.
2. Pemindahan uplink fisik melalui pratinjau tiga entri. Port asal menjadi unused, port tujuan mengambil peran ISP, dan keterangan/induk PPPoE diperbarui dalam satu transaksi. Trafik fisik tidak dihitung ulang dalam total WAN.
3. Kebijakan PM2 berdasarkan source/pemilik dan nama aplikasi: wajib online, opsional, atau diabaikan. Source spesifik mengesampingkan wildcard, kemudian environment. Kebijakan dinonaktifkan mengembalikan aturan environment.
4. Versi per entri, penolakan edit usang (HTTP 409), riwayat actor dan sebelum/sesudah, serta pemulihan dengan pemeriksaan versi. Pemulihan entri baru menonaktifkan entri tersebut.
5. Kualitas data Prometheus, MySQL, dan heartbeat collector. Snapshot PM2 yang kedaluwarsa tidak dinyatakan online/down. Gangguan source ditangani terpisah dari aplikasi.
6. Perbaikan pembacaan JSON native MySQL untuk konfigurasi dan metadata histori. Daftar yang seluruh entrinya dinonaktifkan tidak kembali ke default statis.
7. Penghentian kewajiban monitoring PM2 menutup insiden lama dengan alasan `Monitoring requirement removed`, tanpa menyatakan bahwa layanan sudah pulih.

Pengaturan ini mengubah monitoring. Fitur tidak memindahkan kabel, mengubah router, menjalankan/restart aplikasi bisnis, atau menyinkronkan scrape target Prometheus secara otomatis.

## Persiapan deployment

- Pastikan backup database dan source aplikasi tersedia sebelum menerapkan paket. `npm run backup:mysql` tersedia pada proyek bila prosedur backup tersebut memang digunakan di server.
- Catat user pemilik proses dashboard. Output PM2 sesi root sebelumnya tidak memuat `dashboard-infra`; jangan membuat proses dashboard kedua sebagai root.
- Paket berisi file perubahan dengan struktur direktori proyek. `.env` dan `ecosystem.config.cjs` tidak termasuk.
- Tidak ada dependency baru. Perubahan `package.json` hanya menambah perintah verifikasi.

## Memasang paket

Unggah ZIP ke server, periksa isinya, lalu ekstrak ke direktori aplikasi dengan user yang memiliki izin menulis source. Contoh lokasi aplikasi yang digunakan dalam percakapan: `/var/www/dashboard-infra`.

```bash
unzip -l /tmp/dashboard-infra-monitoring-settings-20261109.zip
unzip -o /tmp/dashboard-infra-monitoring-settings-20261109.zip -d /var/www/dashboard-infra
```

Setelah itu gunakan user pemilik proses dashboard. Contoh berikut hanya berlaku bila proses benar-benar milik `server-wig`:

```bash
sudo -iu server-wig
cd /var/www/dashboard-infra
pm2 list
```

Jika `dashboard-infra` ditemukan, jalankan:

```bash
npm run deploy:check
node scripts/init-monitoring-storage.mjs
npm run build
pm2 restart dashboard-infra --update-env
pm2 status dashboard-infra
```

Migrasi menambahkan kolom `monitoring_config_items.revision` dan tabel `monitoring_config_revisions`. Nilai konfigurasi lama dipertahankan. Runtime juga memeriksa migrasi pada akses pertama; menjalankan script migrasi saat deployment membuat kegagalan izin/koneksi terlihat lebih awal.

Jika proses tidak ditemukan, identifikasi cara aplikasi dijalankan sebelum restart:

```bash
ps -eo user,pid,ppid,args | grep -E 'PM2|next-server|history-collector|dashboard-infra'
```

Gunakan nama proses atau unit systemd yang benar-benar ditemukan. Tidak perlu menjalankan `pm2 start ecosystem.config.cjs` untuk sekadar mencoba mengatasi pesan process not found.

Deployment memakai overlay ZIP akan membuat file source pada checkout server berubah. Kelola perubahan tersebut melalui alur Git yang digunakan organisasi sebelum menjalankan deploy berikutnya yang melakukan `git pull`.

## Penggunaan setelah deploy

### Perubahan IP

Settings → Perangkat & IP → pilih entri → ubah IP/hostname → Periksa & simpan → tinjau nilai → Terapkan perubahan. Identitas entri lama dikunci agar tidak membuat duplikat.

Perbarui scrape target Prometheus secara terpisah jika IP berubah. Perubahan IP gateway MikroTik yang masih tertulis langsung pada query kode merupakan pekerjaan terpisah; halaman ini mengelola target tambahan dan mapping interface.

### Perpindahan ether2 ke ether4

Settings → Interface & ISP → Pindahkan uplink ISP. Pilih port asal, port tujuan berperan unused, dan PPPoE dari ISP yang sama. Periksa tiga entri lalu terapkan. Gunakan fitur ini hanya jika mapping asal belum dipindahkan secara manual. Jika ether4 sudah menjadi WAN, cukup periksa form ether4, ether2, dan PPPoE; jangan memindahkan ulang dari port yang sudah unused.

### Perubahan daftar PM2

Settings → Aplikasi PM2 → Baru atau pilih kebijakan yang ada. Isi source sesuai kartu source PM2, nama aplikasi lengkap, dan mode monitoring. Gunakan Opsional/Abaikan untuk mengesampingkan nama lama yang masih diwajibkan environment. Menonaktifkan kebijakan tidak sama dengan mengabaikan aplikasi: aturan environment kembali berlaku.

### Riwayat dan pemulihan

Buka Riwayat → Periksa pemulihan. Pemulihan hanya diterapkan jika versi seluruh entri masih sesuai. Riwayat lama yang sudah ditimpa perubahan baru tidak dapat langsung dipulihkan. Satu pemindahan uplink dipulihkan sekaligus.

### Kesegaran data

- `Data terkini` menyatakan sumber dapat diperiksa dengan data yang cukup baru; target DOWN juga bisa menghasilkan data terkini.
- `Data kedaluwarsa` memerlukan pemeriksaan collector/scrape/cron snapshot.
- `Belum tersedia` tidak membuktikan layanan sehat maupun down.
- Heartbeat histori muncul setelah collector menyelesaikan satu siklus memakai kode baru.
- Default `PM2_SNAPSHOT_MAX_AGE_MS` dan `METRICS_MAX_AGE_MS` adalah 180000 ms. Batas heartbeat collector adalah tiga kali `HISTORY_COLLECT_INTERVAL_MS`.
- Snapshot PM2 menggunakan waktu modifikasi file sebagai acuan; pembaruan snapshot harus menghasilkan data PM2 baru, bukan hanya menyentuh file lama.

## Bukti verifikasi lokal

| Pemeriksaan | Hasil |
|---|---|
| Validasi, perpindahan uplink, migrasi skema lama, transaksi, edit bersamaan, rollback, dan snapshot PM2 | 20/20 lulus |
| HTTP autentikasi, origin, validasi, konflik, restore, transfer, kesegaran sampel, heartbeat, dan penghentian monitoring | 8/8 lulus |
| Lint file yang berubah | Lulus |
| Build final `npm run build -- --webpack`, termasuk TypeScript | Lulus |
| UI desktop dan mobile | Form, dialog pratinjau, simpan, restore, serta perlindungan edit ditinjau; lebar dokumen mobile 375 CSS px sama dengan viewport 375 CSS px |
| Console browser selama tinjauan | Tidak ditemukan error |
| Full test suite | Tidak dijalankan, sesuai permintaan |

MySQL uji berjalan terpisah pada `127.0.0.1:33079`, menggunakan database baru `infra_verify_*`. Prometheus tiruan berada pada port 33080 dan preview pada port 33081. Seluruh channel pengiriman notifikasi dinonaktifkan di environment preview. Tidak ada perubahan yang diterapkan ke database operasional.

Build Turbopack awal pada sandbox Windows tidak selesai dan dihentikan; build produksi diverifikasi dengan flag Webpack resmi Next.js. Ini tidak membuktikan masalah Turbopack pada Ubuntu.

Perintah uji dasar yang dapat diulang:

```bash
npm run verify:settings
```

Untuk uji transaksi gunakan server MySQL khusus pada port 33079 dan database baru dengan prefix `infra_verify_`, lalu jalankan `node scripts/verify-monitoring-settings.mjs --integration` dengan environment uji yang eksplisit. Script menolak host/port/nama database lain. Fixture HTTP tersedia pada `scripts/verification-prometheus.mjs`; pemeriksaan API memerlukan preview terisolasi dengan kredensial dummy yang tertulis di script dan seluruh channel notifikasi kosong.

## Batas pekerjaan

Paket ini menyelesaikan tahap pertama: pengaturan operasional, kebijakan/source PM2, kualitas data, serta perbaikan UI/UX terkait. Application Health/synthetic login, eskalasi PIC lengkap, sinkronisasi Prometheus otomatis, topologi dependensi, dan log/tracing belum termasuk implementasi ini.

## Pemeriksaan server setelah pemasangan

1. Login dan buka Settings; seluruh entri lama tetap terbaca.
2. Pastikan kartu source PM2 sesuai pemilik proses serta snapshot user lain.
3. Tunggu satu siklus collector dan periksa heartbeat histori.
4. Tinjau mapping ether2/ether4/PPPoE pada data server yang sebenarnya.
5. Periksa insiden dan Audit Log; verifikasi channel notifikasi melalui prosedur operasional sebelum menyatakan pengiriman nyata berhasil.
