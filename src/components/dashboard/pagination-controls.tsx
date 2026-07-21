import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MAX_PAGE_SIZE, type PaginationMeta } from '@/lib/pagination';

interface PaginationControlsProps {
  pagination: PaginationMeta;
  itemLabel: string;
  onPageChange: (page: number) => void;
}

type PageItem = number | 'start-ellipsis' | 'end-ellipsis';

function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 4) return [1, 2, 3, 4, 5, 'end-ellipsis', totalPages];
  if (page >= totalPages - 3) {
    return [1, 'start-ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  const firstSibling = page - 1;
  const lastSibling = page + 1;
  const items: PageItem[] = [1];

  if (firstSibling > 2) items.push('start-ellipsis');
  for (let current = firstSibling; current <= lastSibling; current += 1) items.push(current);
  if (lastSibling < totalPages - 1) items.push('end-ellipsis');

  items.push(totalPages);
  return items;
}

export function PaginationControls({
  pagination,
  itemLabel,
  onPageChange,
}: PaginationControlsProps) {
  const { page, pageSize, total, totalPages } = pagination;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  return (
    <nav
      className="flex flex-col gap-3 border-t border-border bg-white/70 px-4 py-3 text-sm lg:flex-row lg:items-center lg:justify-between"
      aria-label={`Pagination ${itemLabel}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground" aria-live="polite">
        Menampilkan <span className="font-medium text-foreground">{start}-{end}</span> dari{' '}
        <span className="font-medium text-foreground">{total}</span> {itemLabel}
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-slate-500">
          Maks. {MAX_PAGE_SIZE} / halaman
        </span>
      </div>
      <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-0.5">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          Halaman {page} dari {totalPages}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={!canGoPrevious}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-slate-600 shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageItems(page, totalPages).map((item) => (
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-label={`Halaman ${item}`}
                aria-current={item === page ? 'page' : undefined}
                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                  item === page
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-border bg-card text-slate-600 hover:bg-muted hover:text-foreground'
                }`}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="inline-flex h-9 w-7 items-center justify-center text-muted-foreground" aria-hidden="true">
                &hellip;
              </span>
            )
          ))}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!canGoNext}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-slate-600 shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
