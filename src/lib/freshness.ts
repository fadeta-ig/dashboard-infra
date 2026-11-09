export interface Freshness {
  state: 'fresh' | 'stale' | 'unavailable';
  observedAt: string | null;
  ageSeconds: number | null;
  maxAgeSeconds: number;
}

export function evaluateFreshness(observedAt: string | null, maxAgeMs: number, nowMs = Date.now()): Freshness {
  const observed = observedAt ? Date.parse(observedAt) : NaN;
  const valid = Number.isFinite(observed);
  const ageMs = valid ? nowMs - observed : NaN;
  return {
    state: !valid ? 'unavailable' : ageMs < -30000 || ageMs > maxAgeMs ? 'stale' : 'fresh',
    observedAt: valid ? new Date(observed).toISOString() : null,
    ageSeconds: valid ? Math.max(0, Math.floor(ageMs / 1000)) : null,
    maxAgeSeconds: Math.floor(maxAgeMs / 1000),
  };
}
