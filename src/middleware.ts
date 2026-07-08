import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const basicAuth = req.headers.get('authorization');
  const url = req.nextUrl;

  // Validate Basic Auth if provided
  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');

    if (
      user === process.env.DASHBOARD_BASIC_USER &&
      pwd === process.env.DASHBOARD_BASIC_PASS
    ) {
      return NextResponse.next();
    }
  }

  // Require authentication for all routes
  url.pathname = '/api/auth'; // Not really used, we just need to trigger the WWW-Authenticate

  return new NextResponse('Auth required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Dashboard"',
    },
  });
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
