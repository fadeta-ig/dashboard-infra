# Monitoring Server Ubuntu WIG

Monitoring Server Ubuntu WIG adalah dashboard monitoring internal berbasis Next.js App Router. Dashboard ini mengambil metrics dari Prometheus melalui backend Next.js Route Handlers, sehingga browser tidak pernah mengakses Prometheus atau exporter secara langsung.

Dashboard ini tidak menggunakan Grafana, Wazuh, atau dashboard monitoring pihak ketiga.

## Arsitektur

Browser -> Next.js Dashboard -> Next.js API Route Handler -> Prometheus lokal `http://127.0.0.1:9090` -> Exporter.

Prometheus, Node Exporter, Blackbox Exporter, dan SNMP Exporter harus tetap bind ke localhost atau jaringan internal. Jangan expose port `9090`, `9100`, `9115`, atau `9116` ke publik.

## Struktur Folder Inti

```text
src/
  app/
    api/metrics/
      summary/route.ts
      server/route.ts
      server/range/route.ts
      server/services/route.ts
      network/route.ts
      network/range/route.ts
      targets/route.ts
      readiness/route.ts
      mikrotik/discovery/route.ts
      mikrotik/overview/route.ts
    page.tsx
    server/page.tsx
    network/page.tsx
    targets/page.tsx
    mikrotik/page.tsx
    panduan/page.tsx
    login/page.tsx
    layout.tsx
    globals.css
  components/
    dashboard/
    layout/
  lib/
    auth.ts
    metrics.ts
    monitoring-config.ts
    prometheus.ts
    rate-limit.ts
    thresholds.ts
    types.ts
  proxy.ts
```

## Environment

Buat file `.env` di root project:

```bash
PROMETHEUS_URL=http://127.0.0.1:9090
DASHBOARD_BASIC_USER=admin-it
DASHBOARD_BASIC_PASS=gunakan-password-panjang-yang-unik
DASHBOARD_SESSION_SECRET=gunakan-secret-session-yang-berbeda
# Opsional: isi false jika dashboard production masih diakses lewat HTTP internal/IP:3000.
# Untuk HTTPS publik, kosongkan atau isi true.
DASHBOARD_COOKIE_SECURE=
APP_BASE_URL=http://127.0.0.1:3000
APP_TIME_ZONE=Asia/Jakarta
OPS_INTERNAL_TOKEN=gunakan-token-internal-panjang-acak
HISTORY_COLLECT_INTERVAL_MS=60000
ALERT_WEBHOOK_URL=
ALERT_WEBHOOK_TOKEN=
ALERT_COOLDOWN_MS=900000
ALERT_TIME_ZONE=Asia/Jakarta
ALERT_EMAIL_SMTP_HOST=
ALERT_EMAIL_SMTP_PORT=587
ALERT_EMAIL_SMTP_SECURE=false
ALERT_EMAIL_SMTP_USER=
ALERT_EMAIL_SMTP_PASS=
ALERT_EMAIL_FROM=
ALERT_EMAIL_TO=
ALERT_WHATSAPP_TOKEN=
ALERT_WHATSAPP_PHONE_NUMBER_ID=
ALERT_WHATSAPP_TO=
ALERT_WHATSAPP_API_VERSION=v20.0
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=infra_app
MYSQL_PASSWORD=ganti-password-kuat
MYSQL_DATABASE=infra
```

Jangan commit file `.env`. Jangan tampilkan password, token, SNMP community, atau secret lain di UI.


## Login dan Session

Aplikasi memakai halaman `/login`, bukan popup Basic Auth browser. Username dan password tetap dibaca dari `DASHBOARD_BASIC_USER` dan `DASHBOARD_BASIC_PASS`, lalu server membuat cookie session `HttpOnly` bernama `wig_monitoring_session`. Semua halaman dan endpoint API tetap dilindungi oleh `src/proxy.ts`.

Gunakan `DASHBOARD_SESSION_SECRET` yang panjang dan berbeda dari password login untuk menandatangani session cookie.


## Troubleshooting Login

Jika username/password benar tetapi setelah klik masuk tetap kembali ke halaman login, biasanya cookie session tidak tersimpan oleh browser.

- Jika dashboard diakses lewat HTTPS Nginx, pastikan Nginx mengirim header `X-Forwarded-Proto $scheme` seperti contoh konfigurasi di bawah.
- Jika dashboard production masih diakses langsung via `http://IP-SERVER:3000` atau HTTP internal, tambahkan `DASHBOARD_COOKIE_SECURE=false` di `.env`, lalu restart service dashboard.
- Jika muncul pesan `Username atau password tidak sesuai`, pastikan proses Node membaca `.env` yang benar. Setelah mengubah `.env`, selalu restart `pm2` atau `systemd` service.
- Jika memakai systemd `EnvironmentFile`, pastikan file `.env` berada di path yang sama dengan konfigurasi service dan tidak ada spasi tersembunyi setelah username/password.


## Ubuntu Service Health Setup

Panel Ubuntu Service Health membutuhkan metric `node_systemd_unit_state` dari Node Exporter. Jika panel menampilkan `Collector missing`, aktifkan collector systemd pada service Node Exporter.

Cek kondisi saat ini di server:

```bash
curl -s 'http://127.0.0.1:9090/api/v1/query?query=node_systemd_unit_state' | head
curl -s 'http://127.0.0.1:9100/metrics' | grep node_systemd_unit_state | head
systemctl cat node_exporter
systemctl status node_exporter --no-pager
```

Contoh override systemd Node Exporter:

```bash
sudo systemctl edit node_exporter
```

Isi override, sesuaikan path binary jika berbeda:

```ini
[Service]
ExecStart=
ExecStart=/usr/local/bin/node_exporter --collector.systemd --collector.systemd.unit-include='(nginx|apache2?|php.*fpm|mysql|mariadb|node|pm2|ssh|sshd).*\.service'
```

Reload dan restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart node_exporter
sudo systemctl status node_exporter --no-pager
```

Jika collector sudah ready tetapi unit tetap tidak match, kirim output ini agar matcher service di dashboard disesuaikan:

```bash
systemctl list-units --type=service --all | egrep 'nginx|apache|php|mysql|mariadb|node|pm2|ssh|dashboard'
curl -s 'http://127.0.0.1:9100/metrics' | grep 'node_systemd_unit_state' | egrep 'nginx|apache|php|mysql|mariadb|node|pm2|ssh|dashboard' | head -50
```

## PM2 Process Health

Halaman `/server` membaca `pm2 jlist` dari proses dashboard untuk menampilkan aplikasi PM2, status online, PID, CPU, memory, restart count, dan uptime. PM2 bersifat per-user; PM2 milik `root` tidak otomatis terlihat oleh dashboard yang berjalan sebagai user `server-wig`.

Default required app:

```bash
PM2_REQUIRED_APPS=dashboard-infra,dashboard-history-collector
```

Jika ada aplikasi lain yang wajib aktif, misalnya `ktia`, tambahkan di `.env`:

```bash
PM2_REQUIRED_APPS=dashboard-infra,dashboard-history-collector,ktia
```

Jika ada aplikasi PM2 yang tidak ingin ditampilkan dan tidak ingin dimonitor, gunakan:

```bash
PM2_IGNORED_APPS=ktia
```

Untuk source tertentu:

```bash
PM2_IGNORED_APPS=server-wig:ktia
```

Untuk membaca PM2 milik `root`, buat snapshot JSON yang bisa dibaca user dashboard:

```bash
sudo mkdir -p /var/lib/dashboard-infra
sudo sh -c 'NO_COLOR=1 PM2_HOME=/root/.pm2 /usr/bin/pm2 jlist > /var/lib/dashboard-infra/root-pm2-jlist.json'
sudo chown server-wig:server-wig /var/lib/dashboard-infra/root-pm2-jlist.json
sudo chmod 640 /var/lib/dashboard-infra/root-pm2-jlist.json
```

Tambahkan cron root agar snapshot diperbarui setiap menit:

```cron
* * * * * NO_COLOR=1 PM2_HOME=/root/.pm2 /usr/bin/pm2 jlist > /var/lib/dashboard-infra/root-pm2-jlist.json && chown server-wig:server-wig /var/lib/dashboard-infra/root-pm2-jlist.json && chmod 640 /var/lib/dashboard-infra/root-pm2-jlist.json
```

Lalu set `.env` dashboard:

```bash
PM2_SOURCE_LABEL=server-wig
PM2_EXTRA_JLIST_FILES=root:/var/lib/dashboard-infra/root-pm2-jlist.json
PM2_REQUIRED_APPS=dashboard-infra,dashboard-history-collector,root:formwig,root:hris,root:scan-resi-wig,root:theformulator,root:undangan-wig,root:wig-dashboard,root:wig-display-backend,root:wig-music-backend,root:wig-music-frontend
```

Gunakan format `source:nama-app` untuk required app dari source tambahan. Pastikan nama app tidak terpotong; ambil nama lengkap dari `pm2 jlist` JSON jika tabel terminal menampilkan `...`.

Jika binary PM2 tidak ada di `PATH` proses Node, set path eksplisit:

```bash
PM2_BIN=/usr/bin/pm2
```

Collector membuat incident untuk required PM2 app yang tidak `online`, dan audit log `pm2_state_changed` saat status/PID/restart berubah.


## Target ICMP Tambahan

Dashboard Network menampilkan target tambahan berikut jika sudah masuk ke job `blackbox_icmp_mki_devices` Prometheus. Dashboard juga tetap membaca job lama `blackbox_icmp` untuk gateway/Google/Cloudflare:

- Public IP: `202.152.141.27`
- CCTV MKI Area 1: `192.168.40.253`
- CCTV MKI Area 2: `192.168.40.254`
- CCTV WIG Plant II: `10.10.77.2`
- Fingerprint WIG Plant II: `10.10.77.3`
- Fingerprint MKI: `192.168.20.22`
- PBX Dinstar: `192.168.30.253`
- Base Station Grandstream: `192.168.30.254`

Jika target belum ada di Prometheus, UI akan menampilkan status `Unknown`. Tambahkan target tersebut ke scrape config `blackbox_icmp_mki_devices`, reload Prometheus, lalu tunggu scrape berikutnya. Dashboard akan match berdasarkan label `ip`, `target`, `__param_target`, atau `instance`.

## Best Practice Pengembangan Monitoring

Tambahan yang direkomendasikan untuk monitoring end-to-end:

- Server: swap usage, inode usage, disk read/write throughput, network throughput, systemd service health, reboot required, dan uptime.
- Prometheus: target down, scrape duration, scrape samples, TSDB head series, rule evaluation duration, dan exporter self-health.
- Network: ICMP availability, latency, jitter 5 menit, packet loss 5 menit, DNS probe, HTTP/HTTPS probe, dan SLA availability.
- MikroTik: upload/download Mbps dari `ifHCInOctets`/`ifHCOutOctets`, port status, interface error/drop, top interface by traffic, router uptime, dan alias interface yang human-readable.
- Alerting: threshold warning/critical, cooldown window, acknowledgement, delivery ke Telegram/email/webhook, dan incident timeline.

Query MikroTik awal yang dipakai backend:

```promql
rate(ifHCInOctets{job=~"snmp_if_mib|snmp_switch_ports",instance="192.168.20.1"}[5m]) * 8 / 1000000
rate(ifHCOutOctets{job=~"snmp_if_mib|snmp_switch_ports",instance="192.168.20.1"}[5m]) * 8 / 1000000
stddev_over_time(probe_duration_seconds{job="blackbox_icmp"}[5m]) * 1000
(1 - avg_over_time(probe_success{job="blackbox_icmp"}[5m])) * 100
```

## Threshold Operasional

Threshold default sudah tersedia di backend dan bisa dioverride lewat `.env` tanpa mengubah kode:

```bash
THRESHOLD_SERVER_CPU_PERCENT_WARNING=70
THRESHOLD_SERVER_CPU_PERCENT_CRITICAL=85
THRESHOLD_SERVER_RAM_PERCENT_WARNING=75
THRESHOLD_SERVER_RAM_PERCENT_CRITICAL=85
THRESHOLD_SERVER_DISK_PERCENT_WARNING=80
THRESHOLD_SERVER_DISK_PERCENT_CRITICAL=90
THRESHOLD_SERVER_LOAD1_WARNING=2
THRESHOLD_SERVER_LOAD1_CRITICAL=4
THRESHOLD_NETWORK_PING_MS_WARNING=50
THRESHOLD_NETWORK_PING_MS_CRITICAL=100
THRESHOLD_NETWORK_LATENCY_TOLERANT_DOMAINS=fingerprint,cctv
THRESHOLD_NETWORK_LATENCY_TOLERANT_WARNING_AFTER_MS=300000
THRESHOLD_NETWORK_LATENCY_TOLERANT_CRITICAL_AFTER_MS=28800000
THRESHOLD_NETWORK_JITTER_MS_WARNING=10
THRESHOLD_NETWORK_JITTER_MS_CRITICAL=30
THRESHOLD_NETWORK_PACKET_LOSS_PERCENT_WARNING=1
THRESHOLD_NETWORK_PACKET_LOSS_PERCENT_CRITICAL=5
THRESHOLD_MIKROTIK_INTERFACE_UTILIZATION_PERCENT_WARNING=80
THRESHOLD_MIKROTIK_INTERFACE_UTILIZATION_PERCENT_CRITICAL=95
```

Halaman `/panduan` dan panel readiness membaca threshold aktif serta readiness metric dari backend. Jika metric wajib belum tersedia, panel readiness akan menandai kategori sebagai `Missing` atau `Partial`.

## Endpoint Metrics

Semua endpoint dilindungi session auth melalui `src/proxy.ts`, memakai rate limit ringan, dan tidak menerima PromQL bebas dari frontend.

- `GET /api/metrics/summary`
- `GET /api/metrics/server`
- `GET /api/metrics/server/range?range=1h|6h|24h`
- `GET /api/metrics/server/services`
- `GET /api/metrics/server/pm2`
- `GET /api/metrics/network`
- `GET /api/metrics/network/range?range=1h|6h|24h`
- `GET /api/metrics/targets`
- `GET /api/metrics/readiness`
- `GET /api/metrics/mikrotik/discovery`
- `GET /api/metrics/mikrotik/overview`
- `GET /api/ops/analytics/overview?days=14`
- `GET /api/ops/config`
- `GET /api/ops/history/incidents?limit=200`
- `GET /api/ops/history/audit?limit=200`
- `GET /api/ops/noc`
- `GET /api/ops/reports/monthly?month=YYYY-MM`
- `GET /api/ops/reports/monthly/pdf?month=YYYY-MM`
- `POST /api/ops/config`
- `POST /api/ops/history/collect`
- `POST /api/ops/history/incidents/ack`
- `POST /api/ops/storage/init`

PromQL disimpan di backend pada `src/lib/metrics.ts` dan route handler terkait.

Endpoint `/api/ops/*` tetap private. Route collector bisa dipanggil oleh session login valid atau header internal `x-ops-token` yang cocok dengan `OPS_INTERNAL_TOKEN`.

## Monitoring History dan Audit Log

Fondasi history storage sekarang sudah aktif di MySQL untuk kebutuhan:

- Incident timeline down/up target.
- Audit log operasional.
- Snapshot report bulanan tahap berikutnya.
- Health score dan capacity planning tahap berikutnya.

Tabel yang dibuat oleh inisialisasi storage:

- `monitoring_incidents`
- `monitoring_audit_events`
- `monitoring_state_snapshots`
- `report_snapshots`
- `health_scores`
- `capacity_daily`
- `monitoring_alert_deliveries`
- `monitoring_config_items`

Halaman UI yang sudah tersedia:

- `/noc` untuk view operator NOC: SLA kategori, incident open, dan maintenance aktif.
- `/settings` untuk kelola target ICMP, interface MikroTik, service Ubuntu, SLA policy, dan maintenance window dari database.
- `/analytics` untuk health score dan capacity planning harian.
- `/reports` untuk report bulanan dan download PDF.
- `/incidents` untuk histori incident target down/up.
- `/audit` untuk event audit operasional seperti reboot required, service restart state, collector missing, dan metric gap.

P0 hardening yang sudah aktif:

- Login memakai rate limit ringan untuk mengurangi brute-force terhadap `/api/auth/login`.
- Incident open dilindungi unique key `open_incident_key`, sehingga worker collector ganda tidak membuat incident open dobel untuk entity yang sama.
- Incident open bisa di-acknowledge dari halaman `/incidents`; actor diambil dari session login dan tercatat di audit log.
- Collector mengirim alert lifecycle `opened`, `resolved`, dan `acknowledged` ke webhook generik, email SMTP, dan WhatsApp jika channel terkait dikonfigurasi.
- Alert delivery dicatat ke `monitoring_alert_deliveries` dengan status `sent`, `failed`, atau `skipped`.
- Cooldown alert dikendalikan oleh `ALERT_COOLDOWN_MS` default 900000 ms.
- Waktu alert diformat memakai `ALERT_TIME_ZONE` atau `APP_TIME_ZONE`; default `Asia/Jakarta`.
- Domain latency yang dikenal flapping, default `fingerprint,cctv`, memakai toleransi khusus: flapping singkat tidak dibuat incident, warning tidak mengirim notif, dan critical baru dikirim setelah `THRESHOLD_NETWORK_LATENCY_TOLERANT_CRITICAL_AFTER_MS`.

P1/P2 konfigurasi operasional:

- Target ICMP, interface MikroTik, dan service Ubuntu sekarang bisa dikelola dari `/settings`; nilai awal disalin dari konfigurasi statis saat tabel config pertama kali dibuat.
- SLA policy per kategori berada di tipe config `sla_policy` dengan field `targetAvailabilityPercent`, `responseMinutes`, dan `resolutionMinutes`.
- Maintenance window berada di tipe config `maintenance_window`; scope `all`, `domain`, atau `entity` akan menekan pengiriman alert selama window aktif, tetapi lifecycle incident tetap tercatat.
- `/noc` memakai config aktif dari database dan auto-refresh untuk kebutuhan operator.

Payload webhook alert berbentuk JSON dan menyertakan `eventType`, `generatedAt`, serta detail incident. Jika `ALERT_WEBHOOK_TOKEN` diisi, dashboard mengirim header `Authorization: Bearer <token>`.

Konfigurasi email SMTP:

```bash
ALERT_EMAIL_SMTP_HOST=smtp.example.com
ALERT_EMAIL_SMTP_PORT=587
ALERT_EMAIL_SMTP_SECURE=false
ALERT_EMAIL_SMTP_USER=monitoring@example.com
ALERT_EMAIL_SMTP_PASS=app-password-atau-password-smtp
ALERT_EMAIL_FROM=monitoring@example.com
ALERT_EMAIL_TO=it@example.com,manager@example.com
```

Konfigurasi WhatsApp Cloud API:

```bash
ALERT_WHATSAPP_TOKEN=token-whatsapp-cloud-api
ALERT_WHATSAPP_PHONE_NUMBER_ID=phone-number-id
ALERT_WHATSAPP_TO=6281234567890,6289876543210
ALERT_WHATSAPP_API_VERSION=v20.0
```

Nomor WhatsApp tujuan memakai format internasional tanpa `+`. Untuk WhatsApp Cloud API production, nomor pengirim harus sudah terdaftar di Meta, token masih valid, dan nomor tujuan harus memenuhi aturan opt-in/izin komunikasi organisasi.

## Health Score, Capacity, dan Temperature

Tahap ini menambahkan:

- Health score harian untuk domain `server`, `network`, `internet`, `prometheus`, dan `mikrotik`.
- Capacity snapshot harian untuk CPU, RAM, disk root, RX/TX network, dan suhu server.
- Monitoring suhu server dari metric `node_hwmon_temp_celsius` atau fallback `node_thermal_zone_temp`.
- Halaman `/analytics` untuk melihat score domain dan trend kapasitas.

Catatan:

- Jika metric suhu tidak tersedia di Node Exporter, UI akan menampilkan `N/A`.
- Collector akan meng-upsert `health_scores` dan `capacity_daily` setiap siklus history.

## Report Bulanan PDF

Report bulanan tahap ini sudah tersedia dan menghasilkan:

- Executive summary non-teknis.
- Availability keseluruhan dan per target.
- Top incident berdasarkan durasi dampak pada bulan terpilih.
- Audit highlights.
- Rekomendasi prioritas.
- Download PDF dengan logo WIG.

Sumber data report:

- `monitoring_incidents`
- `monitoring_audit_events`
- target aktif dari Prometheus saat report digenerate

Catatan perhitungan:

- Incident yang overlap lintas bulan tetap dihitung hanya pada porsi waktu yang masuk ke bulan report.
- Untuk bulan berjalan, report memakai window parsial sampai waktu generate terakhir.
- Snapshot report disimpan ke tabel `report_snapshots`.

## Inisialisasi Database

Jalankan sekali setelah `.env` MySQL valid:

```bash
node scripts/init-monitoring-storage.mjs
```

Jika berhasil, script akan membuat database dan tabel yang dibutuhkan. Pada server production, sangat disarankan memakai user aplikasi seperti `infra_app`, bukan `root`.

## Backup dan Retention MySQL

Backup manual:

```bash
npm run backup:mysql
```

Environment opsional:

```bash
MYSQL_BACKUP_DIR=/var/backups/dashboard-infra/mysql
MYSQL_BACKUP_RETENTION_DAYS=14
```

Script memakai `mysqldump --single-transaction --routines --triggers`, menulis file `.sql`, dan menghapus backup lama sesuai retention. Jalankan lewat cron/systemd timer di server production.

## Worker Collector Periodik

Collector periodik berjalan terpisah dari web app dan akan menulis history ke MySQL pada interval tertentu.

Manual run:

```bash
npm run history:collect
```

Worker ini membutuhkan:

- `APP_BASE_URL`
- `OPS_INTERNAL_TOKEN`
- `HISTORY_COLLECT_INTERVAL_MS`
- konfigurasi `MYSQL_*`

Jika channel alert dikonfigurasi, worker juga akan mengirim alert incident lifecycle ke channel tersebut. Channel yang kosong tetap dicatat sebagai `skipped` tanpa pengiriman keluar.

## Development

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`, lalu login melalui halaman `/login` memakai `DASHBOARD_BASIC_USER` dan `DASHBOARD_BASIC_PASS` dari `.env`.

## Production Build

```bash
npm run lint
npm run build
npm run start
```

Aplikasi memakai system font stack, bukan Google Fonts, agar build server internal tidak bergantung internet.

## Deploy dengan PM2

Project sekarang menyediakan `ecosystem.config.cjs` untuk dua proses:

- `dashboard-infra` untuk Next.js app.
- `dashboard-history-collector` untuk collector histori periodik.

Langkah awal di server:

```bash
npm install
node scripts/init-monitoring-storage.mjs
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Deploy berikutnya:

```bash
npm run deploy
```

Script deploy sekarang akan:

- menjalankan preflight `.env` dengan `npm run deploy:check`
- `git pull`
- `npm install`
- `npm run build`
- inisialisasi storage schema
- `pm2 startOrReload ecosystem.config.cjs --update-env`

Preflight deploy akan gagal jika environment wajib belum lengkap, password dashboard masih default/lemah, `DASHBOARD_SESSION_SECRET` terlalu pendek, atau `OPS_INTERNAL_TOKEN` terlalu pendek. Ini disengaja agar production tidak berjalan dengan konfigurasi lemah.

Jika `git pull` gagal karena local changes di server, cek dulu file yang berubah dengan:

```bash
git status
```

Lalu putuskan apakah file itu memang perubahan server yang harus dipertahankan, di-commit, atau di-restore.

## Deploy di Ubuntu dengan systemd

Contoh lokasi deploy:

```bash
sudo mkdir -p /opt/infradash
sudo chown -R $USER:$USER /opt/infradash
cd /opt/infradash
```

Salin project, install dependency, build, lalu buat `.env` production:

```bash
npm ci
npm run build
nano .env
```

Contoh service systemd:

```ini
[Unit]
Description=InfraDash Next.js Monitoring Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/infradash
Environment=NODE_ENV=production
EnvironmentFile=/opt/infradash/.env
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Simpan sebagai `/etc/systemd/system/infradash.service`, lalu jalankan:

```bash
sudo systemctl daemon-reload
sudo systemctl enable infradash
sudo systemctl start infradash
sudo systemctl status infradash
```

## Nginx Reverse Proxy HTTPS

Gunakan Nginx di depan Next.js. Next.js cukup listen di `127.0.0.1:3000`.

```nginx
server {
    listen 80;
    server_name dashboard.example.com;

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name dashboard.example.com;

    ssl_certificate /etc/letsencrypt/live/dashboard.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.example.com/privkey.pem;

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
    }
}
```

Aktifkan config:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Untuk HTTPS publik, gunakan Certbot atau sertifikat internal yang dipercaya organisasi.

## Firewall dan Exposure

Port yang boleh dibuka ke publik hanya `80` dan `443` jika dashboard memakai domain publik melalui Nginx.

Prometheus dan exporter tetap internal:

```bash
sudo ufw deny 9090/tcp
sudo ufw deny 9100/tcp
sudo ufw deny 9115/tcp
sudo ufw deny 9116/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Jika Next.js listen di `127.0.0.1:3000`, port `3000` juga tidak perlu dibuka publik.

## Data Operasional yang Sudah Dikonfigurasi

Mapping fase 1 sudah memakai data operasional berikut:

- MikroTik gateway: `192.168.20.1`.
- ISP 1 Indihome: `ether1-INDIHOME`, kapasitas 150 Mbps download / 50 Mbps upload.
- ISP 2 Citranet: `pppoe-out1` sebagai sumber total WAN dan `ether2` sebagai monitor fisik, kapasitas 200 Mbps download / 200 Mbps upload.
- LAN trunk: `ether3`.
- VLAN aktif: `10-Jaringan`, `20-VoIP`, `30-CCTV`.
- VPN: `<l2tp-user-plant2>`.
- Service Ubuntu yang dicek: `nginx`, `apache`, `php-fpm`, `mysql`, `mariadb`, `node`, `pm2`, dan `ssh`.

Catatan MikroTik: IF-MIB sudah bisa dibaca jika Prometheus memiliki `ifHCInOctets`, `ifHCOutOctets`, `ifOperStatus`, `ifInErrors`, `ifOutErrors`, `ifInDiscards`, `ifOutDiscards`, dan `sysUpTime`. Dashboard memakai metric tersebut untuk traffic, status port, error/drop, dan uptime router.

## Konfigurasi yang Masih Diperlukan

- Aktifkan Node Exporter systemd collector agar `node_systemd_unit_state` tersedia untuk service health. Contoh flag: `--collector.systemd --collector.systemd.unit-include='(nginx|apache2?|php.*fpm|mysql|mariadb|node|pm2|ssh|sshd).*\.service'`.
- Validasi modul SNMP Exporter `if_mib` dan `switch_ports` agar mengeluarkan IF-MIB counter/status, bukan hanya `snmp_scrape_*`.
- Validasi bahwa sumber traffic WAN tetap memakai logical `pppoe-out1` untuk Citranet dan physical `ether1-INDIHOME` untuk Indihome, supaya tidak double-count.
- Lengkapi target tambahan untuk DNS lokal, HTTP/HTTPS probe domain kantor, switch/AP utama, dan NVR/CCTV.
- Setelah IF-MIB tersedia, fase berikutnya bisa menambahkan top interface traffic, error/drop, port status real-time, dan alert utilization.

## Catatan Fase MikroTik

Halaman `/mikrotik` sekarang menampilkan mapping interface, kapasitas ISP, upload/download WAN, router uptime, ping gateway, jitter, error/drop 5 menit, packet loss, status port, dan discovery table. Angka live akan tampil selama job `snmp_if_mib` dan `snmp_system` menghasilkan metric yang dibutuhkan.
