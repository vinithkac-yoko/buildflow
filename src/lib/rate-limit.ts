/** In-memory sliding-window limiter (acceptable for the single-instance demo deployment). */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimit(key: string) {
  hits.delete(key);
}
