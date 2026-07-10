import { type NextRequest } from 'next/server';
import { prometheusInstantQuery } from '@/lib/prometheus';
import { buildFilesystems, buildCpuCores, buildTemperatureSensors, buildTopProcesses, nowIso, PROMQL } from '@/lib/metrics';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';
import type { ServerDetailResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  const [
    filesystemSizeData,
    filesystemAvailData,
    inodeFilesData,
    inodesFreeData,
    cpuPerCoreData,
    processExporterProbeData,
    topProcessCpuData,
    topProcessMemData,
    topProcessCountData,
    hwmonSensorsData,
    thermalZoneSensorsData,
  ] = await Promise.all([
    prometheusInstantQuery(PROMQL.filesystemSize),
    prometheusInstantQuery(PROMQL.filesystemAvail),
    prometheusInstantQuery(PROMQL.inodeFiles),
    prometheusInstantQuery(PROMQL.inodeFilesFree),
    prometheusInstantQuery(PROMQL.cpuPerCore),
    prometheusInstantQuery(PROMQL.processExporterProbe),
    prometheusInstantQuery(PROMQL.topProcessCpu),
    prometheusInstantQuery(PROMQL.topProcessMemory),
    prometheusInstantQuery(PROMQL.topProcessCount),
    prometheusInstantQuery(PROMQL.hwmonTemperatureSensors),
    prometheusInstantQuery(PROMQL.thermalZoneTemperatureSensors),
  ]);

  const temperatureSensors = buildTemperatureSensors(hwmonSensorsData, thermalZoneSensorsData);

  const processExporterAvailable = Boolean(
    processExporterProbeData &&
    processExporterProbeData.resultType === 'vector' &&
    processExporterProbeData.result.length > 0,
  );

  const response: ServerDetailResponse = {
    filesystems: buildFilesystems(filesystemSizeData, filesystemAvailData, inodeFilesData, inodesFreeData),
    cpuCores: buildCpuCores(cpuPerCoreData),
    topProcesses: processExporterAvailable
      ? buildTopProcesses(topProcessCpuData, topProcessMemData, topProcessCountData)
      : [],
    processExporterAvailable,
    temperatureSensors,
    temperatureAvailable: temperatureSensors.length > 0,
    timestamp: nowIso(),
  };

  return noStoreJson(response);
}
