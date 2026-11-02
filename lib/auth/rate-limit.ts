// Simple in-memory limiter for failed logins: slows down password guessing.
// Kept in process memory, so it resets on restart and is per server instance;
// a production deployment would store attempts in Redis or the database.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 5;

const globalForLimiter = globalThis as unknown as { rpLoginFailures?: Map<string, number[]> };
const failures = (globalForLimiter.rpLoginFailures ??= new Map<string, number[]>());

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

/** Seconds until another attempt is allowed, or 0 if the key may try now. */
export function retryAfterSeconds(key: string, now = Date.now()): number {
  const list = recent(key, now);
  if (list.length < MAX_FAILURES) return 0;
  return Math.ceil((list[0] + WINDOW_MS - now) / 1000);
}

export function recordFailure(key: string, now = Date.now()): void {
  failures.set(key, [...recent(key, now), now]);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

export const LOGIN_LIMIT = { windowMs: WINDOW_MS, maxFailures: MAX_FAILURES };
