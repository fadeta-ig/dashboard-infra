import { NextResponse } from 'next/server';
import { createSessionValue, SESSION_COOKIE } from '@/lib/auth';

interface LoginPayload {
  username?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as LoginPayload;
  const username = typeof payload.username === 'string' ? payload.username : '';
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (username !== process.env.DASHBOARD_BASIC_USER || password !== process.env.DASHBOARD_BASIC_PASS) {
    return NextResponse.json({ error: 'Username atau password tidak sesuai.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionValue(username),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
