import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  status: 'healthy' | 'warning' | 'critical' | 'unknown' | 'degraded';
  text?: string;
}

export function StatusIndicator({ status, text }: StatusIndicatorProps) {
  const statusColors = {
    healthy: 'bg-healthy',
    warning: 'bg-warning',
    critical: 'bg-critical',
    degraded: 'bg-warning',
    unknown: 'bg-unknown',
  };

  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-3 w-3">
        {(status === 'warning' || status === 'critical' || status === 'degraded') && (
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', statusColors[status])}></span>
        )}
        <span className={cn('relative inline-flex rounded-full h-3 w-3', statusColors[status])}></span>
      </span>
      {text && <span className="text-sm font-medium capitalize">{text}</span>}
    </div>
  );
}
