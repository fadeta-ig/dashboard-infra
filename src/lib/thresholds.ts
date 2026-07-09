export interface ThresholdPair {
  warning: number;
  critical: number;
}

export interface MonitoringThresholds {
  server: {
    cpuUsagePercent: ThresholdPair;
    ramUsagePercent: ThresholdPair;
    diskUsagePercent: ThresholdPair;
    load1: ThresholdPair;
    // Extended
    swapUsagePercent: ThresholdPair;
    inodeUsagePercent: ThresholdPair;
    diskReadMBps: ThresholdPair;
    diskWriteMBps: ThresholdPair;
    netRxMBps: ThresholdPair;
    netTxMBps: ThresholdPair;
  };
  network: {
    pingMs: ThresholdPair;
    jitterMs: ThresholdPair;
    packetLossPercent: ThresholdPair;
  };
  mikrotik: {
    interfaceUtilizationPercent: ThresholdPair;
  };
}

const DEFAULT_THRESHOLDS: MonitoringThresholds = {
  server: {
    cpuUsagePercent: { warning: 70, critical: 85 },
    ramUsagePercent: { warning: 75, critical: 85 },
    diskUsagePercent: { warning: 80, critical: 90 },
    load1: { warning: 2, critical: 4 },
    // Swap: >50% warning (RAM pressure), >80% critical (swap exhaustion risk)
    swapUsagePercent: { warning: 50, critical: 80 },
    // Inode: >80% warning (many small files), >95% critical (no new files possible)
    inodeUsagePercent: { warning: 80, critical: 95 },
    // Disk I/O: >100 MB/s warning, >300 MB/s critical (SATA SSD limit awareness)
    diskReadMBps: { warning: 100, critical: 300 },
    diskWriteMBps: { warning: 100, critical: 300 },
    // Network: >80 MB/s warning (~640 Mbps), >150 MB/s critical (~1.2 Gbps)
    netRxMBps: { warning: 80, critical: 150 },
    netTxMBps: { warning: 80, critical: 150 },
  },
  network: {
    pingMs: { warning: 50, critical: 100 },
    jitterMs: { warning: 10, critical: 30 },
    packetLossPercent: { warning: 1, critical: 5 },
  },
  mikrotik: {
    interfaceUtilizationPercent: { warning: 80, critical: 95 },
  },
};

function readNumber(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function thresholdFromEnv(prefix: string, fallback: ThresholdPair): ThresholdPair {
  return {
    warning: readNumber(`${prefix}_WARNING`, fallback.warning),
    critical: readNumber(`${prefix}_CRITICAL`, fallback.critical),
  };
}

export function getMonitoringThresholds(): MonitoringThresholds {
  return {
    server: {
      cpuUsagePercent: thresholdFromEnv('THRESHOLD_SERVER_CPU_PERCENT', DEFAULT_THRESHOLDS.server.cpuUsagePercent),
      ramUsagePercent: thresholdFromEnv('THRESHOLD_SERVER_RAM_PERCENT', DEFAULT_THRESHOLDS.server.ramUsagePercent),
      diskUsagePercent: thresholdFromEnv('THRESHOLD_SERVER_DISK_PERCENT', DEFAULT_THRESHOLDS.server.diskUsagePercent),
      load1: thresholdFromEnv('THRESHOLD_SERVER_LOAD1', DEFAULT_THRESHOLDS.server.load1),
      swapUsagePercent: thresholdFromEnv('THRESHOLD_SERVER_SWAP_PERCENT', DEFAULT_THRESHOLDS.server.swapUsagePercent),
      inodeUsagePercent: thresholdFromEnv('THRESHOLD_SERVER_INODE_PERCENT', DEFAULT_THRESHOLDS.server.inodeUsagePercent),
      diskReadMBps: thresholdFromEnv('THRESHOLD_SERVER_DISK_READ_MBPS', DEFAULT_THRESHOLDS.server.diskReadMBps),
      diskWriteMBps: thresholdFromEnv('THRESHOLD_SERVER_DISK_WRITE_MBPS', DEFAULT_THRESHOLDS.server.diskWriteMBps),
      netRxMBps: thresholdFromEnv('THRESHOLD_SERVER_NET_RX_MBPS', DEFAULT_THRESHOLDS.server.netRxMBps),
      netTxMBps: thresholdFromEnv('THRESHOLD_SERVER_NET_TX_MBPS', DEFAULT_THRESHOLDS.server.netTxMBps),
    },
    network: {
      pingMs: thresholdFromEnv('THRESHOLD_NETWORK_PING_MS', DEFAULT_THRESHOLDS.network.pingMs),
      jitterMs: thresholdFromEnv('THRESHOLD_NETWORK_JITTER_MS', DEFAULT_THRESHOLDS.network.jitterMs),
      packetLossPercent: thresholdFromEnv('THRESHOLD_NETWORK_PACKET_LOSS_PERCENT', DEFAULT_THRESHOLDS.network.packetLossPercent),
    },
    mikrotik: {
      interfaceUtilizationPercent: thresholdFromEnv('THRESHOLD_MIKROTIK_INTERFACE_UTILIZATION_PERCENT', DEFAULT_THRESHOLDS.mikrotik.interfaceUtilizationPercent),
    },
  };
}

export function thresholdStatus(value: number | null, threshold: ThresholdPair): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (value === null) return 'unknown';
  if (value >= threshold.critical) return 'critical';
  if (value >= threshold.warning) return 'warning';
  return 'healthy';
}

export function describeThreshold(threshold: ThresholdPair, suffix = '') {
  return `warning >= ${threshold.warning}${suffix}, critical >= ${threshold.critical}${suffix}`;
}
