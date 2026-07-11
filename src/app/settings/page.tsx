'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCcw, Save, Settings2 } from 'lucide-react';
import { getErrorMessage } from '@/lib/metrics';

type ConfigItemType = 'network_target' | 'mikrotik_interface' | 'ubuntu_service' | 'sla_policy' | 'maintenance_window';

interface ConfigItem {
  id: number;
  type: ConfigItemType;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  payload: Record<string, unknown>;
  updatedAt: string;
}

interface ConfigResponse {
  ok: boolean;
  storageEnabled: boolean;
  message?: string;
  items: ConfigItem[];
}

const TYPE_OPTIONS: Array<{ type: ConfigItemType; label: string; description: string }> = [
  { type: 'network_target', label: 'Network Targets', description: 'Target ICMP seperti CCTV, fingerprint, PBX, dan IP publik.' },
  { type: 'mikrotik_interface', label: 'MikroTik Interfaces', description: 'Mapping interface SNMP, role, kapasitas, dan expected state.' },
  { type: 'ubuntu_service', label: 'Ubuntu Services', description: 'Unit systemd yang dimonitor dari node_exporter.' },
  { type: 'sla_policy', label: 'SLA Policies', description: 'Target availability dan waktu respons per kategori.' },
  { type: 'maintenance_window', label: 'Maintenance Windows', description: 'Window maintenance untuk suppress alert terjadwal.' },
];

const EMPTY_PAYLOAD: Record<ConfigItemType, Record<string, unknown>> = {
  network_target: { key: 'new_target', label: 'New Target', target: '192.168.1.10', category: 'network', purpose: 'Monitoring target baru.' },
  mikrotik_interface: { name: 'ether-new', displayName: 'New Interface', role: 'lan', expectedUp: true },
  ubuntu_service: { key: 'new-service', label: 'New Service', matcher: 'new.*\\.service', required: false },
  sla_policy: { category: 'network', label: 'Network', targetAvailabilityPercent: 99, responseMinutes: 30, resolutionMinutes: 240 },
  maintenance_window: { scope: 'domain', value: 'network', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), reason: 'Maintenance terjadwal' },
};

function typeLabel(type: ConfigItemType) {
  return TYPE_OPTIONS.find((item) => item.type === type)?.label || type;
}

function makeDraft(type: ConfigItemType): ConfigItem {
  return {
    id: 0,
    type,
    key: `${type}_baru`,
    label: `Config ${typeLabel(type)}`,
    enabled: true,
    sortOrder: 1000,
    payload: EMPTY_PAYLOAD[type],
    updatedAt: new Date().toISOString(),
  };
}

export default function SettingsPage() {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [activeType, setActiveType] = useState<ConfigItemType>('network_target');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConfigItem>(() => makeDraft('network_target'));
  const [payloadText, setPayloadText] = useState(JSON.stringify(EMPTY_PAYLOAD.network_target, null, 2));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/config', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch config');
      const json = (await response.json()) as ConfigResponse;
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(initial);
  }, [fetchData]);

  const items = useMemo(
    () => (data?.items || []).filter((item) => item.type === activeType),
    [activeType, data?.items],
  );

  const selectItem = (item: ConfigItem) => {
    setSelectedKey(item.key);
    setDraft(item);
    setPayloadText(JSON.stringify(item.payload, null, 2));
    setMessage(null);
  };

  const newItem = (type = activeType) => {
    const next = makeDraft(type);
    setActiveType(type);
    setSelectedKey(null);
    setDraft(next);
    setPayloadText(JSON.stringify(next.payload, null, 2));
    setMessage(null);
  };

  const saveItem = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      const response = await fetch('/api/ops/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, payload }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Gagal menyimpan config.');
      setMessage('Config tersimpan. Runtime akan memakai config ini pada refresh berikutnya.');
      await fetchData();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-[420px] animate-pulse rounded-lg border border-border bg-muted" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-slide-up space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Monitoring Settings</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Kelola target, interface, service, SLA, dan maintenance window dari database.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
        </div>
      )}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
      {!data?.storageEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {data?.message || 'Storage config belum aktif.'}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="panel-surface overflow-hidden rounded-lg">
          <div className="border-b border-border bg-white/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-slate-500" />
              <h2 className="font-semibold">Config Type</h2>
            </div>
          </div>
          <div className="divide-y divide-border">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                onClick={() => newItem(option.type)}
                className={`block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                  activeType === option.type ? 'bg-slate-100' : ''
                }`}
              >
                <p className="text-sm font-semibold">{option.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="grid gap-5 xl:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]">
          <div className="panel-surface overflow-hidden rounded-lg">
            <div className="flex items-center justify-between border-b border-border bg-white/60 px-4 py-3">
              <h2 className="font-semibold">{typeLabel(activeType)}</h2>
              <button type="button" onClick={() => newItem()} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                Baru
              </button>
            </div>
            <div className="max-h-[620px] divide-y divide-border overflow-y-auto">
              {items.map((item) => (
                <button
                  key={`${item.type}:${item.key}`}
                  type="button"
                  onClick={() => selectItem(item)}
                  className={`block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    selectedKey === item.key ? 'bg-slate-100' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{item.key}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${item.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {item.enabled ? 'on' : 'off'}
                    </span>
                  </div>
                </button>
              ))}
              {items.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Belum ada config.</div>}
            </div>
          </div>

          <div className="panel-surface rounded-lg p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Type</span>
                <select
                  value={draft.type}
                  onChange={(event) => {
                    const nextType = event.target.value as ConfigItemType;
                    setDraft((current) => ({ ...current, type: nextType }));
                    setActiveType(nextType);
                  }}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                >
                  {TYPE_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Key</span>
                <input value={draft.key} onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value }))} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Label</span>
                <input value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Sort Order</span>
                <input type="number" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />
                Enabled
              </label>
            </div>
            <label className="mt-5 block space-y-1.5">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Payload JSON</span>
              <textarea
                value={payloadText}
                onChange={(event) => setPayloadText(event.target.value)}
                className="min-h-[340px] w-full rounded-md border border-border bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-slate-400"
                spellCheck={false}
              />
            </label>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void saveItem()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> {saving ? 'Menyimpan...' : 'Simpan Config'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
