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
    healthy: 'bg-healthy/10',
    warning: 'bg-warning/10',
    critical: 'bg-critical/10',
    degraded: 'bg-warning/10',
    unknown: 'bg-unknown/10',
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-6 shadow-sm transition-all duration-300">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className={cn('p-2 rounded-md transition-colors', statusBgColors[status])}>
          <Icon className={cn('h-4 w-4', statusColors[status])} />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-1">
        <span className="text-2xl font-semibold tracking-tight text-primary">{value}</span>
        {description && <p className="text-xs text-muted-foreground font-medium">{description}</p>}
      </div>
    </div>
  );
}

