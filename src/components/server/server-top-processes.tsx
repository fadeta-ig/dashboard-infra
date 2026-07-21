'use client';

import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { PaginationControls } from '@/components/dashboard/pagination-controls';
import { paginateItems } from '@/lib/pagination';
import type { TopProcess } from '@/lib/types';

interface Props {
  processes: TopProcess[];
  available: boolean;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function CpuBar({ percent }: { percent: number | null }) {
  const clamped = Math.min(Math.max(percent ?? 0, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs w-12 text-right tabular-nums text-slate-600">
        {percent !== null ? `${percent.toFixed(2)}%` : '—'}
      </span>
    </div>
  );
}

function InstallGuide() {
  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-slate-600">
        Top process monitoring membutuhkan <strong>process_exporter</strong> yang berjalan di server Ubuntu.
      </p>
      <div className="bg-slate-900 rounded-md p-4 font-mono text-xs text-slate-200 space-y-1.5 overflow-x-auto">
        <p className="text-slate-400"># 1. Download process_exporter</p>
        <p>wget https://github.com/ncabatoff/process-exporter/releases/download/v0.8.3/process-exporter_0.8.3_linux_amd64.tar.gz</p>
        <p>tar xvf process-exporter_0.8.3_linux_amd64.tar.gz</p>
        <p>sudo mv process-exporter /usr/local/bin/</p>
        <p className="mt-2 text-slate-400"># 2. Buat config</p>
        <p>{'sudo tee /etc/process-exporter.yaml <<\'EOF\''}</p>
        <p>{'process_names:'}</p>
        <p>{'  - name: "{{.Comm}}"'}</p>
        <p>{'    cmdline:'}</p>
        <p>{'    - .+'}</p>
        <p>{'EOF'}</p>
        <p className="mt-2 text-slate-400"># 3. Buat systemd service</p>
        <p>{'sudo tee /etc/systemd/system/process-exporter.service <<\'EOF\''}</p>
        <p>{'[Unit]'}</p>
        <p>{'Description=Process Exporter'}</p>
        <p>{'[Service]'}</p>
        <p>{'ExecStart=/usr/local/bin/process-exporter --config.path /etc/process-exporter.yaml'}</p>
        <p>{'[Install]'}</p>
        <p>{'WantedBy=multi-user.target'}</p>
        <p>{'EOF'}</p>
        <p>sudo systemctl daemon-reload</p>
        <p>sudo systemctl enable --now process-exporter</p>
        <p className="mt-2 text-slate-400"># 4. Tambahkan ke prometheus.yml scrape_configs:</p>
        <p>{'- job_name: process'}</p>
        <p>{'  static_configs:'}</p>
        <p>{'    - targets: [\'localhost:9256\']'}</p>
      </div>
      <p className="text-xs text-muted-foreground">Setelah Prometheus berhasil scrape, refresh halaman ini dan top process akan muncul secara otomatis.</p>
    </div>
  );
}

export function ServerTopProcesses({ processes, available }: Props) {
  const [page, setPage] = useState(1);
  const pagedProcesses = useMemo(
    () => paginateItems(processes, page),
    [page, processes],
  );

  return (
    <section className="panel-surface rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Activity className="h-4 w-4 text-slate-500" />
          <div>
            <h2 className="font-semibold text-sm">Top Processes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {available ? 'CPU & RSS memory — top 10 by CPU usage (via process_exporter)' : 'process_exporter tidak terdeteksi'}
            </p>
          </div>
        </div>
        {!available && (
          <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded font-medium">
            Not installed
          </span>
        )}
      </div>

      {!available ? (
        <InstallGuide />
      ) : processes.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">Tidak ada data proses dari Prometheus.</div>
      ) : (
        <>
          <div className="grid gap-3 p-4 md:hidden">
            {pagedProcesses.items.map((proc) => (
              <article key={proc.name} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div>
                  <p className="font-mono font-medium text-slate-800 break-all">{proc.name}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs uppercase text-muted-foreground">CPU Usage</p>
                  <CpuBar percent={proc.cpuPercent} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Memory</p>
                    <p className="font-mono text-slate-600">{formatBytes(proc.memoryBytes)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Procs</p>
                    <p className="font-mono text-slate-500">{proc.numProcs ?? '—'}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
              <tr>
                <th className="px-5 py-3 font-medium">Process</th>
                <th className="px-5 py-3 font-medium min-w-[180px]">CPU Usage</th>
                <th className="px-5 py-3 font-medium">Memory (RSS)</th>
                <th className="px-5 py-3 font-medium">Procs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedProcesses.items.map((proc) => (
                <tr key={proc.name} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3.5 font-mono font-medium text-slate-800">{proc.name}</td>
                  <td className="px-5 py-3.5">
                    <CpuBar percent={proc.cpuPercent} />
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-slate-600">{formatBytes(proc.memoryBytes)}</td>
                  <td className="px-5 py-3.5 tabular-nums text-slate-500">{proc.numProcs ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <PaginationControls
            pagination={pagedProcesses.meta}
            itemLabel="proses"
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}
