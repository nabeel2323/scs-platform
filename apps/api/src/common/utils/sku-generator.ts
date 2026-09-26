/**
 * Reusable SKU generator (Variant Identity Remediation).
 *
 * Produces deterministic, human-readable SKUs from structured inputs.
 * Never uses JSON, UUIDs, attribute IDs, or random values.
 *
 * Format: <BRAND>-<MODEL>-<ATTR1>-<ATTR2>-...
 * Example: LEN-E16-I3-16-512-W11
 *
 * Rules:
 * - Uppercase, ASCII-safe, normalized
 * - Length-limited to fit varchar(100)
 * - Deterministic (same inputs → same SKU)
 * - No JSON, no UUID, no arbitrary random values
 * - Collision suffix appended by caller when needed
 */

/** Normalize a string for SKU inclusion: uppercase, strip non-ASCII, collapse separators. */
function slugify(token: string): string {
  return token
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^A-Z0-9]+/g, '-')     // non-alnum → separator
    .replace(/^-+|-+$/g, '')          // trim leading/trailing hyphens
    .substring(0, 20);                // cap each segment
}

/** Take the first letter of each word, up to `max` chars. "Intel Core" → "IC". */
function abbreviate(text: string, max = 4): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return slugify(words[0] ?? '').substring(0, max);
  return words
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .substring(0, max);
}

/** Extract a compact numeric-ish token from a value like "Intel Core i3-1315U". */
function valueToken(value: string): string {
  const v = value.trim();
  // If it looks like a model number or has digits, keep the meaningful part
  // e.g. "Intel Core i3-1315U" → "I3-1315U", "16GB" → "16GB", "512GB" → "512GB"
  const match = v.match(/[A-Za-z]?\d[\dA-Za-z.\-]*/);
  if (match) return slugify(match[0]).substring(0, 12);
  // Otherwise abbreviate
  return abbreviate(v, 6);
}

export interface SkuInput {
  /** Brand name (e.g. "Lenovo"). Optional — omitted from SKU if absent. */
  brand?: string | null;
  /** Product title or model (e.g. "ThinkPad E16 Gen 2"). */
  productTitle: string;
  /** Variant attribute values in display order (e.g. ["Intel Core i3-1315U", "16GB", "512GB", "Windows 11 Pro"]). */
  attributeValues?: string[];
}

/**
 * Generate a deterministic, human-readable SKU.
 *
 * @example
 * generateSku({ brand: 'Lenovo', productTitle: 'ThinkPad E16 Gen 2', attributeValues: ['Intel Core i3-1315U', '16GB', '512GB', 'Windows 11 Pro'] })
 * // → "LEN-TPE16-I313-16GB-512G-W11P"
 */
export function generateSku(input: SkuInput): string {
  const parts: string[] = [];

  // 1. Brand prefix (abbreviated)
  if (input.brand) {
    parts.push(abbreviate(input.brand, 4));
  }

  // 2. Product model (abbreviated from title)
  if (input.productTitle) {
    parts.push(abbreviate(input.productTitle, 8));
  }

  // 3. Attribute value tokens
  if (input.attributeValues) {
    for (const val of input.attributeValues) {
      if (!val || !val.trim()) continue;
      parts.push(valueToken(val));
    }
  }

  // Join and truncate to 100 chars (the DB column limit)
  const sku = parts.join('-');
  return sku.substring(0, 100);
}

/**
 * Generate a collision-safe SKU by appending a numeric suffix.
 * Caller checks uniqueness and increments suffix until clear.
 *
 * @example
 * appendCollisionSuffix("LEN-E16-I3-16-512-W11", 1) → "LEN-E16-I3-16-512-W11-1"
 * appendCollisionSuffix("LEN-E16-I3-16-512-W11", 2) → "LEN-E16-I3-16-512-W11-2"
 */
export function appendCollisionSuffix(sku: string, suffix: number): string {
  const base = sku.substring(0, 96); // leave room for suffix
  return `${base}-${suffix}`;
}

/**
 * Build a human-readable variant title from typed attribute values.
 *
 * @example
 * buildVariantTitle([
 *   { name: 'Processor', value: 'Intel Core i3-1315U' },
 *   { name: 'RAM', value: '16GB' },
 *   { name: 'Storage', value: '512GB' },
 *   { name: 'OS', value: 'Windows 11 Pro' },
 * ])
 * // → "Intel Core i3-1315U / 16GB / 512GB / Windows 11 Pro"
 */
export function buildVariantTitle(
  attributes: Array<{ name: string; value: string }>,
): string {
  return attributes
    .filter(a => a.value && a.value.trim())
    .map(a => a.value.trim())
    .join(' / ');
}
