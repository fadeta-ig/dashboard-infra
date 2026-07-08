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
