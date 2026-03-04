/**
 * Tests for Schema Utilities Module
 */

import { describe, expect, it } from 'bun:test';
import { cleanSchema, convertToGeminiSchema } from '../../../src/providers/utils/schema.ts';

describe('Schema Utilities', () => {
  describe('cleanSchema', () => {
    it('should return null/undefined as-is', () => {
      expect(cleanSchema(null)).toBe(null);
      expect(cleanSchema(undefined)).toBe(undefined);
    });

    it('should return primitives as-is', () => {
      expect(cleanSchema('string')).toBe('string');
      expect(cleanSchema(123)).toBe(123);
      expect(cleanSchema(true)).toBe(true);
    });

    it('should remove additionalProperties: false', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };

      const cleaned = cleanSchema(schema) as Record<string, unknown>;

      expect(cleaned.additionalProperties).toBeUndefined();
      expect(cleaned.type).toBe('object');
    });

    it('should preserve additionalProperties: true', () => {
      const schema = {
        type: 'object',
        additionalProperties: true,
      };

      const cleaned = cleanSchema(schema) as Record<string, unknown>;

      expect(cleaned.additionalProperties).toBe(true);
    });

    it('should clean nested properties', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      };

      const cleaned = cleanSchema(schema) as Record<string, unknown>;
      const userProps = (cleaned.properties as Record<string, unknown>).user as Record<string, unknown>;

      expect(userProps.additionalProperties).toBeUndefined();
    });

    it('should clean array items', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' } },
          additionalProperties: false,
        },
      };

      const cleaned = cleanSchema(schema) as Record<string, unknown>;
      const items = cleaned.items as Record<string, unknown>;

      expect(items.additionalProperties).toBeUndefined();
    });

    it('should not mutate original schema', () => {
      const schema = {
        type: 'object',
        additionalProperties: false,
      };

      const cleaned = cleanSchema(schema);

      expect(schema.additionalProperties).toBe(false);
      expect((cleaned as Record<string, unknown>).additionalProperties).toBeUndefined();
    });
  });

  describe('convertToGeminiSchema', () => {
    it('should return default object for null/undefined', () => {
      const result = convertToGeminiSchema(null);
      expect(result).toEqual({ type: 'object', properties: {} });
    });

    it('should return default object for non-objects', () => {
      const result = convertToGeminiSchema('string');
      expect(result).toEqual({ type: 'object', properties: {} });
    });

    it('should remove $schema field', () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.$schema).toBeUndefined();
    });

    it('should remove $ref field', () => {
      const schema = {
        $ref: '#/definitions/User',
        type: 'object',
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.$ref).toBeUndefined();
    });

    it('should remove format field', () => {
      const schema = {
        type: 'string',
        format: 'date-time',
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.format).toBeUndefined();
    });

    it('should remove additionalProperties field', () => {
      const schema = {
        type: 'object',
        additionalProperties: { type: 'string' },
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.additionalProperties).toBeUndefined();
    });

    it('should remove const field', () => {
      const schema = {
        type: 'string',
        const: 'fixed_value',
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.const).toBeUndefined();
      expect(converted.type).toBe('string');
    });

    it('should remove const field in nested properties', () => {
      const schema = {
        type: 'object',
        properties: {
          version: { type: 'string', const: 'v1' },
          name: { type: 'string' },
        },
      };

      const converted = convertToGeminiSchema(schema);
      const versionProp = (converted.properties as Record<string, unknown>).version as Record<string, unknown>;

      expect(versionProp.const).toBeUndefined();
      expect(versionProp.type).toBe('string');
    });

    it('should add default type for object with properties', () => {
      const schema = {
        properties: { name: { type: 'string' } },
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.type).toBe('object');
    });

    it('should add default type for array with items', () => {
      const schema = {
        items: { type: 'string' },
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.type).toBe('array');
    });

    it('should add default string type for other schemas', () => {
      const schema = {};

      const converted = convertToGeminiSchema(schema);

      expect(converted.type).toBe('string');
    });

    it('should convert oneOf to anyOf', () => {
      const schema = {
        oneOf: [{ type: 'string' }, { type: 'number' }],
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.oneOf).toBeUndefined();
      expect(converted.anyOf).toBeDefined();
      expect(Array.isArray(converted.anyOf)).toBe(true);
    });

    it('should merge allOf into single object', () => {
      const schema = {
        allOf: [
          {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
          {
            type: 'object',
            properties: { age: { type: 'number' } },
            required: ['age'],
          },
        ],
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.allOf).toBeUndefined();
      expect(converted.type).toBe('object');
      expect(converted.properties).toBeDefined();
      expect((converted.properties as Record<string, unknown>).name).toBeDefined();
      expect((converted.properties as Record<string, unknown>).age).toBeDefined();
      expect(converted.required).toContain('name');
      expect(converted.required).toContain('age');
    });

    it('should remove empty required array', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: [],
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.required).toBeUndefined();
    });

    it('should remove empty enum array', () => {
      const schema = {
        type: 'string',
        enum: [],
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.enum).toBeUndefined();
    });

    it('should remove empty properties object', () => {
      const schema = {
        type: 'object',
        properties: {},
      };

      const converted = convertToGeminiSchema(schema);

      expect(converted.properties).toBeUndefined();
    });

    it('should recursively convert nested properties', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string', format: 'email' },
            },
          },
        },
      };

      const converted = convertToGeminiSchema(schema);
      const userProps = (converted.properties as Record<string, unknown>).user as Record<string, unknown>;
      const nameProps = (userProps.properties as Record<string, unknown>).name as Record<string, unknown>;

      expect(nameProps.format).toBeUndefined();
      expect(nameProps.type).toBe('string');
    });

    it('should recursively convert array items', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      };

      const converted = convertToGeminiSchema(schema);
      const items = converted.items as Record<string, unknown>;
      const idProps = (items.properties as Record<string, unknown>).id as Record<string, unknown>;

      expect(idProps.format).toBeUndefined();
    });

    it('should recursively convert anyOf elements', () => {
      const schema = {
        anyOf: [
          { type: 'string', format: 'email' },
          { type: 'string', format: 'uri' },
        ],
      };

      const converted = convertToGeminiSchema(schema);
      const anyOf = converted.anyOf as Array<Record<string, unknown>>;

      expect(anyOf[0].format).toBeUndefined();
      expect(anyOf[1].format).toBeUndefined();
    });
  });
});
