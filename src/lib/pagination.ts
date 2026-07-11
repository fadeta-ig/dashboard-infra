export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function normalizePage(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function normalizePageSize(value: number, fallback = DEFAULT_PAGE_SIZE) {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, PAGE_SIZE_OPTIONS[PAGE_SIZE_OPTIONS.length - 1]);
}

export function paginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  const safeTotal = Math.max(0, Math.floor(total));
  const safePageSize = normalizePageSize(pageSize);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const safePage = Math.min(normalizePage(page), totalPages);

  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages,
  };
}

export function paginationOffset(meta: PaginationMeta) {
  return (meta.page - 1) * meta.pageSize;
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const meta = paginationMeta(items.length, page, pageSize);
  const start = paginationOffset(meta);
  return {
    meta,
    items: items.slice(start, start + meta.pageSize),
  };
}
