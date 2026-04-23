import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Headers the upstream API uses for context (audit log, i18n). We forward
// them from the browser request so values like the real client IP,
// User-Agent, and Accept-Language are available to controllers via @Ip()
// and @Headers() — the proxy previously stripped them, which made audit
// rows record the Next.js server's loopback instead of the real client.
const FORWARD_HEADERS = [
  'user-agent',
  'accept-language',
  'x-forwarded-for',
  'x-real-ip',
  'x-forwarded-proto',
  'x-forwarded-host',
];

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
  // Append this hop to X-Forwarded-For so the API (trust proxy = true)
  // still resolves the real client IP even when the request arrived here
  // without an X-Forwarded-For header (direct browser hit).
  const clientIp = req.headers.get('x-forwarded-for') ?? (req as unknown as { ip?: string }).ip;
  if (clientIp && !outbound['x-forwarded-for']) {
    outbound['x-forwarded-for'] = clientIp;
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
