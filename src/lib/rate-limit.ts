import { NextResponse, type NextRequest } from 'next/server';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function getClientKey(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return forwardedFor || realIp || 'local';
}

export function enforceMetricsRateLimit(request: NextRequest): NextResponse | null {
  const now = Date.now();
  const key = `${getClientKey(request)}:${request.nextUrl.pathname}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }

  current.count += 1;

  if (current.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: 'Too many metric requests. Please slow down.' },
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

export function noStoreJson<T>(body: T, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
