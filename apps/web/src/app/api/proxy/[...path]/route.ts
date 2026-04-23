import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Headers the upstream API uses for context (audit log, i18n). We forward
// them from the browser request so controllers see real User-Agent and
// Accept-Language values via @Headers().
//
// Security-sensitive headers (x-forwarded-for, x-real-ip, x-forwarded-proto,
// x-forwarded-host) are intentionally NOT in this list: browsers can set
// them from fetch(), and the NestJS API (trust proxy = loopback) would
// honour whatever arrives over the loopback socket. Allowing clients to
// dictate X-Forwarded-For lets them rotate per-request values and bypass
// the per-IP rate limits that protect the auth endpoints. Instead, this
// proxy overwrites X-Forwarded-For / X-Real-IP below with a value it
// controls.
const FORWARD_HEADERS = ['user-agent', 'accept-language'];

async function forward(req: NextRequest, path: string[]) {
  const url = new URL(req.url);
  const target = `${API_URL}/api/${path.join('/')}${url.search}`;
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();

  const outbound: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  for (const name of FORWARD_HEADERS) {
    const value = req.headers.get(name);
    if (value) outbound[name] = value;
  }

  // Derive the client IP from signals the Next.js runtime controls — either
  // the platform-provided NextRequest.ip (Vercel/Edge) or, on Node, the
  // trusted upstream X-Forwarded-For set by a reverse proxy in front of
  // Next.js. If we can't determine it, omit the header entirely: the API
  // will then see the Next proxy's loopback address, which is safe (and
  // rate-limit keys fall back to that shared value rather than a
  // client-controlled one).
  const nextClientIp = (req as unknown as { ip?: string }).ip;
  if (nextClientIp) {
    // Overwrite — do NOT preserve any value the client sent.
    outbound['x-forwarded-for'] = nextClientIp;
    outbound['x-real-ip'] = nextClientIp;
  }

  const res = await fetch(target, {
    method: req.method,
    headers: outbound,
    body,
    cache: 'no-store',
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(req, path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(req, path);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(req, path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(req, path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return forward(req, path);
}
