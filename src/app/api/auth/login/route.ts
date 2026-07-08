import { NextResponse } from 'next/server';
import { createSessionValue, SESSION_COOKIE } from '@/lib/auth';

interface LoginPayload {
  username?: unknown;
  password?: unknown;
}

function isTruthyEnv(value: string | undefined) {
  return value === '1' || value === 'true' || value === 'yes';
}

function isFalsyEnv(value: string | undefined) {
  return value === '0' || value === 'false' || value === 'no';
}

function shouldUseSecureCookie(request: Request) {
  const override = process.env.DASHBOARD_COOKIE_SECURE?.toLowerCase();
  if (isTruthyEnv(override)) return true;
  if (isFalsyEnv(override)) return false;

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedProto) return forwardedProto === 'https';

  return new URL(request.url).protocol === 'https:';
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as LoginPayload;
  const username = typeof payload.username === 'string' ? payload.username : '';
  const password = typeof payload.password === 'string' ? payload.password : '';

  if (!process.env.DASHBOARD_BASIC_USER || !process.env.DASHBOARD_BASIC_PASS) {
    return NextResponse.json({ error: 'Konfigurasi login server belum lengkap.' }, { status: 500 });
  }

  if (username !== process.env.DASHBOARD_BASIC_USER || password !== process.env.DASHBOARD_BASIC_PASS) {
    return NextResponse.json({ error: 'Username atau password tidak sesuai.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionValue(username),
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(request),
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}