/**
 * Shared SKU generation and variant title utilities.
 *
 * Client-side counterpart of `apps/api/src/common/utils/sku-generator.ts`.
 * Both must produce identical output for the same inputs.
 */

/** Normalize a string for SKU inclusion: uppercase, strip non-ASCII, collapse separators. */
function slugify(token: string): string {
  return token
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 20);
}

/** First letter of each word, up to `max` chars. "Intel Core" → "IC". */
function abbreviate(text: string, max = 4): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return slugify(words[0] ?? '').substring(0, max);
  return words
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .substring(0, max);
}

/** Compact token from a value like "Intel Core i3-1315U" → "I3-1315U". */
function valueToken(value: string): string {
  const v = value.trim();
  const match = v.match(/[A-Za-z]?\d[\dA-Za-z.\-]*/);
  if (match) return slugify(match[0]).substring(0, 12);
  return abbreviate(v, 6);
}

export interface SkuInput {
  brand?: string | null;
  productTitle: string;
  attributeValues?: string[];
}

/** Generate a deterministic, human-readable SKU. */
export function generateSku(input: SkuInput): string {
  const parts: string[] = [];
  if (input.brand) parts.push(abbreviate(input.brand, 4));
  if (input.productTitle) parts.push(abbreviate(input.productTitle, 8));
  if (input.attributeValues) {
    for (const val of input.attributeValues) {
      if (!val?.trim()) continue;
      parts.push(valueToken(val));
    }
  }
  return parts.join('-').substring(0, 100);
}

/** Append a collision suffix to a SKU. */
export function appendCollisionSuffix(sku: string, suffix: number): string {
  return `${sku.substring(0, 96)}-${suffix}`;
}

/** Build a human-readable variant title from attribute values. */
export function buildVariantTitle(
  attributes: Array<{ name: string; value: string }>,
): string {
  return attributes
    .filter(a => a.value?.trim())
    .map(a => a.value.trim())
    .join(' / ');
}

/**
 * Resolve a Product Studio combo key into human-readable attribute entries.
 *
 * The combo key is `JSON.stringify([{attrId, value}])` where `attrId` is an
 * attribute definition ID and `value` is the option value string. This looks
 * up each attribute's definition name and option label from the schema.
 */
export function resolveComboAttributes(
  comboKey: string,
  schema: {
    attributes: Array<{
      attributeDefinitionId: string;
      definition: { code: string; name: string } | null;
      options: Array<{ value: string; label: string | null }>;
    }>;
  } | null,
): Array<{ attrId: string; code: string; name: string; value: string; label: string }> {
  try {
    const combos = JSON.parse(comboKey) as Array<{ attrId: string; value: string }>;
    if (!Array.isArray(combos)) return [];
    return combos.map(c => {
      const attrDef = schema?.attributes.find(a => a.attributeDefinitionId === c.attrId);
      const option = attrDef?.options.find(o => o.value === c.value);
      return {
        attrId: c.attrId,
        code: attrDef?.definition?.code ?? c.attrId,
        name: attrDef?.definition?.name ?? c.attrId,
        value: c.value,
        label: option?.label ?? c.value,
      };
    });
  } catch {
    return [];
  }
}
