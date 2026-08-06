import { describe, expect, it } from 'bun:test';
import {
  isSandboxRequest,
  isValidDimension,
  SANDBOX_FROM_FLAG,
} from '../../src/utils/slideRendererProtocol';

describe('slideRendererProtocol.isSandboxRequest', () => {
  it('accepts a valid render request', () => {
    const req = { type: 'render', html: '<h1>Hi</h1>', width: 1280, height: 720, requestId: 'r1' } as const;
    expect(isSandboxRequest(req)).toBe(true);
  });

  it('rejects a render missing width/height/html', () => {
    expect(isSandboxRequest({ type: 'render', html: '<p>x</p>' })).toBe(false);
    expect(isSandboxRequest({ type: 'render', width: 10, height: 10 })).toBe(false);
  });

  it('accepts a valid capture request', () => {
    expect(isSandboxRequest({ type: 'capture', width: 1080, height: 1350, backgroundColor: '#000' })).toBe(true);
  });

  it('rejects a capture missing dimensions', () => {
    expect(isSandboxRequest({ type: 'capture', backgroundColor: '#fff' })).toBe(false);
  });

  it('accepts a ping', () => {
    expect(isSandboxRequest({ type: 'ping', requestId: 'p' })).toBe(true);
  });

  it('rejects unknown, null, and non-object payloads', () => {
    expect(isSandboxRequest({ type: 'purge' })).toBe(false);
    expect(isSandboxRequest(null)).toBe(false);
    expect(isSandboxRequest('ready')).toBe(false);
    expect(isSandboxRequest(undefined)).toBe(false);
  });

  it('rejects sandbox->parent responses (no matching request shape)', () => {
    expect(isSandboxRequest({ type: 'ready', fromSandbox: true })).toBe(false);
    expect(isSandboxRequest({ type: 'captured', fromSandbox: true, dataUrl: 'data:x' })).toBe(false);
  });
});

describe('slideRendererProtocol.isValidDimension', () => {
  it('accepts positive finite integers within range', () => {
    expect(isValidDimension(1)).toBe(true);
    expect(isValidDimension(1920)).toBe(true);
    expect(isValidDimension(8192)).toBe(true);
  });

  it('rejects zero, negatives, floats, NaN, Infinity, and non-numbers', () => {
    expect(isValidDimension(0)).toBe(false);
    expect(isValidDimension(-5)).toBe(false);
    expect(isValidDimension(10.5)).toBe(false);
    expect(isValidDimension(NaN)).toBe(false);
    expect(isValidDimension(Infinity)).toBe(false);
    expect(isValidDimension('720')).toBe(false);
    expect(isValidDimension(undefined)).toBe(false);
  });

  it('rejects oversized dimensions (hard sandbox cap)', () => {
    expect(isValidDimension(8193)).toBe(false);
    expect(isValidDimension(100000)).toBe(false);
  });
});

describe('slideRendererProtocol.SANDBOX_FROM_FLAG', () => {
  it('is the normative "fromSandbox" marker', () => {
    expect(SANDBOX_FROM_FLAG).toBe('fromSandbox');
  });
});
