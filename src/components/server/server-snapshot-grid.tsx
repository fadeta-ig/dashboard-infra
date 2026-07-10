'use client';

import { Activity, ArrowDownToLine, ArrowUpFromLine, Cpu, Database, HardDrive, MemoryStick, Network, RefreshCw, Thermometer, Timer } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import type { ServerMetrics } from '@/lib/types';
import { getMonitoringThresholds } from '@/lib/thresholds';

interface Props {
  current: (ServerMetrics & { timestamp: string }) | null;
}

function formatPercent(value: number | null) {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`;
}

function formatGb(value: number | null, digits = 2) {
  return value === null ? 'N/A' : `${value.toFixed(digits)} GB`;
}

function formatMBps(bytesPerSec: number | null) {
  if (bytesPerSec === null) return 'N/A';
  const mbps = bytesPerSec / 1_048_576;
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
  const kbps = bytesPerSec / 1024;
  return `${kbps.toFixed(0)} KB/s`;
}

function formatUptime(seconds: number | null) {
  if (seconds === null) return 'N/A';
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function metricStatus(value: number | null, warning: number, critical: number): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (value === null) return 'unknown';
  if (value >= critical) return 'critical';
  if (value >= warning) return 'warning';
  return 'healthy';
}

function swapStatus(usagePercent: number | null, totalGb: number | null): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (totalGb === null) return 'unknown';
  if (totalGb === 0) return 'healthy'; // No swap = valid config
  return metricStatus(usagePercent, 50, 80);
}

function swapLabel(usagePercent: number | null, totalGb: number | null) {
  if (totalGb === null) return 'N/A';
  if (totalGb === 0) return 'No swap';
  return formatPercent(usagePercent);
}

function swapDescription(usedGb: number | null, totalGb: number | null) {
  if (totalGb === null || totalGb === 0) return 'Not configured';
  return `${formatGb(usedGb)} / ${formatGb(totalGb)}`;
}

export function ServerSnapshotGrid({ current }: Props) {
  const thresholds = getMonitoringThresholds();
  const bytesRx = current?.netRxBytesPerSec ?? null;
  const bytesTx = current?.netTxBytesPerSec ?? null;
  const bytesRead = current?.diskReadBytesPerSec ?? null;
  const bytesWrite = current?.diskWriteBytesPerSec ?? null;

  const netRxMBps = bytesRx !== null ? bytesRx / 1_048_576 : null;
  const netTxMBps = bytesTx !== null ? bytesTx / 1_048_576 : null;
  const diskReadMBps = bytesRead !== null ? bytesRead / 1_048_576 : null;
  const diskWriteMBps = bytesWrite !== null ? bytesWrite / 1_048_576 : null;

  return (
    <div className="space-y-4">
      {/* Row 1 — Memory & Core */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="CPU Usage"
          value={formatPercent(current?.cpuUsage ?? null)}
          description={current?.cpuCoreCount ? `${current.cpuCoreCount} cores` : undefined}
          icon={Cpu}
          status={metricStatus(current?.cpuUsage ?? null, 70, 85)}
        />
        <StatCard
          title="RAM Usage"
          value={formatPercent(current?.ramUsage ?? null)}
          description={`Free: ${formatGb(current?.ramAvailableGb ?? null)}`}
          icon={MemoryStick}
          status={metricStatus(current?.ramUsage ?? null, 75, 85)}
        />
        <StatCard
          title="Swap Usage"
          value={swapLabel(current?.swapUsagePercent ?? null, current?.swapTotalGb ?? null)}
          description={swapDescription(current?.swapUsedGb ?? null, current?.swapTotalGb ?? null)}
          icon={Database}
          status={swapStatus(current?.swapUsagePercent ?? null, current?.swapTotalGb ?? null)}
        />
        <StatCard
          title="Disk Root (/)"
          value={formatPercent(current?.diskUsage ?? null)}
          description="Root filesystem"
          icon={HardDrive}
          status={metricStatus(current?.diskUsage ?? null, 80, 90)}
        />
        <StatCard
          title="Uptime"
          value={formatUptime(current?.uptimeSeconds ?? null)}
          description="Since last boot"
          icon={Timer}
          status="healthy"
        />
        <StatCard
          title="Temperature"
          value={current?.temperatureCelsius === null || current?.temperatureCelsius === undefined ? 'N/A' : `${current.temperatureCelsius.toFixed(1)} °C`}
          description={current?.temperatureSource ? `Source: ${current.temperatureSource}` : 'Sensor unavailable'}
          icon={Thermometer}
          status={metricStatus(current?.temperatureCelsius ?? null, thresholds.server.temperatureCelsius.warning, thresholds.server.temperatureCelsius.critical)}
        />
      </div>

      {/* Row 2 — Load & I/O */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          title="Load Avg 1m"
          value={current?.load1 !== null && current?.load1 !== undefined ? current.load1.toFixed(2) : 'N/A'}
          description={`5m: ${current?.load5?.toFixed(2) ?? 'N/A'}  15m: ${current?.load15?.toFixed(2) ?? 'N/A'}`}
          icon={Activity}
          status={metricStatus(current?.load1 ?? null, 2, 4)}
        />
        <StatCard
          title="Disk Read"
          value={formatMBps(bytesRead)}
          description="Aggregate all disks"
          icon={ArrowDownToLine}
          status={metricStatus(diskReadMBps, 100, 300)}
        />
        <StatCard
          title="Disk Write"
          value={formatMBps(bytesWrite)}
          description="Aggregate all disks"
          icon={ArrowUpFromLine}
          status={metricStatus(diskWriteMBps, 100, 300)}
        />
        <StatCard
          title="Net RX"
          value={formatMBps(bytesRx)}
          description="enp6s18 inbound"
          icon={Network}
          status={metricStatus(netRxMBps, 80, 150)}
        />
        <StatCard
          title="Net TX"
          value={formatMBps(bytesTx)}
          description="enp6s18 outbound"
          icon={RefreshCw}
          status={metricStatus(netTxMBps, 80, 150)}
        />
      </div>
    </div>
  );
}
