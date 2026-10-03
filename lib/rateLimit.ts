import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const distributedLimiters = new Map<string, Ratelimit>();
let lastSweep = 0;

function sharedRateLimitConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

function requestAddress(request: Request): string {
  const forwarded = process.env.TRUST_PROXY === 'true'
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    : undefined;
  return forwarded || (process.env.TRUST_PROXY === 'true' ? request.headers.get('x-real-ip') : null) || 'unknown';
}

function requestKey(request: Request, bucket: string): string {
  return `${bucket}:${requestAddress(request)}`;
}

/** Reject browser requests initiated by a different origin (CSRF defense). */
export function crossOriginResponse(request: Request): NextResponse | null {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return null;
  const host = (process.env.TRUST_PROXY === 'true'
    ? request.headers.get('x-forwarded-host')
    : null) || request.headers.get('host');
  try {
    if (host && new URL(origin).host.toLowerCase() === host.toLowerCase()) return null;
  } catch {
    /* malformed origins are rejected below */
  }
  return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
}

export function protectApiRequest(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
  maxBodyBytes?: number
): Promise<NextResponse | null> {
  const earlyResponse = crossOriginResponse(request) ?? oversizedBodyResponse(request, maxBodyBytes);
  if (earlyResponse) return Promise.resolve(earlyResponse);
  return distributedRateLimitResponse(request, bucket, limit, windowMs);
}

/**
 * Shared fixed-window protection when Upstash credentials are configured.
 * Redis failures intentionally fall back to the local limiter so a transient
 * quota-service outage never removes all protection from an expensive route.
 */
async function distributedRateLimitResponse(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  if (!sharedRateLimitConfigured()) return rateLimitResponse(request, bucket, limit, windowMs);
  const limiterKey = `${bucket}:${limit}:${windowMs}`;
  let limiter = distributedLimiters.get(limiterKey);
  try {
    if (!limiter) {
      const redis = Redis.fromEnv();
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.fixedWindow(limit, `${Math.max(1, Math.ceil(windowMs / 1000))} s`),
        prefix: 'mothertongue:api',
        timeout: 750,
      });
      distributedLimiters.set(limiterKey, limiter);
    }
    const result = await limiter.limit(requestAddress(request));
    if (result.reason === 'timeout') return rateLimitResponse(request, bucket, limit, windowMs);
    if (result.success) return null;
    const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  } catch {
    distributedLimiters.delete(limiterKey);
    return rateLimitResponse(request, bucket, limit, windowMs);
  }
}

/**
 * Reject obviously oversized requests before JSON or multipart parsing allocates
 * the body. Chunked requests still need an edge/body-parser limit as well.
 */
export function oversizedBodyResponse(request: Request, maxBodyBytes?: number): NextResponse | null {
  if (!maxBodyBytes) return null;
  const rawLength = request.headers.get('content-length');
  if (!rawLength) return null;
  const length = Number(rawLength);
  if (!Number.isSafeInteger(length) || length < 0 || length > maxBodyBytes) {
    return NextResponse.json(
      { error: 'Request is too large. Please shorten the text or choose a smaller file.' },
      { status: 413 }
    );
  }
  return null;
}

/**
 * Process-local protection for expensive unauthenticated endpoints.
 * A production deployment should also enforce limits at its edge, but this
 * prevents accidental token-burning between edge checks and the API route.
 */
export function rateLimitResponse(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const now = Date.now();
  if (now - lastSweep > windowMs) {
    for (const [key, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(key);
    }
    lastSweep = now;
  }

  const key = requestKey(request, bucket);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  current.count += 1;
  return null;
}
