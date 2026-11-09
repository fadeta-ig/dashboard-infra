'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function ConfirmationDialog({ title, children, busy, onCancel, onConfirm, confirmLabel = 'Simpan perubahan' }: { title: string; children: ReactNode; busy: boolean; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-labelledby="confirmation-title" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><h2 id="confirmation-title" className="font-semibold">{title}</h2><button type="button" disabled={busy} onClick={onCancel} aria-label="Tutup pratinjau" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
    <div className="space-y-4 px-6 py-5">{children}</div>
    <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4"><button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Batal</button><button type="button" disabled={busy} onClick={onConfirm} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">{busy ? 'Menyimpan…' : confirmLabel}</button></div>
  </dialog>;
}
