import { NextResponse } from 'next/server';

/** Lightweight same-origin reachability probe for the offline router. */
export async function GET() {
  return NextResponse.json({ ok: true });
}
