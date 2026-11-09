'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Check, ChevronRight, Clock3, History, Plus, RefreshCw, Search, Settings2, ShieldCheck } from 'lucide-react';
import { ConfigFields, Field, inputClass } from '@/components/settings/config-fields';
import { ConfirmationDialog } from '@/components/settings/confirmation-dialog';
import { MonitoringHealth, freshnessLabels, freshnessTones } from '@/components/dashboard/monitoring-health';
import { normalizeConfigInput, planUplinkTransfer, type ConfigInput, type ConfigItemType } from '@/lib/config-validation';
import type { MonitoringConfigItem } from '@/lib/config-store';
import type { Pm2HealthSnapshot } from '@/lib/pm2-health';

interface Revision { changeId: string; actor: string; operation: string; createdAt: string; before: Array<MonitoringConfigItem | null>; after: MonitoringConfigItem[] }
interface ConfigResponse { ok: boolean; storageEnabled: boolean; message?: string; items: MonitoringConfigItem[]; revisions: Revision[] }
interface Preview { title: string; body: Record<string, unknown>; changes: Array<{ before: MonitoringConfigItem | null; after: ConfigInput }>; restore?: boolean }
const TYPES: Array<{ type: ConfigItemType; label: string; description: string }> = [
  { type: 'network_target', label: 'Perangkat & IP', description: 'Konektivitas CCTV, fingerprint, PBX, dan target jaringan.' },
  { type: 'mikrotik_interface', label: 'Interface & ISP', description: 'Peran port, kapasitas koneksi, dan sumber total trafik WAN.' },
  { type: 'pm2_app', label: 'Aplikasi PM2', description: 'Kebijakan monitoring aplikasi berdasarkan source / pemilik proses.' },
  { type: 'ubuntu_service', label: 'Service Ubuntu', description: 'Unit systemd yang diharapkan aktif pada server.' },
  { type: 'sla_policy', label: 'Kebijakan SLA', description: 'Target ketersediaan, waktu respons, dan pemulihan layanan.' },
  { type: 'maintenance_window', label: 'Maintenance', description: 'Jadwalkan pemeliharaan dan penundaan notifikasi terkait.' },
];
const FIELD_LABELS: Record<string, string> = { label: 'Nama tampilan', enabled: 'Pengaturan aktif', sortOrder: 'Urutan', target: 'IP / hostname', category: 'Kategori', purpose: 'Keterangan perangkat', role: 'Peran interface', isp: 'ISP', comment: 'Keterangan koneksi', parent: 'Interface induk', expectedUp: 'Wajib UP', includeInWanTotal: 'Masuk total WAN', downloadCapacityMbps: 'Download (Mbps)', uploadCapacityMbps: 'Upload (Mbps)', source: 'Source PM2', mode: 'Kebijakan', matcher: 'Pola unit', required: 'Wajib aktif', targetAvailabilityPercent: 'Availability (%)', responseMinutes: 'Respons (menit)', resolutionMinutes: 'Pemulihan (menit)', scope: 'Cakupan', value: 'Target maintenance', startsAt: 'Mulai', endsAt: 'Selesai', reason: 'Alasan' };

function emptyDraft(type: ConfigItemType): ConfigInput {
  const payloads: Record<ConfigItemType, Record<string, unknown>> = {
    network_target: { target: '', category: 'network', purpose: '' },
    mikrotik_interface: { name: '', role: 'lan', expectedUp: true, includeInWanTotal: false },
    pm2_app: { source: '', name: '', mode: 'required' },
    ubuntu_service: { matcher: '', required: false },
    sla_policy: { category: 'network', targetAvailabilityPercent: 99.5, responseMinutes: 15, resolutionMinutes: 180 },
    maintenance_window: { scope: 'domain', value: '', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), reason: '' },
  };
  return { type, key: '', label: '', enabled: true, sortOrder: 100, payload: payloads[type], expectedVersion: null };
}
function asInput(item: MonitoringConfigItem): ConfigInput { return { type: item.type, key: item.key, label: item.label, enabled: item.enabled, sortOrder: item.sortOrder, payload: item.payload, expectedVersion: item.version }; }
function formatValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  return ({ required: 'Wajib online', optional: 'Opsional', ignored: 'Abaikan', unused: 'Tidak digunakan', wan: 'WAN', lan: 'LAN', all: 'Semua layanan', domain: 'Kategori', entity: 'Entitas' } as Record<string, string>)[String(value)] || String(value);
}
function ChangePreview({ before, after }: { before: MonitoringConfigItem | null; after: ConfigInput }) {
  const flatten = (item: MonitoringConfigItem | ConfigInput | null) => item ? { label: item.label, enabled: item.enabled, sortOrder: item.sortOrder, ...Object.fromEntries(Object.entries(item.payload).filter(([key]) => !['key', 'name', 'displayName', 'label'].includes(key))) } as Record<string, unknown> : {};
  const previous = flatten(before), next = flatten(after);
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  return <div className="overflow-hidden rounded-xl border border-slate-200"><div className="bg-slate-50 px-4 py-3"><p className="text-sm font-semibold">{after.label}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{after.key}{!before && ' · Baru'}</p></div><dl className="divide-y divide-slate-100">{keys.length ? keys.map((key) => <div key={key} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[140px_1fr_1fr]"><dt className="text-slate-500">{FIELD_LABELS[key] || key}</dt><dd className="break-words text-slate-400 line-through">{formatValue(previous[key])}</dd><dd className="break-words font-medium text-slate-900">{formatValue(next[key])}</dd></div>) : <p className="p-4 text-sm text-slate-500">Tidak ada perubahan nilai.</p>}</dl></div>;
}

export default function SettingsPage() {
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [activeType, setActiveType] = useState<ConfigItemType>('network_target');
  const [draft, setDraft] = useState<ConfigInput>(() => emptyDraft('network_target'));
  const [baseline, setBaseline] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [navigation, setNavigation] = useState<{ type: ConfigItemType; item?: MonitoringConfigItem } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transfer, setTransfer] = useState({ fromKey: '', toKey: '', logicalKey: '' });
  const [pm2, setPm2] = useState<Pm2HealthSnapshot | null>(null);
  const [pm2Error, setPm2Error] = useState(false);
  const dirty = baseline !== '' && JSON.stringify(draft) !== baseline;
  const select = useCallback((type: ConfigItemType, item?: MonitoringConfigItem) => {
    const next = item ? asInput(item) : emptyDraft(type);
    setActiveType(type); setDraft(next); setBaseline(JSON.stringify(next)); setError(null); setPreview(null);
  }, []);
  const fetchConfig = useCallback(async () => {
    const response = await fetch('/api/ops/config', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Konfigurasi belum dapat dimuat.');
    setData(result as ConfigResponse);
    return result as ConfigResponse;
  }, []);
  const refresh = async () => {
    if (dirty) { setError('Simpan atau batalkan perubahan sebelum memuat ulang.'); return; }
    setLoading(true); setError(null);
    try { const result = await fetchConfig(); select(activeType, result.items.find((item) => item.type === activeType && item.key === draft.key) || result.items.find((item) => item.type === activeType)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Gagal memuat konfigurasi.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    const first = window.setTimeout(() => { void fetchConfig().then((result) => { if (active) select('network_target', result.items.find((item) => item.type === 'network_target')); }).catch(() => { if (active) setError('Konfigurasi belum dapat dimuat. Periksa penyimpanan lalu muat ulang.'); }).finally(() => { if (active) setLoading(false); }); }, 0);
    return () => { active = false; window.clearTimeout(first); };
  }, [fetchConfig, select]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const refreshPm2 = useCallback(async () => {
    try {
      const response = await fetch('/api/metrics/server/pm2', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('unavailable');
      setPm2(await response.json()); setPm2Error(false);
    } catch { setPm2Error(true); }
  }, []);
  useEffect(() => {
    if (activeType !== 'pm2_app') return;
    const first = window.setTimeout(() => void refreshPm2(), 0);
    const interval = window.setInterval(() => void refreshPm2(), 30000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [activeType, refreshPm2]);
  const items = useMemo(() => (data?.items || []).filter((item) => item.type === activeType && `${item.key} ${item.label} ${String(item.payload.target || '')}`.toLowerCase().includes(query.toLowerCase())), [activeType, data, query]);
  const interfaces = (data?.items || []).filter((item) => item.type === 'mikrotik_interface');
  const existing = draft.expectedVersion !== null;
  const selected = data?.items.find((item) => item.type === draft.type && item.key === draft.key) || null;
  const canWrite = !!data?.storageEnabled && !loading && !busy;
  const navigate = (type: ConfigItemType, item?: MonitoringConfigItem) => {
    if (dirty) { setNavigation({ type, item }); return; }
    setQuery(''); select(type, item);
  };
  const updateDraft = (next: ConfigInput) => {
    if (!existing && next.type === 'pm2_app') next = { ...next, key: `${next.payload.source || ''}:${next.payload.name || ''}` };
    if (next.type === 'mikrotik_interface') next = { ...next, payload: { ...next.payload, name: next.key } };
    setDraft(next); setMessage(null);
  };
  const prepareSave = (event: React.FormEvent) => {
    event.preventDefault(); setError(null);
    try {
      const next = normalizeConfigInput(draft);
      setPreview({ title: existing ? 'Periksa perubahan pengaturan' : 'Periksa pengaturan baru', body: { action: 'save', ...next }, changes: [{ before: selected, after: next }] });
    } catch (err) { setError(err instanceof Error ? err.message : 'Periksa isian konfigurasi.'); }
  };
  const prepareTransfer = () => {
    setError(null);
    if (dirty) { setError('Simpan atau batalkan perubahan form sebelum memindahkan uplink.'); return; }
    try {
      const changes = planUplinkTransfer(interfaces.map(asInput), transfer.fromKey, transfer.toKey, transfer.logicalKey);
      setPreview({ title: 'Periksa pemindahan uplink', body: { action: 'transfer', ...transfer, versions: Object.fromEntries(interfaces.map((item) => [item.key, item.version])) }, changes: changes.map((after) => ({ before: interfaces.find((item) => item.key === after.key) || null, after })) });
    } catch (err) { setError(err instanceof Error ? err.message : 'Periksa pilihan interface.'); }
  };
  const commit = async () => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/ops/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preview.body), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Perubahan gagal disimpan.');
      setPreview(null); setMessage('Perubahan tersimpan. Monitoring memakai pengaturan ini pada refresh berikutnya.');
      try {
        const updated = await fetchConfig();
        select(activeType, updated.items.find((item) => item.type === activeType && item.key === draft.key) || updated.items.find((item) => item.type === activeType));
      } catch { setError('Perubahan sudah tersimpan, tetapi daftar belum dapat dimuat ulang. Muat ulang halaman sebelum mengedit lagi.'); }
      void refreshPm2();
    } catch (err) { setError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'Penyimpanan belum dapat dikonfirmasi. Muat ulang sebelum mengulang.'); }
    finally { setBusy(false); }
  };
  const currentType = TYPES.find((item) => item.type === activeType)!;
  return <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-500"><Settings2 className="h-3.5 w-3.5" /> Pengaturan operasional</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Monitoring Settings</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Kelola koneksi dan layanan dengan form terpandu. Periksa setiap perubahan sebelum diterapkan.</p></div>
      <div className="flex shrink-0 gap-2"><button type="button" onClick={() => setShowHistory(!showHistory)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium hover:bg-slate-50"><History className="h-4 w-4" /> Riwayat</button><button type="button" disabled={loading || busy} onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Muat ulang</button></div>
    </div>
    <MonitoringHealth />
    {message && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><Check className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}
    {error && !preview && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {!loading && !data?.storageEnabled && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">{data?.message || 'Penyimpanan belum dapat diakses.'} Form belum dapat disimpan sampai koneksi tersedia.</div>}
    {showHistory && <section className="rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Riwayat perubahan</h2><p className="mt-1 text-xs leading-5 text-slate-500">20 perubahan terakhir. Pemulihan hanya tersedia jika versi pengaturan belum berubah lagi; entri yang baru dibuat akan dinonaktifkan.</p></div><div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">{!data?.revisions.length && <p className="p-5 text-sm text-slate-500">Belum ada perubahan yang tercatat.</p>}{data?.revisions.map((revision) => <div key={revision.changeId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="break-words text-sm font-medium">{revision.after.map((item) => item.label).join(', ')}</p><p className="mt-1 text-xs text-slate-500">{new Date(revision.createdAt).toLocaleString('id-ID')} · {revision.actor} · {revision.operation === 'transfer' ? 'Pemindahan uplink' : revision.operation === 'restore' ? 'Pemulihan' : 'Penyimpanan'}</p></div><button type="button" disabled={!canWrite || dirty || !revision.after.every((snapshot) => data?.items.some((item) => item.type === snapshot.type && item.key === snapshot.key && item.version === snapshot.version))} onClick={() => { setError(null); setPreview({ title: 'Periksa pemulihan konfigurasi', restore: true, body: { action: 'restore', changeId: revision.changeId }, changes: revision.after.map((item, index) => ({ before: item, after: { ...asInput(revision.before[index] || item), enabled: revision.before[index]?.enabled ?? false } })) }); }} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-40">Periksa pemulihan</button></div>)}</div></section>}
    <div className="overflow-x-auto border-b border-slate-200"><div className="flex min-w-max gap-1" role="tablist" aria-label="Jenis pengaturan">{TYPES.map((option) => <button key={option.type} type="button" role="tab" aria-label={option.label} aria-selected={activeType === option.type} onClick={() => navigate(option.type, data?.items.find((item) => item.type === option.type))} className={`border-b-2 px-4 py-3 text-sm font-medium transition ${activeType === option.type ? 'border-slate-900 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{option.label}<span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{data?.items.filter((item) => item.type === option.type).length || 0}</span></button>)}</div></div>
    {activeType === 'pm2_app' && <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Source PM2 yang terbaca</h2><p className="mt-1 text-xs leading-5 text-slate-500">Gunakan source yang sesuai dengan pemilik proses. <Link href="/server" className="underline underline-offset-2">Lihat status aplikasi</Link></p></div><button type="button" onClick={() => void refreshPm2()} aria-label="Perbarui source PM2" className="rounded-lg p-2 hover:bg-slate-50"><RefreshCw className="h-4 w-4 text-slate-500" /></button></div>{pm2Error && <p className="mt-3 text-sm text-amber-800">Status PM2 terakhir belum dapat dikonfirmasi. Perbarui untuk mencoba lagi.</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2">{pm2?.sources.map((source) => <div key={source.label} className="min-w-0 rounded-lg border border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-sm font-medium">{source.label}</p><span className={`rounded-full px-2 py-1 text-[11px] ring-1 ring-inset ${freshnessTones[pm2Error ? 'unavailable' : source.freshness.state]}`}>{freshnessLabels[pm2Error ? 'unavailable' : source.freshness.state]}</span></div><p className="mt-2 text-xs text-slate-500">{source.kind === 'local' ? 'Proses user dashboard' : 'Snapshot user lain'} · {source.freshness.observedAt ? new Date(source.freshness.observedAt).toLocaleString('id-ID') : 'Belum ada pengamatan'}</p>{source.error && <p className="mt-2 break-words text-xs leading-5 text-amber-800">{source.error}</p>}</div>)}</div>{!pm2 && !pm2Error && <p className="mt-4 text-sm text-slate-500">Memeriksa source PM2…</p>}{pm2 && <p className="mt-3 text-xs leading-5 text-slate-500">{pm2.policyAvailable ? 'Kebijakan aktif: pengaturan tersimpan, lalu aturan environment untuk aplikasi yang belum memiliki kebijakan.' : pm2.error}</p>}</section>}
    {activeType === 'mikrotik_interface' && <section className="rounded-xl border border-slate-200 bg-white"><button type="button" onClick={() => setShowTransfer(!showTransfer)} className="flex w-full items-center justify-between gap-3 p-5 text-left"><span className="flex items-center gap-3"><span className="rounded-lg bg-slate-100 p-2.5"><ArrowRightLeft className="h-4 w-4 text-slate-600" /></span><span><span className="block text-sm font-semibold">Pindahkan uplink ISP</span><span className="mt-1 block text-xs leading-5 text-slate-500">Perbarui port asal, port tujuan, dan keterangan PPPoE dalam satu langkah.</span></span></span><ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 ${showTransfer ? 'rotate-90' : ''}`} /></button>{showTransfer && <div className="space-y-4 border-t border-slate-100 p-5"><div className="grid gap-4 sm:grid-cols-3">{(['fromKey', 'toKey', 'logicalKey'] as const).map((field) => <Field key={field} label={{ fromKey: 'Port asal', toKey: 'Port tujuan', logicalKey: 'Interface PPPoE' }[field]}><select className={inputClass} value={transfer[field]} onChange={(event) => setTransfer({ ...transfer, [field]: event.target.value })}><option value="">Pilih interface</option>{interfaces.filter((item) => item.enabled && (field === 'fromKey' ? item.payload.role === 'wan' && item.payload.includeInWanTotal === false : field === 'toKey' ? item.payload.role === 'unused' : item.key.startsWith('pppoe-'))).map((item) => <option key={item.key} value={item.key}>{item.key} · {item.label}</option>)}</select></Field>)}</div><p className="text-xs leading-5 text-slate-500">Langkah ini memperbarui monitoring. Pemindahan kabel dan konfigurasi PPPoE pada router dilakukan terpisah.</p><button type="button" disabled={!canWrite} onClick={prepareTransfer} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">Periksa pemindahan</button></div>}</section>}
    <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="space-y-3 border-b border-slate-100 p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{currentType.label}</h2><button type="button" disabled={!canWrite} onClick={() => navigate(activeType)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Baru</button></div><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Cari pengaturan" placeholder="Cari nama atau identitas…" value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-9`} /></div></div><div className="p-4 xl:hidden"><Field label="Pilih pengaturan"><select className={inputClass} value={existing && items.some((item) => item.key === draft.key) ? draft.key : ""} onChange={(event) => { const item = items.find((entry) => entry.key === event.target.value); if (item) navigate(item.type, item); }}><option value="">Pilih entri yang ingin diedit</option>{items.map((item) => <option key={item.key} value={item.key}>{item.label} ({item.key})</option>)}</select></Field></div><div className="hidden max-h-[460px] divide-y divide-slate-100 overflow-y-auto xl:block">{loading && <p className="p-5 text-sm text-slate-500">Memuat pengaturan…</p>}{!loading && items.map((item) => <button key={item.key} type="button" onClick={() => navigate(item.type, item)} aria-current={existing && draft.key === item.key ? 'true' : undefined} className={`block w-full border-l-2 px-4 py-4 text-left transition ${existing && draft.key === item.key ? 'border-l-slate-900 bg-slate-50' : 'border-l-transparent hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-2"><p className="break-words text-sm font-medium">{item.label}</p><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-label={item.enabled ? 'Aktif' : 'Nonaktif'} /></div><p className="mt-1.5 break-all font-mono text-xs text-slate-500">{item.key}</p>{item.type === 'pm2_app' && <p className="mt-2 text-xs text-slate-500">{formatValue(item.payload.mode)}</p>}</button>)}{!loading && !items.length && <div className="p-5 text-sm leading-6 text-slate-500">{query ? 'Tidak ada pengaturan yang cocok.' : 'Belum ada pengaturan. Tambahkan entri pertama melalui tombol Baru.'}</div>}</div></aside>
      <form onSubmit={prepareSave} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6"><div><p className="text-xs font-medium uppercase tracking-wider text-slate-400">{existing ? 'Edit pengaturan' : 'Pengaturan baru'}</p><h2 className="mt-1 text-lg font-semibold">{draft.label || currentType.label}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{currentType.description}</p></div>{dirty && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">Belum disimpan</span>}</div>
        <fieldset disabled={!canWrite} className="min-w-0 space-y-6 p-5 disabled:opacity-60 sm:p-6">
          {activeType === 'pm2_app' && !existing && !!pm2?.processes.length && <Field label="Isi dari aplikasi terdeteksi"><select className={inputClass} defaultValue="" onChange={(event) => { const app = pm2.processes.find((item) => `${item.source}:${item.name}` === event.target.value); if (app) { const saved = data?.items.find((item) => item.type === 'pm2_app' && item.key === `${app.source}:${app.name}`); if (saved) navigate('pm2_app', saved); else updateDraft({ ...draft, key: `${app.source}:${app.name}`, label: `${app.source} / ${app.name}`, payload: { source: app.source, name: app.name, mode: 'required' } }); } }}><option value="">Pilih aplikasi untuk mengisi form</option>{[...new Map(pm2.processes.map((item) => [`${item.source}:${item.name}`, item])).values()].map((item) => <option key={`${item.source}:${item.name}`} value={`${item.source}:${item.name}`}>{item.source} / {item.name}</option>)}</select></Field>}
          <div className="grid gap-5 sm:grid-cols-2"><Field label="Nama tampilan"><input className={inputClass} required maxLength={191} value={draft.label} onChange={(event) => updateDraft({ ...draft, label: event.target.value })} /></Field><Field label={activeType === 'mikrotik_interface' ? 'Nama interface MikroTik' : 'Identitas pengaturan'} hint={existing ? 'Identitas tetap agar entri lama tidak terduplikasi.' : activeType === 'pm2_app' ? 'Terisi dari source dan nama aplikasi.' : 'Gunakan identitas yang unik dan tetap.'}><input className={`${inputClass} font-mono`} required disabled={existing || activeType === 'pm2_app'} maxLength={191} value={draft.key} onChange={(event) => updateDraft({ ...draft, key: event.target.value })} /></Field></div>
          <div className="border-t border-slate-100 pt-6"><ConfigFields draft={draft} onChange={updateDraft} existing={existing} /></div>
          <div className="grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2"><Field label="Urutan tampilan"><input className={inputClass} type="number" min="0" max="100000" required value={draft.sortOrder} onChange={(event) => updateDraft({ ...draft, sortOrder: Number(event.target.value) })} /></Field><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4"><input type="checkbox" className="mt-1 h-4 w-4 accent-slate-900" checked={draft.enabled} onChange={(event) => updateDraft({ ...draft, enabled: event.target.checked })} /><span><span className="block text-sm font-medium">Pengaturan aktif</span><span className="mt-1 block text-xs leading-5 text-slate-500">{activeType === 'pm2_app' ? 'Jika nonaktif, aturan environment berlaku kembali.' : 'Jika nonaktif, entri ini tidak digunakan oleh monitoring.'}</span></span></label></div>
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6"><p className="flex items-center gap-2 text-xs text-slate-500">{existing ? <><Clock3 className="h-3.5 w-3.5" /> Versi {draft.expectedVersion} · {selected?.updatedAt ? new Date(selected.updatedAt).toLocaleString('id-ID') : ''}</> : <><ShieldCheck className="h-3.5 w-3.5" /> Perubahan akan ditampilkan sebelum disimpan</>}</p><div className="flex gap-2">{dirty && <button type="button" disabled={busy} onClick={() => setNavigation({ type: activeType, item: selected || undefined })} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50">Batalkan edit</button>}<button type="submit" disabled={!canWrite || existing && !dirty} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">Periksa & simpan<ChevronRight className="h-4 w-4" /></button></div></div>
      </form>
    </div>
    {preview && <ConfirmationDialog title={preview.title} busy={busy} onCancel={() => { setPreview(null); setError(null); }} onConfirm={() => void commit()} confirmLabel={preview.restore ? 'Pulihkan pengaturan' : 'Terapkan perubahan'}><p className="text-sm leading-6 text-slate-500">{preview.restore ? 'Nilai berikut akan dipulihkan. Pemulihan ditolak jika ada perubahan lebih baru pada salah satu entri.' : 'Periksa nilai lama dan nilai baru. Semua entri di bawah disimpan bersamaan dan dicatat dalam riwayat.'}</p>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}{preview.changes.map((change) => <ChangePreview key={change.after.key} {...change} />)}</ConfirmationDialog>}
    {navigation && <ConfirmationDialog title="Ada perubahan yang belum disimpan" busy={false} onCancel={() => setNavigation(null)} onConfirm={() => { select(navigation.type, navigation.item); setNavigation(null); setQuery(''); }} confirmLabel="Buang perubahan"><p className="text-sm leading-6 text-slate-600">Perubahan pada form ini belum tersimpan. Lanjutkan untuk membuang edit, atau kembali untuk menyimpannya.</p></ConfirmationDialog>}
  </div>;
}
