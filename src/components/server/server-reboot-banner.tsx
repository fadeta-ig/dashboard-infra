'use client';

import { AlertTriangle } from 'lucide-react';

interface Props {
  rebootRequired: boolean | null;
}

export function ServerRebootBanner({ rebootRequired }: Props) {
  if (!rebootRequired) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4">
      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold text-amber-800 text-sm">Reboot Required</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Server ini memiliki pembaruan kernel atau sistem yang memerlukan restart.{' '}
          File <code className="font-mono bg-amber-100 px-1 rounded">/run/reboot-required</code> terdeteksi.
          Jadwalkan maintenance window untuk melakukan reboot.
        </p>
      </div>
    </div>
  );
}
