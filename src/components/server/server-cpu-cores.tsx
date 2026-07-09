'use client';

import { Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CpuCoreUsage } from '@/lib/types';

interface Props {
  cores: CpuCoreUsage[];
}

function coreColor(percent: number | null): string {
  if (percent === null) return 'bg-slate-100 border-slate-200 text-slate-400';
  if (percent >= 85) return 'bg-red-500 border-red-600 text-white';
  if (percent >= 70) return 'bg-amber-400 border-amber-500 text-white';
  if (percent >= 40) return 'bg-blue-500 border-blue-600 text-white';
  return 'bg-emerald-500 border-emerald-600 text-white';
}

function coreLabel(percent: number | null): string {
  if (percent === null) return 'N/A';
  return `${percent.toFixed(0)}%`;
}

export function ServerCpuCores({ cores }: Props) {
  if (cores.length === 0) {
    return null;
  }

  return (
    <section className="panel-surface rounded-lg p-6">
      <div className="flex items-center gap-3 mb-5">
        <Cpu className="h-4 w-4 text-slate-500" />
        <div>
          <h2 className="font-semibold text-sm">CPU Core Load</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Per-core usage % (5m average) — {cores.length} logical cores
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
        {cores.map((core) => (
          <div
            key={core.cpu}
            className={cn(
              'flex flex-col items-center justify-center rounded-md border p-2 gap-1 transition-all hover:scale-105',
              coreColor(core.usagePercent),
            )}
            title={`Core ${core.cpu}: ${coreLabel(core.usagePercent)}`}
          >
            <span className="text-[10px] font-medium opacity-80">#{core.cpu}</span>
            <span className="text-xs font-bold tabular-nums leading-none">
              {coreLabel(core.usagePercent)}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 flex-wrap">
        {[
          { label: '< 40%', color: 'bg-emerald-500' },
          { label: '40–70%', color: 'bg-blue-500' },
          { label: '70–85%', color: 'bg-amber-400' },
          { label: '> 85%', color: 'bg-red-500' },
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={cn('w-2.5 h-2.5 rounded-sm inline-block', color)} />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
