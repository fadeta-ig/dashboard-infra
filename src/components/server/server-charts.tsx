'use client';

import { format } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ServerRangePoint } from '@/lib/types';

interface Props {
  points: ServerRangePoint[];
}

const CHART_STYLE = {
  contentStyle: {
    backgroundColor: 'var(--card)',
    borderColor: 'var(--border)',
    borderRadius: '8px',
    fontSize: '12px',
  },
} as const;

const AXIS_PROPS = {
  stroke: 'var(--muted-foreground)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function formatXAxis(tickItem: number) {
  return format(new Date(tickItem), 'HH:mm');
}

function formatTooltipLabel(label: unknown) {
  return format(new Date(Number(label)), 'MMM dd, HH:mm');
}

export function ServerCharts({ points }: Props) {
  const hasDiskIO = points.some((p) => p.diskReadMBps !== null || p.diskWriteMBps !== null);
  const hasNetwork = points.some((p) => p.netRxMBps !== null || p.netTxMBps !== null);
  const hasSwap = points.some((p) => p.swap !== null && p.swap > 0);

  return (
    <div className="space-y-6">
      {/* Row 1: CPU & RAM / Load Avg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU & RAM */}
        <section className="panel-surface rounded-lg p-6">
          <h2 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wide">CPU & RAM (%)</h2>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={formatXAxis} {...AXIS_PROPS} />
                <YAxis domain={[0, 100]} {...AXIS_PROPS} />
                <Tooltip
                  labelFormatter={formatTooltipLabel}
                  formatter={(value: unknown, name: unknown) => {
                    if (typeof value !== 'number') return [String(value ?? 'N/A'), String(name ?? '')];
                    return [`${value.toFixed(2)}%`, String(name).toUpperCase()];
                  }}
                  {...CHART_STYLE}
                />
                <Line type="monotone" dataKey="cpu" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="cpu" />
                <Line type="monotone" dataKey="ram" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="ram" />
                {hasSwap && (
                  <Line type="monotone" dataKey="swap" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" activeDot={{ r: 4 }} connectNulls name="swap" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-0.5 bg-emerald-500 inline-block" />CPU</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-0.5 bg-blue-500 inline-block" />RAM</span>
            {hasSwap && <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-0.5 bg-amber-500 inline-block" />Swap</span>}
          </div>
        </section>

        {/* Load Average */}
        <section className="panel-surface rounded-lg p-6">
          <h2 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wide">Load Average (1m)</h2>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="timestamp" tickFormatter={formatXAxis} {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip
                  labelFormatter={formatTooltipLabel}
                  formatter={(value: unknown) => {
                    if (typeof value !== 'number') return ['N/A', 'Load'];
                    return [value.toFixed(2), 'Load 1m'];
                  }}
                  {...CHART_STYLE}
                />
                <Area type="monotone" dataKey="load" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Row 2: Disk I/O & Network */}
      {(hasDiskIO || hasNetwork) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Disk I/O */}
          {hasDiskIO && (
            <section className="panel-surface rounded-lg p-6">
              <h2 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wide">Disk I/O Throughput (MB/s)</h2>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="timestamp" tickFormatter={formatXAxis} {...AXIS_PROPS} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip
                      labelFormatter={formatTooltipLabel}
                      formatter={(value: unknown, name: unknown) => {
                        if (typeof value !== 'number') return ['N/A', String(name)];
                        return [`${value.toFixed(2)} MB/s`, name === 'diskReadMBps' ? 'Read' : 'Write'];
                      }}
                      {...CHART_STYLE}
                    />
                    <Line type="monotone" dataKey="diskReadMBps" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="diskReadMBps" />
                    <Line type="monotone" dataKey="diskWriteMBps" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="diskWriteMBps" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-0.5 bg-cyan-500 inline-block" />Read</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-0.5 bg-violet-500 inline-block" />Write</span>
              </div>
            </section>
          )}

          {/* Network */}
          {hasNetwork && (
            <section className="panel-surface rounded-lg p-6">
              <h2 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wide">Network Throughput (MB/s)</h2>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="timestamp" tickFormatter={formatXAxis} {...AXIS_PROPS} />
                    <YAxis {...AXIS_PROPS} />
                    <Tooltip
                      labelFormatter={formatTooltipLabel}
                      formatter={(value: unknown, name: unknown) => {
                        if (typeof value !== 'number') return ['N/A', String(name)];
                        return [`${value.toFixed(2)} MB/s`, name === 'netRxMBps' ? 'RX (inbound)' : 'TX (outbound)'];
                      }}
                      {...CHART_STYLE}
                    />
                    <Line type="monotone" dataKey="netRxMBps" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="netRxMBps" />
                    <Line type="monotone" dataKey="netTxMBps" stroke="#f43f5e" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="netTxMBps" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-0.5 bg-emerald-500 inline-block" />RX (in)</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-3 h-0.5 bg-rose-500 inline-block" />TX (out)</span>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
