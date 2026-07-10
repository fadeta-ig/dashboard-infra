import { prometheusSeriesQuery } from '@/lib/prometheus';
import { nowIso } from '@/lib/metrics';
import { describeThreshold, getMonitoringThresholds } from '@/lib/thresholds';

export type ReadinessStatus = 'ready' | 'partial' | 'missing';

export interface MetricRequirement {
  key: string;
  label: string;
  matcher: string;
  required: boolean;
  impact: string;
}

export interface CategoryRequirement {
  key: string;
  title: string;
  description: string;
  items: MetricRequirement[];
}

export const READINESS_REQUIREMENTS: CategoryRequirement[] = [
  {
    key: 'server',
    title: 'Server Ubuntu',
    description: 'Metric host dari Node Exporter untuk resource server.',
    items: [
      { key: 'node_cpu_seconds_total', label: 'CPU usage', matcher: 'node_cpu_seconds_total', required: true, impact: 'CPU card dan chart.' },
      { key: 'node_memory_MemAvailable_bytes', label: 'RAM available', matcher: 'node_memory_MemAvailable_bytes', required: true, impact: 'RAM usage dan RAM available.' },
      { key: 'node_filesystem_size_bytes', label: 'Filesystem size', matcher: 'node_filesystem_size_bytes', required: true, impact: 'Disk usage.' },
      { key: 'node_filesystem_files_free', label: 'Filesystem inode free', matcher: 'node_filesystem_files_free', required: false, impact: 'Roadmap inode usage.' },
      { key: 'node_disk_read_bytes_total', label: 'Disk I/O', matcher: 'node_disk_read_bytes_total', required: false, impact: 'Roadmap disk read/write throughput.' },
      { key: 'node_systemd_unit_state', label: 'Systemd unit state', matcher: 'node_systemd_unit_state', required: false, impact: 'Roadmap service health.' },
    ],
  },
  {
    key: 'network',
    title: 'Network & Internet',
    description: 'Metric Blackbox Exporter untuk kualitas koneksi.',
    items: [
      { key: 'probe_success', label: 'Probe success', matcher: 'probe_success', required: true, impact: 'UP/DOWN target dan packet loss.' },
      { key: 'probe_duration_seconds', label: 'Probe duration', matcher: 'probe_duration_seconds', required: true, impact: 'Ping latency dan jitter.' },
      { key: 'probe_http_status_code', label: 'HTTP probe status', matcher: 'probe_http_status_code', required: false, impact: 'Roadmap HTTP/HTTPS endpoint probe.' },
      { key: 'probe_dns_lookup_time_seconds', label: 'DNS probe timing', matcher: 'probe_dns_lookup_time_seconds', required: false, impact: 'Roadmap DNS probe.' },
    ],
  },
  {
    key: 'mikrotik',
    title: 'MikroTik SNMP',
    description: 'Metric IF-MIB dari SNMP Exporter untuk router dan interface.',
    items: [
      { key: 'ifHCInOctets', label: 'Download octets 64-bit', matcher: 'ifHCInOctets', required: true, impact: 'Download Mbps per interface.' },
      { key: 'ifHCOutOctets', label: 'Upload octets 64-bit', matcher: 'ifHCOutOctets', required: true, impact: 'Upload Mbps per interface.' },
      { key: 'ifOperStatus', label: 'Interface operational status', matcher: 'ifOperStatus', required: true, impact: 'Port up/down.' },
      { key: 'ifName', label: 'Interface name', matcher: 'ifName', required: false, impact: 'Label interface yang mudah dibaca.' },
      { key: 'ifInErrors', label: 'Input errors', matcher: 'ifInErrors', required: false, impact: 'Interface error monitoring.' },
      { key: 'ifOutErrors', label: 'Output errors', matcher: 'ifOutErrors', required: false, impact: 'Interface error monitoring.' },
      { key: 'ifInDiscards', label: 'Input discards', matcher: 'ifInDiscards', required: false, impact: 'Interface drop monitoring.' },
      { key: 'ifOutDiscards', label: 'Output discards', matcher: 'ifOutDiscards', required: false, impact: 'Interface drop monitoring.' },
      { key: 'sysUpTime', label: 'Router uptime', matcher: 'sysUpTime', required: false, impact: 'Router uptime.' },
    ],
  },
  {
    key: 'prometheus',
    title: 'Prometheus Health',
    description: 'Metric self-monitoring untuk Prometheus dan scrape pipeline.',
    items: [
      { key: 'up', label: 'Target health', matcher: 'up', required: true, impact: 'Targets table dan target down.' },
      { key: 'scrape_duration_seconds', label: 'Scrape duration', matcher: 'scrape_duration_seconds', required: false, impact: 'Scrape performance.' },
      { key: 'scrape_samples_scraped', label: 'Scrape samples', matcher: 'scrape_samples_scraped', required: false, impact: 'Scrape volume.' },
      { key: 'prometheus_tsdb_head_series', label: 'TSDB head series', matcher: 'prometheus_tsdb_head_series', required: false, impact: 'Prometheus storage pressure.' },
    ],
  },
];

function statusFromCounts(ready: number, totalRequired: number, total: number): ReadinessStatus {
  if (total === 0 || ready === 0) return 'missing';
  if (ready >= totalRequired) return 'ready';
  return 'partial';
}

export async function getReadinessSnapshot() {
  const allMatchers = READINESS_REQUIREMENTS.flatMap((category) => category.items.map((item) => item.matcher));
  const uniqueMatchers = Array.from(new Set(allMatchers));
  const series = await prometheusSeriesQuery(uniqueMatchers.map((matcher) => `{__name__="${matcher}"}`));
  const available = new Set((series || []).map((metric) => metric.__name__).filter(Boolean));

  const categories = READINESS_REQUIREMENTS.map((category) => {
    const items = category.items.map((item) => ({
      ...item,
      available: available.has(item.matcher),
    }));
    const requiredItems = items.filter((item) => item.required);
    const readyRequired = requiredItems.filter((item) => item.available).length;
    const availableItems = items.filter((item) => item.available).length;

    return {
      key: category.key,
      title: category.title,
      description: category.description,
      status: statusFromCounts(readyRequired, requiredItems.length, items.length),
      requiredReady: readyRequired,
      requiredTotal: requiredItems.length,
      availableTotal: availableItems,
      total: items.length,
      items,
    };
  });

  return {
    timestamp: nowIso(),
    prometheusReachable: series !== null,
    thresholds: getMonitoringThresholds(),
    thresholdNotes: {
      cpu: describeThreshold(getMonitoringThresholds().server.cpuUsagePercent, '%'),
      ram: describeThreshold(getMonitoringThresholds().server.ramUsagePercent, '%'),
      disk: describeThreshold(getMonitoringThresholds().server.diskUsagePercent, '%'),
      ping: describeThreshold(getMonitoringThresholds().network.pingMs, ' ms'),
      jitter: describeThreshold(getMonitoringThresholds().network.jitterMs, ' ms'),
      packetLoss: describeThreshold(getMonitoringThresholds().network.packetLossPercent, '%'),
    },
    categories,
  };
}
