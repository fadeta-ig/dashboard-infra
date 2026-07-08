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
      network/route.ts
      network/range/route.ts
      targets/route.ts
      mikrotik/discovery/route.ts
    page.tsx
    server/page.tsx
    network/page.tsx
    targets/page.tsx
    mikrotik/page.tsx
    layout.tsx
    globals.css
  components/
    dashboard/
    layout/
  lib/
    metrics.ts
    prometheus.ts
    rate-limit.ts
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
```

Jangan commit file `.env`. Jangan tampilkan password, token, SNMP community, atau secret lain di UI.


## Login dan Session

Aplikasi memakai halaman `/login`, bukan popup Basic Auth browser. Username dan password tetap dibaca dari `DASHBOARD_BASIC_USER` dan `DASHBOARD_BASIC_PASS`, lalu server membuat cookie session `HttpOnly` bernama `wig_monitoring_session`. Semua halaman dan endpoint API tetap dilindungi oleh `src/proxy.ts`.

Gunakan `DASHBOARD_SESSION_SECRET` yang panjang dan berbeda dari password login untuk menandatangani session cookie.

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
THRESHOLD_NETWORK_JITTER_MS_WARNING=10
THRESHOLD_NETWORK_JITTER_MS_CRITICAL=30
THRESHOLD_NETWORK_PACKET_LOSS_PERCENT_WARNING=1
THRESHOLD_NETWORK_PACKET_LOSS_PERCENT_CRITICAL=5
THRESHOLD_MIKROTIK_INTERFACE_UTILIZATION_PERCENT_WARNING=80
THRESHOLD_MIKROTIK_INTERFACE_UTILIZATION_PERCENT_CRITICAL=95
```

Halaman `/roadmap` membaca threshold aktif dan readiness metric dari backend. Jika metric wajib belum tersedia, panel readiness akan menandai kategori sebagai `Missing` atau `Partial`.
## Endpoint Metrics

Semua endpoint dilindungi Basic Auth melalui `src/proxy.ts`, memakai rate limit ringan, dan tidak menerima PromQL bebas dari frontend.

- `GET /api/metrics/summary`
- `GET /api/metrics/server`
- `GET /api/metrics/server/range?range=1h|6h|24h`
- `GET /api/metrics/network`
- `GET /api/metrics/network/range?range=1h|6h|24h`
- `GET /api/metrics/targets`
- `GET /api/metrics/mikrotik/discovery`

PromQL disimpan di backend pada `src/lib/metrics.ts`.

## Development

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`. Browser akan meminta Basic Auth sesuai `.env`.

## Production Build

```bash
npm run lint
npm run build
npm run start
```

Aplikasi memakai system font stack, bukan Google Fonts, agar build server internal tidak bergantung internet.

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

## Catatan Fase MikroTik

Halaman `/mikrotik` saat ini hanya discovery table. Traffic interface, RX/TX Mbps, status port, error, dan drop dibuat setelah metric SNMP aktual dari `snmp_if_mib` dan `snmp_switch_ports` terverifikasi di Prometheus.


