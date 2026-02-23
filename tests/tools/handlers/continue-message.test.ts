import { describe, test, expect } from 'bun:test';
import { handleContinueMessage } from '../../../src/background/tools/handlers/continue-message.handler.js';

describe('Continue Message Handler', () => {
  test('returns success message', async () => {
    const result = await handleContinueMessage();
    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('text');
    expect(result.content[0].text).toContain('Chain message initiated');
  });

  test('returns consistent response format', async () => {
    const result1 = await handleContinueMessage();
    const result2 = await handleContinueMessage();
    expect(result1).toEqual(result2);
  });

  test('ignores any arguments passed', async () => {
    const result = await handleContinueMessage({ reason: 'test reason' });
    expect(result.content[0].text).toContain('Chain message initiated');
  });
});
