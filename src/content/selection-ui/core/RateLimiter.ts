/**
 * Rate limiter for AI requests
 * Prevents spamming the AI API with too many requests
 */

import { RATE_LIMIT_MS } from '../constants.ts';

export interface RateLimiter {
  /**
   * Check if a request can proceed
   * @returns true if the request can proceed, false if rate limited
   */
  canProceed(): boolean;

  /**
   * Get the time in ms until the next request can be made
   * @returns 0 if can proceed immediately, otherwise ms to wait
   */
  getTimeUntilNext(): number;

  /**
   * Record that a request was made
   * Should be called after a successful request
   */
  recordRequest(): void;

  /**
   * Reset the rate limiter
   */
  reset(): void;
}

/**
 * Create a rate limiter instance
 * @param minIntervalMs - Minimum time between requests in milliseconds
 */
export function createRateLimiter(minIntervalMs: number = RATE_LIMIT_MS): RateLimiter {
  let lastRequestTime = 0;

  return {
    canProceed(): boolean {
      return Date.now() - lastRequestTime >= minIntervalMs;
    },

    getTimeUntilNext(): number {
      const elapsed = Date.now() - lastRequestTime;
      const remaining = minIntervalMs - elapsed;
      return Math.max(0, remaining);
    },

    recordRequest(): void {
      lastRequestTime = Date.now();
    },

    reset(): void {
      lastRequestTime = 0;
    },
  };
}
