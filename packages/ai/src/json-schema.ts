import { z } from 'zod';

/**
 * Gemini `responseJsonSchema` JSON Schema'nın sadece bir alt kümesini destekler (SDK tip açıklaması).
 * Zod şemasını JSON Schema'ya çevirip desteklenmeyen anahtarları atar; asıl doğrulama yanıt
 * geldikten sonra Zod ile yapılır.
 */
const SUPPORTED = new Set([
  '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum', 'items',
  'prefixItems', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf', 'properties',
  'additionalProperties', 'required', 'propertyOrdering',
]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (!SUPPORTED.has(key)) continue;
    if (key === 'properties' || key === '$defs') {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, clean(v)]),
      );
    } else {
      out[key] = clean(value);
    }
  }
  return out;
}

export function toGeminiJsonSchema(schema: z.ZodType): unknown {
  return clean(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }));
}
