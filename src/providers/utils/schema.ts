/**
 * Schema Utilities Module
 *
 * JSON Schema cleaning and conversion utilities for provider compatibility.
 */

// ==================== Schema Cleaning ====================

/**
 * Clean JSON Schema by removing incompatible fields
 *
 * Removes fields that may cause issues with certain providers:
 * - additionalProperties: false (breaks custom providers)
 *
 * @param schema - JSON Schema object to clean
 * @returns Cleaned schema object
 */
export function cleanSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // Deep clone to avoid mutating original
  const cleaned = JSON.parse(JSON.stringify(schema));

  const removeIncompatible = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return;

    const record = obj as Record<string, unknown>;

    // Remove additionalProperties: false as it often breaks custom providers
    if (record.additionalProperties === false) {
      delete record.additionalProperties;
    }

    // Recursively clean properties
    if (record.properties && typeof record.properties === 'object') {
      const props = record.properties as Record<string, unknown>;
      for (const key in props) {
        removeIncompatible(props[key]);
      }
    }

    // Clean array items
    if (record.items) {
      removeIncompatible(record.items);
    }
  };

  removeIncompatible(cleaned);
  return cleaned;
}

// ==================== Gemini Schema Conversion ====================

/**
 * Convert JSON Schema to Gemini-compatible format
 *
 * Gemini has specific requirements for function parameter schemas:
 * - Removes incompatible fields ($schema, $ref, format, etc.)
 * - Handles oneOf → anyOf conversion
 * - Merges allOf into single object
 * - Adds default type if missing
 *
 * @param schema - Original JSON Schema
 * @returns Gemini-compatible schema
 */
export function convertToGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} };
  }

  const converted = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;

  // Remove incompatible fields
  delete converted.$schema;
  delete converted.$ref;
  delete converted.$id;
  delete converted.$comment;
  delete converted.additionalItems;
  delete converted.default;
  delete converted.examples;
  delete converted.format;
  delete converted.additionalProperties;
  delete converted.const; // Gemini does not support JSON Schema "const"

  // Remove empty properties object
  if (converted.properties && Object.keys(converted.properties as Record<string, unknown>).length === 0) {
    delete converted.properties;
  }

  // Add default type if missing
  if (!converted.type) {
    if (converted.properties) {
      converted.type = 'object';
    } else if (converted.items) {
      converted.type = 'array';
    } else {
      converted.type = 'string';
    }
  }

  // Recursively convert nested properties
  if (converted.properties && typeof converted.properties === 'object') {
    for (const key of Object.keys(converted.properties as Record<string, unknown>)) {
      (converted.properties as Record<string, unknown>)[key] = convertToGeminiSchema(
        (converted.properties as Record<string, unknown>)[key]
      );
    }
  }

  // Convert array items
  if (converted.items) {
    converted.items = convertToGeminiSchema(converted.items);
  }

  // Convert oneOf to anyOf (Gemini doesn't support oneOf)
  if (converted.oneOf) {
    converted.anyOf = converted.oneOf;
    delete converted.oneOf;
  }

  // Merge allOf into single object (Gemini doesn't support allOf)
  if (converted.allOf) {
    const merged: Record<string, unknown> = {
      type: 'object',
      properties: {},
      required: [] as string[],
    };

    for (const sub of converted.allOf as unknown[]) {
      const subSchema = convertToGeminiSchema(sub);
      if (subSchema.properties) {
        Object.assign(merged.properties as Record<string, unknown>, subSchema.properties);
      }
      if (subSchema.required) {
        (merged.required as string[]).push(...(subSchema.required as string[]));
      }
    }

    // Remove empty required array
    if ((merged.required as string[]).length === 0) {
      delete merged.required;
    }

    return merged;
  }

  // Recursively convert anyOf elements
  if (converted.anyOf && Array.isArray(converted.anyOf)) {
    converted.anyOf = (converted.anyOf as unknown[]).map((s: unknown) => convertToGeminiSchema(s));
  }

  // Remove empty arrays
  if (converted.required && Array.isArray(converted.required) && converted.required.length === 0) {
    delete converted.required;
  }
  if (converted.enum && Array.isArray(converted.enum) && converted.enum.length === 0) {
    delete converted.enum;
  }

  return converted;
}
