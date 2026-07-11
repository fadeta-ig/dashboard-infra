import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface SortHeaderButtonProps<TSort extends string> {
  label: string;
  sortKey: TSort;
  activeSort: TSort;
  direction: 'asc' | 'desc';
  onSort: (sortKey: TSort) => void;
  align?: 'left' | 'right';
}

export function SortHeaderButton<TSort extends string>({
  label,
  sortKey,
  activeSort,
  direction,
  onSort,
  align = 'left',
}: SortHeaderButtonProps<TSort>) {
  const active = activeSort === sortKey;
  const Icon = active ? direction === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex w-full items-center gap-1.5 font-medium transition-colors hover:text-foreground ${
        align === 'right' ? 'justify-end' : 'justify-start'
      } ${active ? 'text-foreground' : 'text-muted-foreground'}`}
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
