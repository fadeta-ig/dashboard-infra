'use client';

import type { ReactNode } from 'react';
import type { ConfigInput } from '@/lib/config-validation';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-500';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-2"><span className="block text-sm font-medium text-slate-700">{label}</span>{children}{hint && <span className="block text-xs leading-5 text-slate-500">{hint}</span>}</label>;
}

export function ConfigFields({ draft, onChange, existing }: { draft: ConfigInput; onChange: (draft: ConfigInput) => void; existing: boolean }) {
  const p = draft.payload;
  const set = (key: string, value: unknown) => onChange({ ...draft, payload: { ...p, [key]: value } });
  const str = (key: string) => typeof p[key] === 'string' ? p[key] as string : '';
  const input = (key: string, label: string, hint?: string, options: { type?: string; disabled?: boolean; required?: boolean } = {}) => <Field label={label} hint={hint}><input className={inputClass} type={options.type || 'text'} value={options.type === 'number' ? typeof p[key] === 'number' ? String(p[key]) : '' : str(key)} disabled={options.disabled} required={options.required} step={options.type === 'number' ? 'any' : undefined} onChange={(event) => set(key, options.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} /></Field>;
  const select = (key: string, label: string, options: Array<[string, string]>, hint?: string) => <Field label={label} hint={hint}><select className={inputClass} value={str(key)} onChange={(event) => set(key, event.target.value)}>{options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></Field>;
  const toggle = (key: string, label: string, hint: string) => <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4"><input type="checkbox" className="mt-1 h-4 w-4 accent-slate-900" checked={p[key] === true} onChange={(event) => set(key, event.target.checked)} /><span><span className="block text-sm font-medium text-slate-800">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{hint}</span></span></label>;
  const timeInput = (key: string, label: string) => {
    const raw = str(key);
    const date = raw ? new Date(raw) : null;
    const value = date && Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    return <Field label={label} hint="Mengikuti zona waktu perangkat Anda."><input className={inputClass} type="datetime-local" required value={value} onChange={(event) => set(key, event.target.value ? new Date(event.target.value).toISOString() : '')} /></Field>;
  };
  if (draft.type === 'network_target') return <div className="grid gap-5 sm:grid-cols-2">
    {input('target', 'IP atau hostname', 'Tanpa http://, https://, atau port.', { required: true })}
    {select('category', 'Kategori', [['internet', 'Internet'], ['network', 'Jaringan'], ['cctv', 'CCTV'], ['fingerprint', 'Fingerprint'], ['voice', 'Telepon / PBX']])}
    <div className="sm:col-span-2">{input('purpose', 'Keterangan perangkat')}</div>
    <p className="rounded-lg bg-sky-50 p-4 text-xs leading-5 text-sky-800 sm:col-span-2">Perubahan ini mengatur target pada dashboard. Pastikan IP yang sama sudah dipantau Prometheus; daftar scrape Prometheus belum diubah otomatis.</p>
  </div>;
  if (draft.type === 'mikrotik_interface') return <div className="grid gap-5 sm:grid-cols-2">
    {select('role', 'Peran interface', [['wan', 'WAN / uplink'], ['lan', 'LAN'], ['trunk', 'Trunk'], ['vlan', 'VLAN'], ['vpn', 'VPN'], ['loopback', 'Loopback'], ['unused', 'Tidak digunakan'], ['unknown', 'Belum ditentukan']])}
    {select('isp', 'Penyedia internet', [['', 'Tidak terkait ISP'], ['ISP 1', 'ISP 1'], ['ISP 2', 'ISP 2']])}
    {input('downloadCapacityMbps', 'Kapasitas download (Mbps)', 'Kosongkan jika tidak berlaku.', { type: 'number' })}
    {input('uploadCapacityMbps', 'Kapasitas upload (Mbps)', 'Kosongkan jika tidak berlaku.', { type: 'number' })}
    {input('parent', 'Interface induk', 'Contoh: ether4 untuk PPPoE atau ether3 untuk VLAN.')}
    {input('comment', 'Keterangan koneksi')}
    {toggle('expectedUp', 'Interface wajib UP', 'Kondisi DOWN dianggap gangguan jika opsi ini aktif.')}
    {toggle('includeInWanTotal', 'Masukkan ke total WAN', 'Untuk PPPoE, hitung trafik dari interface PPPoE saja agar tidak dihitung dua kali.')}
  </div>;
  if (draft.type === 'pm2_app') return <div className="grid gap-5 sm:grid-cols-2">
    {input('source', 'Source / pemilik PM2', 'Contoh root atau server-wig. Gunakan * untuk semua source.', { disabled: existing, required: true })}
    {input('name', 'Nama aplikasi PM2', 'Nama lengkap sesuai daftar PM2.', { disabled: existing, required: true })}
    <div className="sm:col-span-2">{select('mode', 'Kebijakan monitoring', [['required', 'Wajib online — buat insiden jika berhenti'], ['optional', 'Opsional — tampilkan tanpa kewajiban online'], ['ignored', 'Abaikan — sembunyikan dan jangan pantau']], 'Kebijakan aktif ini mengesampingkan daftar aplikasi pada environment untuk source dan nama yang cocok.')}</div>
    <p className="rounded-lg bg-slate-50 p-4 text-xs leading-5 text-slate-600 sm:col-span-2">Pengaturan ini mengelola monitoring. Menambah kebijakan tidak menjalankan aplikasi atau memindahkan proses antar-user. Menonaktifkan kebijakan mengembalikan aturan environment.</p>
  </div>;
  if (draft.type === 'ubuntu_service') return <div className="space-y-5">{input('matcher', 'Pola nama unit systemd', 'Contoh nginx.*\\.service. Gunakan pola RE2 sederhana.', { required: true })}{toggle('required', 'Service wajib aktif', 'Unit yang tidak tersedia akan ditandai sebagai kebutuhan monitoring yang belum terpenuhi.')}</div>;
  if (draft.type === 'sla_policy') return <div className="grid gap-5 sm:grid-cols-2">{input('category', 'Kategori layanan', 'Contoh internet, network, fingerprint, cctv, atau server.', { required: true })}{input('targetAvailabilityPercent', 'Target availability (%)', undefined, { type: 'number', required: true })}{input('responseMinutes', 'Batas waktu respons (menit)', undefined, { type: 'number', required: true })}{input('resolutionMinutes', 'Batas waktu pemulihan (menit)', undefined, { type: 'number', required: true })}</div>;
  return <div className="grid gap-5 sm:grid-cols-2">
    {select('scope', 'Cakupan maintenance', [['all', 'Semua layanan'], ['domain', 'Kategori layanan'], ['entity', 'Perangkat / entitas tertentu']])}
    {p.scope !== 'all' && input('value', 'Target maintenance', p.scope === 'domain' ? 'Contoh internet atau server.' : 'Identitas perangkat yang akan dipelihara.', { required: true })}
    {timeInput('startsAt', 'Waktu mulai')}{timeInput('endsAt', 'Waktu selesai')}
    <div className="sm:col-span-2">{input('reason', 'Alasan maintenance', undefined, { required: true })}</div>
    <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Selama window aktif, pengiriman notifikasi untuk cakupan terkait ditekan. Riwayat insiden tetap dicatat.</p>
  </div>;
}

export { inputClass };
