import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function forward(req: NextRequest, path: string[]) {
  const url = new URL(req.url);
  const target = `${API_URL}/api/${path.join('/')}${url.search}`;
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();
  const res = await fetch(target, {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
