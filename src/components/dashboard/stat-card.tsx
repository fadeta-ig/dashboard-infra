import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  status?: 'healthy' | 'warning' | 'critical' | 'unknown' | 'degraded';
}

export function StatCard({ title, value, description, icon: Icon, status = 'unknown' }: StatCardProps) {
  const statusColors = {
    healthy: 'text-healthy',
    warning: 'text-warning',
    critical: 'text-critical',
    degraded: 'text-warning',
    unknown: 'text-unknown',
  };

  const statusBgColors = {
    healthy: 'bg-emerald-50 border-emerald-100',
    warning: 'bg-amber-50 border-amber-100',
    critical: 'bg-red-50 border-red-100',
    degraded: 'bg-amber-50 border-amber-100',
    unknown: 'bg-slate-50 border-slate-100',
  };

  return (
    <div className="panel-surface rounded-lg p-5 transition-colors hover:border-slate-300">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-sm font-semibold text-slate-500">{title}</h3>
        <div className={cn('p-2 rounded-md border transition-colors', statusBgColors[status])}>
          <Icon className={cn('h-4 w-4', statusColors[status])} />
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-1">
        <span className="text-3xl font-semibold tracking-tight text-slate-950">{value}</span>
        {description && <p className="text-xs text-muted-foreground font-medium">{description}</p>}
      </div>
    </div>
  );
}
