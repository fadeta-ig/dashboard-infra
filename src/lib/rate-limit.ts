import { NextResponse, type NextRequest } from 'next/server';

const METRICS_WINDOW_MS = 60_000;
const METRICS_MAX_REQUESTS = 120;
const AUTH_WINDOW_MS = 5 * 60_000;
const AUTH_MAX_REQUESTS = 10;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let cleanupCounter = 0;

interface RateLimitOptions {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
  message: string;
}

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return forwardedFor || realIp || 'local';
}

function getPathname(request: Request) {
  return new URL(request.url).pathname;
}

function cleanupExpiredBuckets(now: number) {
  cleanupCounter += 1;
  if (cleanupCounter % 100 !== 0) return;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function enforceRateLimit(request: Request, options: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const key = `${options.keyPrefix}:${getClientKey(request)}:${getPathname(request)}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  current.count += 1;

  if (current.count > options.maxRequests) {
    return NextResponse.json(
      { error: options.message },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((current.resetAt - now) / 1000)),
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  return null;
}

export function enforceMetricsRateLimit(request: NextRequest): NextResponse | null {
  return enforceRateLimit(request, {
    keyPrefix: 'metrics',
    windowMs: METRICS_WINDOW_MS,
    maxRequests: METRICS_MAX_REQUESTS,
    message: 'Too many metric requests. Please slow down.',
  });
}

export function enforceAuthRateLimit(request: Request): NextResponse | null {
  return enforceRateLimit(request, {
    keyPrefix: 'auth',
    windowMs: AUTH_WINDOW_MS,
    maxRequests: AUTH_MAX_REQUESTS,
    message: 'Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.',
  });
}

export function noStoreJson<T>(body: T, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
