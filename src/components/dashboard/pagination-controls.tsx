import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS, type PaginationMeta } from '@/lib/pagination';

interface PaginationControlsProps {
  pagination: PaginationMeta;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function PaginationControls({
  pagination,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const { page, pageSize, total, totalPages } = pagination;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  if (total <= PAGE_SIZE_OPTIONS[0]) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-white/70 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
      <div className="text-muted-foreground">
        Menampilkan <span className="font-medium text-foreground">{start}-{end}</span> dari{' '}
        <span className="font-medium text-foreground">{total}</span> {itemLabel}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-muted-foreground">
          Per halaman
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number.parseInt(event.target.value, 10))}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-foreground outline-none transition-colors hover:bg-muted focus:border-slate-400"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={!canGoPrevious}
            className="rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Halaman pertama"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={!canGoPrevious}
            className="rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-20 px-2 text-center text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={!canGoNext}
            className="rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoNext}
            className="rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Halaman terakhir"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
