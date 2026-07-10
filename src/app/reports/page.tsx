'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { getErrorMessage } from '@/lib/metrics';

interface MonthlyReportTargetAvailability {
  targetKey: string;
  label: string;
  status: 'open' | 'resolved';
  incidentsCount: number;
  downtimeSeconds: number;
  availabilityPercent: number;
}

interface MonthlyReportIncident {
  id: number;
  title: string;
  label: string;
  severity: 'warning' | 'critical';
  status: 'open' | 'resolved';
  startedAt: string;
  resolvedAt: string | null;
  impactedDurationSeconds: number;
}

interface MonthlyReportRecommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

interface MonthlyReportData {
  reportMonth: string;
  generatedAt: string;
  window: {
    start: string;
    end: string;
    monitoredSeconds: number;
    isPartialMonth: boolean;
  };
  executiveSummary: {
    headline: string;
    summary: string;
    currentOpenIncidents: number;
    totalIncidents: number;
    totalDowntimeSeconds: number;
    overallAvailabilityPercent: number | null;
    auditEvents: number;
    criticalAuditEvents: number;
  };
  availability: {
    overallPercent: number | null;
    monitoredTargets: number;
    totalDowntimeSeconds: number;
    targets: MonthlyReportTargetAvailability[];
  };
  topIncidents: MonthlyReportIncident[];
  auditHighlights: {
    totalEvents: number;
    criticalEvents: number;
    warningEvents: number;
    topEventTypes: Array<{ eventType: string; count: number }>;
  };
  recommendations: MonthlyReportRecommendation[];
}

interface MonthlyReportResponse {
  ok: boolean;
  storageEnabled: boolean;
  message?: string;
  report: MonthlyReportData | null;
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return '0 menit';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes > 0 ? `${hours} jam ${remainingMinutes} menit` : `${hours} jam`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days} hari ${remainingHours} jam` : `${days} hari`;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonthValue());
  const [data, setData] = useState<MonthlyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (reportMonth: string) => {
    try {
      const response = await fetch(`/api/ops/reports/monthly?month=${encodeURIComponent(reportMonth)}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Failed to fetch monthly report');
      const json = (await response.json()) as MonthlyReportResponse;
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchData(month), 0);
    return () => {
      window.clearTimeout(initial);
    };
  }, [fetchData, month]);

  const report = data?.report;

  const pdfHref = useMemo(
    () => `/api/ops/reports/monthly/pdf?month=${encodeURIComponent(month)}`,
    [month],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <div className="h-[420px] animate-pulse rounded-lg border border-border bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-destructive">
          <AlertTriangle className="h-5 w-5" /> Monthly Report Error
        </h2>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-slide-up space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Monthly Report</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Executive summary, availability, top incident, dan rekomendasi dalam format yang mudah dibaca.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setLoading(true);
              setMonth(event.target.value || currentMonthValue());
            }}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchData(month);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
          <a
            href={pdfHref}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            <Download className="h-4 w-4" /> Download PDF
          </a>
        </div>
      </div>

      {!data?.storageEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data?.message || 'Storage report belum aktif.'}
        </div>
      )}

      {report && (
        <>
          <section className="panel-surface rounded-lg p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                <FileText className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-900">Executive Summary</h2>
                <p className="text-base font-medium text-slate-800">{report.executiveSummary.headline}</p>
                <p className="text-sm leading-6 text-slate-600">{report.executiveSummary.summary}</p>
                <p className="text-xs text-slate-500">
                  Digenerate {format(new Date(report.generatedAt), 'dd MMM yyyy HH:mm')} •
                  Window {format(new Date(report.window.start), 'dd MMM yyyy')} sampai {format(new Date(report.window.end), 'dd MMM yyyy')}
                </p>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Availability" value={report.executiveSummary.overallAvailabilityPercent === null ? 'N/A' : `${report.executiveSummary.overallAvailabilityPercent.toFixed(2)}%`} />
            <StatCard label="Monitored Targets" value={String(report.availability.monitoredTargets)} />
            <StatCard label="Total Incident" value={String(report.executiveSummary.totalIncidents)} />
            <StatCard label="Open Incident" value={String(report.executiveSummary.currentOpenIncidents)} tone="danger" />
            <StatCard label="Audit Event" value={String(report.executiveSummary.auditEvents)} />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <section className="panel-surface rounded-lg xl:col-span-2">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold text-slate-900">Availability per Target</h2>
                <p className="mt-1 text-xs text-muted-foreground">Target dengan availability terendah tampil di atas.</p>
              </div>
              <div className="grid gap-3 p-4 md:hidden">
                {report.availability.targets.map((target) => (
                  <article key={target.targetKey} className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{target.label}</p>
                        <p className="text-xs text-muted-foreground">{target.targetKey}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {target.availabilityPercent.toFixed(2)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Downtime</p>
                        <p>{formatDuration(target.downtimeSeconds)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Incident</p>
                        <p>{target.incidentsCount}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-5 py-4 font-medium">Target</th>
                      <th className="px-5 py-4 font-medium">Availability</th>
                      <th className="px-5 py-4 font-medium">Downtime</th>
                      <th className="px-5 py-4 font-medium">Incident</th>
                      <th className="px-5 py-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.availability.targets.map((target) => (
                      <tr key={target.targetKey} className="transition-colors hover:bg-muted/40">
                        <td className="px-5 py-4">
                          <p className="font-medium">{target.label}</p>
                          <p className="text-xs text-muted-foreground">{target.targetKey}</p>
                        </td>
                        <td className="px-5 py-4 font-semibold">{target.availabilityPercent.toFixed(2)}%</td>
                        <td className="px-5 py-4">{formatDuration(target.downtimeSeconds)}</td>
                        <td className="px-5 py-4">{target.incidentsCount}</td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${target.status === 'open' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {target.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-6">
              <div className="panel-surface rounded-lg p-5">
                <h2 className="font-semibold text-slate-900">Audit Highlights</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <SummaryRow label="Total Event" value={String(report.auditHighlights.totalEvents)} />
                  <SummaryRow label="Critical Event" value={String(report.auditHighlights.criticalEvents)} />
                  <SummaryRow label="Warning Event" value={String(report.auditHighlights.warningEvents)} />
                </div>
                <div className="mt-4 space-y-2">
                  {report.auditHighlights.topEventTypes.map((item) => (
                    <div key={item.eventType} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-700">{item.eventType}</span>
                      <span className="text-slate-500">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel-surface rounded-lg p-5">
                <h2 className="font-semibold text-slate-900">Rekomendasi</h2>
                <div className="mt-4 space-y-3">
                  {report.recommendations.map((recommendation, index) => (
                    <article key={`${recommendation.title}-${index}`} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900">{recommendation.title}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${recommendation.priority === 'high' ? 'bg-red-100 text-red-700' : recommendation.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {recommendation.priority}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{recommendation.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <section className="panel-surface rounded-lg overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold text-slate-900">Top Incident</h2>
              <p className="mt-1 text-xs text-muted-foreground">Diurutkan berdasarkan dampak durasi terlama di bulan terpilih.</p>
            </div>
            <div className="grid gap-3 p-4 md:hidden">
              {report.topIncidents.map((incident) => (
                <article key={incident.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{incident.title}</p>
                      <p className="text-xs text-muted-foreground">{incident.label}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${incident.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {incident.severity}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Duration</p>
                      <p>{formatDuration(incident.impactedDurationSeconds)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Status</p>
                      <p className="uppercase">{incident.status}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-medium">Incident</th>
                    <th className="px-5 py-4 font-medium">Severity</th>
                    <th className="px-5 py-4 font-medium">Status</th>
                    <th className="px-5 py-4 font-medium">Started</th>
                    <th className="px-5 py-4 font-medium">Resolved</th>
                    <th className="px-5 py-4 font-medium">Impact Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.topIncidents.map((incident) => (
                    <tr key={incident.id} className="transition-colors hover:bg-muted/40">
                      <td className="px-5 py-4">
                        <p className="font-medium">{incident.title}</p>
                        <p className="text-xs text-muted-foreground">{incident.label}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={incident.severity === 'critical' ? 'font-semibold text-red-600' : 'font-semibold text-amber-600'}>
                          {incident.severity}
                        </span>
                      </td>
                      <td className="px-5 py-4 uppercase">{incident.status}</td>
                      <td className="px-5 py-4 font-mono text-xs">{format(new Date(incident.startedAt), 'dd MMM yyyy HH:mm')}</td>
                      <td className="px-5 py-4 font-mono text-xs">{incident.resolvedAt ? format(new Date(incident.resolvedAt), 'dd MMM yyyy HH:mm') : '-'}</td>
                      <td className="px-5 py-4">{formatDuration(incident.impactedDurationSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div className="panel-surface rounded-lg p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone === 'danger' ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}
