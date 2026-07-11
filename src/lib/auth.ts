export const SESSION_COOKIE = 'wig_monitoring_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getSessionSecret() {
  return process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_BASIC_PASS || 'development-session-secret';
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signPayload(payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function createSessionValue(username: string) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${encodeURIComponent(username)}.${expiresAt}`;
  const signature = await signPayload(payload);
  return `${payload}.${signature}`;
}

export async function getSessionUsername(value: string | undefined) {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;

  const [encodedUser, expiresAtRaw, signature] = parts;
  const expectedUser = process.env.DASHBOARD_BASIC_USER;
  const expiresAt = Number.parseInt(expiresAtRaw, 10);

  if (!expectedUser || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const payload = `${encodedUser}.${expiresAtRaw}`;
  const expectedSignature = await signPayload(payload);
  const username = decodeURIComponent(encodedUser);

  return username === expectedUser && safeEqual(signature, expectedSignature) ? username : null;
}

export async function verifySessionValue(value: string | undefined) {
  return (await getSessionUsername(value)) !== null;
}
