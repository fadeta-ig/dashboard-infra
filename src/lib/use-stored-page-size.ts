'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_PAGE_SIZE, normalizePageSize } from '@/lib/pagination';

const EVENT_NAME = 'dashboard-page-size-change';

function storageKey(scope: string) {
  return `dashboard:page-size:${scope}`;
}

function readPageSize(scope: string, fallback = DEFAULT_PAGE_SIZE) {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(storageKey(scope));
  return normalizePageSize(raw ? Number.parseInt(raw, 10) : fallback, fallback);
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(EVENT_NAME, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(EVENT_NAME, callback);
  };
}

export function useStoredPageSize(scope: string, fallback = DEFAULT_PAGE_SIZE) {
  const pageSize = useSyncExternalStore(
    subscribe,
    () => readPageSize(scope, fallback),
    () => fallback,
  );

  const setPageSize = useCallback((nextPageSize: number) => {
    const normalized = normalizePageSize(nextPageSize, fallback);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey(scope), String(normalized));
      window.dispatchEvent(new Event(EVENT_NAME));
    }
  }, [fallback, scope]);

  return [pageSize, setPageSize] as const;
}
