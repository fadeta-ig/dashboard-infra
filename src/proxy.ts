import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionValue } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/login'];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function apiUnauthorized() {
  return NextResponse.json(
    { error: 'Authentication required' },
    {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const isValidSession = await verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value);
  if (isValidSession) return NextResponse.next();

  if (pathname.startsWith('/api/')) return apiUnauthorized();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
