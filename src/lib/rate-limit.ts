/**
 * In-memory rate limiter: 120 requests per minute per window.
 * Used to stay under Supabase project rate limit (120 req/min).
 * Sliding window: we block until we're under the limit.
 */

const MAX_REQUESTS_PER_MINUTE = 120;
const WINDOW_MS = 60_000;

const timestamps: number[] = [];

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0]! < cutoff) {
    timestamps.shift();
  }
}

/** Wait until we're under the limit, then record a request and return. */
export function acquire(): Promise<void> {
  return new Promise((resolve) => {
    function tryAcquire() {
      prune();
      if (timestamps.length < MAX_REQUESTS_PER_MINUTE) {
        timestamps.push(Date.now());
        resolve();
        return;
      }
      const waitMs = timestamps[0]! + WINDOW_MS - Date.now();
      setTimeout(tryAcquire, Math.max(50, waitMs));
    }
    tryAcquire();
  });
}

/** Wraps fetch so each request is rate-limited (120/min). */
export function createRateLimitedFetch(originalFetch: typeof fetch): typeof fetch {
  return async function rateLimitedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    await acquire();
    return originalFetch(input, init);
  };
}
