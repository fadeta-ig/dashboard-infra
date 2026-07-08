'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, Database, Gauge, HardDrive, Network, RefreshCcw, RouterIcon, ShieldCheck } from 'lucide-react';
import { StatusIndicator } from '@/components/dashboard/status-indicator';
import { getErrorMessage } from '@/lib/metrics';
import { ADDITIONAL_TARGET_SUGGESTIONS, MIKROTIK_INTERFACES, UBUNTU_SERVICES } from '@/lib/monitoring-config';

type ReadinessStatus = 'ready' | 'partial' | 'missing';

interface ReadinessItem {
  key: string;
  label: string;
  matcher: string;
  required: boolean;
  impact: string;
  available: boolean;
}

interface ReadinessCategory {
  key: string;
  title: string;
  description: string;
  status: ReadinessStatus;
  requiredReady: number;
  requiredTotal: number;
  availableTotal: number;
  total: number;
  items: ReadinessItem[];
}

interface ReadinessResponse {
  timestamp: string;
  prometheusReachable: boolean;
  thresholdNotes: Record<string, string>;
  categories: ReadinessCategory[];
}

const staticPlans = [
  {
    title: 'Server Ubuntu',
    icon: HardDrive,
    items: ['Swap usage', 'Disk inode', 'Disk read/write throughput', 'Systemd service health', 'Prometheus data path health'],
  },
  {
    title: 'Network & Internet',
    icon: Network,
    items: ['ICMP latency', 'Jitter 5m', 'Packet loss 5m', 'DNS probe', 'HTTP/HTTPS probe', 'SLA availability'],
  },
  {
    title: 'MikroTik SNMP',
    icon: RouterIcon,
    items: ['Upload/download Mbps', 'Port up/down', 'Top interface traffic', 'Error/drop', 'Router uptime', 'Interface alias mapping'],
  },
  {
    title: 'Alert Readiness',
    icon: BellRing,
    items: ['Warning/critical threshold', 'Cooldown window', 'Notification channel', 'Acknowledge flow', 'Incident timeline'],
  },
  {
    title: 'Security & Audit',
    icon: ShieldCheck,
    items: ['Session timeout', 'Login audit trail', 'HTTPS only', 'Firewall exposure check', 'No secret in UI'],
  },
  {
    title: 'Prometheus Health',
    icon: Database,
    items: ['Scrape duration', 'Scrape samples', 'TSDB head series', 'Exporter self-health', 'Target down'],
  },
];

const formulas = [
  { name: 'MikroTik Download Mbps', query: 'rate(ifHCInOctets{job=~"snmp_if_mib|snmp_switch_ports",instance="192.168.20.1"}[5m]) * 8 / 1000000' },
  { name: 'MikroTik Upload Mbps', query: 'rate(ifHCOutOctets{job=~"snmp_if_mib|snmp_switch_ports",instance="192.168.20.1"}[5m]) * 8 / 1000000' },
  { name: 'Jitter Approximation', query: 'stddev_over_time(probe_duration_seconds{job="blackbox_icmp"}[5m]) * 1000' },
  { name: 'Packet Loss 5m', query: '(1 - avg_over_time(probe_success{job="blackbox_icmp"}[5m])) * 100' },
];

const configTasks = [
  'Aktifkan atau validasi IF-MIB di SNMP Exporter untuk ifHCInOctets, ifHCOutOctets, ifOperStatus.',
  'Aktifkan Node Exporter systemd collector jika service health ingin ditampilkan.',
  'Tambahkan Blackbox DNS/HTTP modules jika ingin probe DNS dan website.',
  'Lengkapi IP target tambahan: DNS lokal, website publik/internal, switch/AP utama, dan NVR/CCTV.',
  'Tentukan interface WAN utama untuk ISP 1 agar traffic tidak double-count antara ether1 dan pppoe-out1.',
  'Tetapkan notification channel untuk fase alerting: dashboard only, Telegram, email, atau webhook.',
];

const configuredWanInterfaces = MIKROTIK_INTERFACES.filter((item) => item.role === 'wan');
const pendingTargets = ADDITIONAL_TARGET_SUGGESTIONS.filter((item) => item.suggestedTarget.includes('isi-') || item.suggestedTarget === 'https://example.com');
function categoryStatusToIndicator(status: ReadinessStatus) {
  if (status === 'ready') return 'healthy';
  if (status === 'partial') return 'warning';
  return 'unknown';
}

function readinessCopy(status: ReadinessStatus) {
  if (status === 'ready') return 'Ready';
  if (status === 'partial') return 'Partial';
  return 'Missing';
}

export default function RoadmapPage() {
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReadiness = useCallback(async () => {
    try {
      const response = await fetch('/api/metrics/readiness', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch monitoring readiness');
      const json = (await response.json()) as ReadinessResponse;
      setReadiness(json);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void fetchReadiness();
    }, 0);

    return () => {
      window.clearTimeout(initial);
    };
  }, [fetchReadiness]);

  const missingRequired = useMemo(() => (
    readiness?.categories.flatMap((category) => (
      category.items
        .filter((item) => item.required && !item.available)
        .map((item) => ({ ...item, category: category.title }))
    )) || []
  ), [readiness]);

  const missingOptional = useMemo(() => (
    readiness?.categories.flatMap((category) => (
      category.items
        .filter((item) => !item.required && !item.available)
        .map((item) => ({ ...item, category: category.title }))
    )) || []
  ), [readiness]);

  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fase 1 roadmap</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-primary">Monitoring Development Plan</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">Roadmap operasional, readiness metric, threshold aktif, dan konfigurasi yang perlu disiapkan.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchReadiness();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-muted"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh Readiness
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
          <div>
            <h2 className="font-semibold text-destructive">Readiness belum bisa dibaca</h2>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="panel-surface rounded-lg p-5">
          <p className="text-sm font-semibold text-muted-foreground">Prometheus Reachable</p>
          <div className="mt-4 flex items-center gap-3">
            <StatusIndicator status={readiness?.prometheusReachable ? 'healthy' : loading ? 'unknown' : 'critical'} text={readiness?.prometheusReachable ? 'Ready' : loading ? 'Checking' : 'Unavailable'} />
          </div>
        </section>
        <section className="panel-surface rounded-lg p-5">
          <p className="text-sm font-semibold text-muted-foreground">Required Missing</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{loading ? '-' : missingRequired.length}</p>
        </section>
        <section className="panel-surface rounded-lg p-5">
          <p className="text-sm font-semibold text-muted-foreground">Optional Missing</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{loading ? '-' : missingOptional.length}</p>
        </section>
      </div>

      <section className="panel-surface rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-white/60">
          <h2 className="font-semibold">Metric Readiness</h2>
          <p className="mt-1 text-xs text-muted-foreground">Metric wajib harus ready sebelum fase monitoring terkait dianggap lengkap.</p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-0 divide-y xl:divide-x xl:divide-y-0 divide-border">
          {(readiness?.categories || []).map((category) => (
            <div key={category.key} className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-950">{category.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
                </div>
                <StatusIndicator status={categoryStatusToIndicator(category.status)} text={readinessCopy(category.status)} />
              </div>
              <div className="mt-4 text-xs font-medium text-muted-foreground">
                Required {category.requiredReady}/{category.requiredTotal} / Available {category.availableTotal}/{category.total}
              </div>
              <div className="mt-4 space-y-2">
                {category.items.map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-4 rounded-md bg-muted/45 px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.impact}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusIndicator status={item.available ? 'healthy' : item.required ? 'critical' : 'unknown'} text={item.available ? 'Ready' : item.required ? 'Missing' : 'Optional'} />
                      <code className="text-[11px] text-slate-500">{item.matcher}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {loading && (
            <div className="p-6 text-sm text-muted-foreground">Checking metric readiness...</div>
          )}
        </div>
      </section>

      <section className="panel-surface rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-white/60">
          <h2 className="font-semibold">Data Operasional yang Sudah Masuk</h2>
          <p className="mt-1 text-xs text-muted-foreground">Mapping ini dipakai backend untuk fase MikroTik dan Ubuntu service health tanpa menampilkan secret.</p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 divide-y xl:divide-x xl:divide-y-0 divide-border">
          <div className="p-6">
            <p className="text-sm font-semibold text-slate-950">WAN & ISP Capacity</p>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              {configuredWanInterfaces.map((item) => (
                <div key={item.name} className="rounded-md bg-muted/45 px-3 py-2">
                  <p className="font-semibold text-slate-800">{item.name} / {item.isp}</p>
                  <p className="mt-0.5">Down {item.downloadCapacityMbps || 0} Mbps / Up {item.uploadCapacityMbps || 0} Mbps</p>
                  <p className="mt-1 text-xs text-slate-500">{item.includeInWanTotal === false ? 'Physical monitor, not total source' : 'Included in WAN total'}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="p-6">
            <p className="text-sm font-semibold text-slate-950">MikroTik Interface Mapping</p>
            <p className="mt-2 text-sm text-muted-foreground">{MIKROTIK_INTERFACES.length} interface terdaftar: WAN, trunk, VLAN, VPN, loopback, dan port unused.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {MIKROTIK_INTERFACES.filter((item) => item.expectedUp).map((item) => (
                <span key={item.name} className="rounded-md bg-muted/60 px-2.5 py-1 text-xs font-semibold text-slate-700">{item.name}</span>
              ))}
            </div>
          </div>
          <div className="p-6">
            <p className="text-sm font-semibold text-slate-950">Ubuntu Services</p>
            <p className="mt-2 text-sm text-muted-foreground">{UBUNTU_SERVICES.length} service pattern dikonfigurasi untuk dicek lewat Node Exporter systemd collector.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {UBUNTU_SERVICES.map((service) => (
                <span key={service.key} className="rounded-md bg-muted/60 px-2.5 py-1 text-xs font-semibold text-slate-700">{service.label}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-border bg-amber-50 px-6 py-4 text-sm text-amber-800">
          Belum ada IF-MIB live counter pada discovery terakhir, jadi upload/download MikroTik akan tampil setelah ifHCInOctets, ifHCOutOctets, dan ifOperStatus tersedia di Prometheus.
        </div>
      </section>

      <section className="panel-surface rounded-lg p-6">
        <h2 className="font-semibold">Target Tambahan yang Menunggu Data</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
          {pendingTargets.map((target) => (
            <div key={target.key} className="rounded-md bg-muted/45 px-3 py-3">
              <p className="font-semibold text-slate-800">{target.label}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{target.type}</p>
              <p className="mt-2 text-muted-foreground">{target.purpose}</p>
              <code className="mt-3 block text-xs text-slate-500">{target.suggestedTarget}</code>
            </div>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
        <section className="panel-surface rounded-lg p-6">
          <h2 className="font-semibold">Threshold Aktif</h2>
          <div className="mt-4 space-y-3 text-sm">
            {Object.entries(readiness?.thresholdNotes || {}).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-md bg-muted/45 px-3 py-2">
                <span className="font-semibold capitalize text-slate-800">{key}</span>
                <span className="text-right text-muted-foreground">{value}</span>
              </div>
            ))}
            {!loading && !readiness && <p className="text-sm text-muted-foreground">Threshold belum bisa dibaca.</p>}
          </div>
        </section>

        <section className="panel-surface rounded-lg p-6">
          <h2 className="font-semibold">Yang Perlu Dikonfigurasi</h2>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            {configTasks.map((task) => (
              <div key={task} className="flex gap-3 rounded-md bg-muted/45 px-3 py-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-healthy" />
                <span>{task}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {staticPlans.map((section) => (
          <section key={section.title} className="panel-surface rounded-lg p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-slate-950 p-2 text-white">
                <section.icon className="h-4 w-4" />
              </div>
              <h2 className="font-semibold">{section.title}</h2>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {section.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-healthy flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="panel-surface rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-white/60 flex items-center gap-3">
          <Gauge className="h-5 w-5 text-slate-950" />
          <div>
            <h2 className="font-semibold">PromQL Pengembangan</h2>
            <p className="text-xs text-muted-foreground mt-1">Query tetap hardcoded di backend, bukan dikirim bebas dari frontend.</p>
          </div>
        </div>
        <div className="divide-y divide-border">
          {formulas.map((formula) => (
            <div key={formula.name} className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3 px-6 py-4 text-sm">
              <p className="font-semibold text-slate-800">{formula.name}</p>
              <code className="rounded-md bg-slate-950 px-3 py-2 text-xs text-slate-100 overflow-x-auto">{formula.query}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

