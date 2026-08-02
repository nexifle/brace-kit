/**
 * Tests for model-fetch cache freshness (failure backoff).
 */

import { describe, expect, it } from 'bun:test';
import { isModelFetchCacheFresh } from '../../src/utils/providerUtils.ts';

describe('isModelFetchCacheFresh', () => {
  const now = 1_000_000_000_000;

  it('no cache → fetch', () => {
    expect(isModelFetchCacheFresh(undefined, now)).toBe(false);
  });

  it('successful fetch is fresh within 1h', () => {
    expect(isModelFetchCacheFresh({ fetchedAt: now - 60_000 }, now)).toBe(true);
  });

  it('successful fetch expires after 1h', () => {
    expect(isModelFetchCacheFresh({ fetchedAt: now - 3_700_000 }, now)).toBe(false);
  });

  it('failed fetch backs off for 5 minutes', () => {
    // 404 recorded 10s ago → skip (don't hammer the endpoint)
    expect(isModelFetchCacheFresh({ fetchedAt: now - 10_000, failedAt: now - 10_000 }, now)).toBe(true);
    // 404 recorded 10 minutes ago → allow retry
    expect(isModelFetchCacheFresh({ fetchedAt: now - 600_000, failedAt: now - 600_000 }, now)).toBe(false);
  });

  it('force bypasses any cache', () => {
    expect(isModelFetchCacheFresh({ fetchedAt: now - 1_000 }, now, true)).toBe(false);
    expect(isModelFetchCacheFresh({ fetchedAt: now - 1_000, failedAt: now - 1_000 }, now, true)).toBe(false);
  });
});
