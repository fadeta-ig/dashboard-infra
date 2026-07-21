'use client';

import { useMemo, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { PaginationControls } from '@/components/dashboard/pagination-controls';
import { paginateItems } from '@/lib/pagination';
import { cn } from '@/lib/utils';
import type { FilesystemMount } from '@/lib/types';

interface Props {
  filesystems: FilesystemMount[];
}

function usageColor(percent: number | null): string {
  if (percent === null) return 'text-slate-400';
  if (percent >= 90) return 'text-red-600 font-semibold';
  if (percent >= 80) return 'text-amber-600 font-semibold';
  return 'text-slate-700';
}

function usageBarColor(percent: number | null): string {
  if (percent === null) return 'bg-slate-200';
  if (percent >= 90) return 'bg-red-500';
  if (percent >= 80) return 'bg-amber-500';
  if (percent >= 60) return 'bg-blue-500';
  return 'bg-emerald-500';
}

function formatGb(value: number | null) {
  if (value === null) return '—';
  if (value < 1) return `${(value * 1024).toFixed(0)} MB`;
  return `${value.toFixed(1)} GB`;
}

function formatInodes(count: number | null) {
  if (count === null) return '—';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return String(count);
}

function UsageBar({ percent }: { percent: number | null }) {
  const clamped = Math.min(Math.max(percent ?? 0, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', usageBarColor(percent))}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className={cn('text-xs w-10 text-right tabular-nums', usageColor(percent))}>
        {percent !== null ? `${percent.toFixed(1)}%` : '—'}
      </span>
    </div>
  );
}

function isPrometheusMount(mountpoint: string): boolean {
  return mountpoint === '/' || mountpoint.startsWith('/var');
}

export function ServerFilesystems({ filesystems }: Props) {
  const [page, setPage] = useState(1);
  const pagedFilesystems = useMemo(
    () => paginateItems(filesystems, page),
    [filesystems, page],
  );

  if (filesystems.length === 0) {
    return (
      <section className="panel-surface rounded-lg p-6">
        <p className="text-sm text-muted-foreground">No filesystem data available from Prometheus.</p>
      </section>
    );
  }

  return (
    <section className="panel-surface rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <HardDrive className="h-4 w-4 text-slate-500" />
        <div>
          <h2 className="font-semibold text-sm">Filesystem Mountpoints</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Disk usage & inode consumption per partition</p>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:hidden">
        {pagedFilesystems.items.map((fs) => (
          <article key={fs.mountpoint} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono font-medium text-slate-800">{fs.mountpoint}</p>
                <p className="font-mono text-xs text-slate-500 break-all">{fs.device}</p>
                <p className="text-xs text-slate-400">{fs.fstype}</p>
              </div>
              {isPrometheusMount(fs.mountpoint) && (
                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-medium">
                  Prometheus
                </span>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">Disk Usage</p>
              <UsageBar percent={fs.usagePercent} />
              <p className="mt-2 text-xs text-slate-500">
                {formatGb(fs.usedGb)} / {formatGb(fs.totalGb)}
                {fs.availGb !== null ? ` • ${formatGb(fs.availGb)} free` : ''}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">Inode Usage</p>
              {fs.inodeUsagePercent !== null ? (
                <UsageBar percent={fs.inodeUsagePercent} />
              ) : (
                <span className="text-xs text-slate-400">N/A (vfat)</span>
              )}
              <p className="mt-2 text-xs text-slate-500">Inodes free: {formatInodes(fs.inodesFree)}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
            <tr>
              <th className="px-5 py-3 font-medium">Mountpoint</th>
              <th className="px-5 py-3 font-medium">Device / FSType</th>
              <th className="px-5 py-3 font-medium min-w-[160px]">Disk Usage</th>
              <th className="px-5 py-3 font-medium">Used / Total</th>
              <th className="px-5 py-3 font-medium min-w-[140px]">Inode Usage</th>
              <th className="px-5 py-3 font-medium">Inodes Free</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pagedFilesystems.items.map((fs) => (
              <tr key={fs.mountpoint} className="hover:bg-muted/30 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-slate-800">{fs.mountpoint}</span>
                    {isPrometheusMount(fs.mountpoint) && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-medium">
                        Prometheus
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <div className="font-mono text-xs text-slate-500">
                    <div>{fs.device}</div>
                    <div className="text-slate-400">{fs.fstype}</div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <UsageBar percent={fs.usagePercent} />
                </td>
                <td className="px-5 py-3.5 tabular-nums text-slate-600 text-xs">
                  {formatGb(fs.usedGb)} / {formatGb(fs.totalGb)}
                  {fs.availGb !== null && (
                    <div className="text-slate-400">{formatGb(fs.availGb)} free</div>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  {fs.inodeUsagePercent !== null ? (
                    <UsageBar percent={fs.inodeUsagePercent} />
                  ) : (
                    <span className="text-xs text-slate-400">N/A (vfat)</span>
                  )}
                </td>
                <td className="px-5 py-3.5 tabular-nums text-xs text-slate-500">
                  {formatInodes(fs.inodesFree)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls
        pagination={pagedFilesystems.meta}
        itemLabel="filesystem"
        onPageChange={setPage}
      />
    </section>
  );
}
