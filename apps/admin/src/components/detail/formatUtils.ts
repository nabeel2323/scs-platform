/**
 * formatUtils — standardised data formatting for Admin detail views.
 *
 * Ensures consistent date, currency, boolean, null, URL and ID presentation
 * across every detail page (§25 of the spec).
 */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Format an ISO date string → "25 Sep 2026, 09:42". Returns "Not set" for null/undefined. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not set';
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

/** Format a date for short display → "25 Sep 2026". */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Not set';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Format minor-unit currency → "12.99 SAR". */
export function formatCurrency(minor: number | null | undefined, currency?: string | null): string {
  if (minor == null) return 'Not set';
  const major = (minor / 100).toFixed(2);
  const cur = currency || 'SAR';
  return `${major} ${cur}`;
}

/** Format boolean → "Yes" / "No". */
export function formatBoolean(val: boolean | null | undefined): string {
  if (val == null) return 'Not set';
  return val ? 'Yes' : 'No';
}

/** Format a nullable value → display string. Uses "Not set" for null/undefined. */
export function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'Not set';
  if (typeof val === 'boolean') return formatBoolean(val);
  if (typeof val === 'number') return val.toLocaleString();
  if (typeof val === 'string') return val || 'Not set';
  return String(val);
}

/** Truncate an ID for display: "prd_01J8..." */
export function truncateId(id: string | null | undefined, maxLen = 12): string {
  if (!id) return 'Not set';
  if (id.length <= maxLen) return id;
  return id.slice(0, maxLen) + '…';
}

/** Truncate a URL for visual display while keeping it copyable. */
export function truncateUrl(url: string | null | undefined, maxLen = 48): string {
  if (!url) return 'Not set';
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 3) + '…';
}

/** Build a human-readable label from a camelCase or snake_case key. */
export function fieldLabel(key: string): string {
  const overrides: Record<string, string> = {
    moq: 'MOQ',
    moqMin: 'Minimum MOQ',
    moqMax: 'Maximum MOQ',
    totalMin: 'Minimum total',
    totalMax: 'Maximum total',
    totalMinor: 'Total',
    isAvailable: 'Available',
    isActive: 'Active',
    imageCount: 'Images',
    fullName: 'Name',
    storeName: 'Store',
    orgName: 'Organization',
    basePriceMinor: 'Base Price',
    id: 'ID',
  };
  if (overrides[key]) return overrides[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase())
    .replace(/ Id$/, ' ID');
}
