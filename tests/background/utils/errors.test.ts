import { test, expect, describe } from 'bun:test';
import { getFriendlyErrorMessage } from '../../../src/background/utils/errors.js';

describe('Error Utilities', () => {
  describe('getFriendlyErrorMessage', () => {
    test('should return friendly error for 401 status', async () => {
      const mockResponse = {
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('Invalid API Key (401)');
    });

    test('should return friendly error for 403 status', async () => {
      const mockResponse = {
        status: 403,
        statusText: 'Forbidden',
        text: async () => JSON.stringify({ error: { message: 'Access denied' } }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('Permission Denied (403)');
    });

    test('should return friendly error for 404 status', async () => {
      const mockResponse = {
        status: 404,
        statusText: 'Not Found',
        text: async () => JSON.stringify({ error: { message: 'Resource not found' } }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('Not Found (404)');
    });

    test('should return friendly error for 429 status', async () => {
      const mockResponse = {
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('Rate Limit Exceeded (429)');
    });

    test('should return friendly error for 5xx status', async () => {
      const mockResponse = {
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => JSON.stringify({ error: { message: 'Server error' } }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('Provider Server Error (500)');
    });

    test('should extract error message from error.message path', async () => {
      const mockResponse = {
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ error: { message: 'Custom error message' } }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('Custom error message');
    });

    test('should extract error message from message path', async () => {
      const mockResponse = {
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ message: 'Generic error message' }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('Generic error message');
    });

    test('should extract error message from error string', async () => {
      const mockResponse = {
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ error: 'String error message' }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('String error message');
    });

    test('should extract error message from array format (Gemini)', async () => {
      const mockResponse = {
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify([{ error: { message: 'Array error message' } }]),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('Array error message');
    });

    test('should truncate very long error messages', async () => {
      const longMessage = 'a'.repeat(600);
      const mockResponse = {
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ error: { message: longMessage } }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).not.toContain(longMessage);
      expect(result).toContain('Bad Request');
    });

    test('should use statusText when JSON parsing fails', async () => {
      const mockResponse = {
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Not valid JSON',
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse);
      expect(result).toContain('Not valid JSON');
    });

    test('should use custom prefix', async () => {
      const mockResponse = {
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ error: { message: 'Error' } }),
      } as unknown as Response;

      const result = await getFriendlyErrorMessage(mockResponse, 'Custom Prefix');
      expect(result).toContain('Custom Prefix (400)');
    });
  });
});
