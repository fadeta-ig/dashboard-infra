import { NextResponse, type NextRequest } from 'next/server';

function unauthorized() {
  return new NextResponse('Auth required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="InfraDash"',
      'Cache-Control': 'no-store',
    },
  });
}

function decodeBasicAuth(header: string) {
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Basic' || !value) return null;

  try {
    const decoded = atob(value);
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return null;

    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const expectedUser = process.env.DASHBOARD_BASIC_USER;
  const expectedPass = process.env.DASHBOARD_BASIC_PASS;

  if (!expectedUser || !expectedPass) {
    return unauthorized();
  }

  const credentials = decodeBasicAuth(request.headers.get('authorization') || '');

  if (credentials?.user === expectedUser && credentials.password === expectedPass) {
    return NextResponse.next();
  }

  return unauthorized();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
