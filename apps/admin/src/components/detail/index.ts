/**
 * Barrel export for all Admin detail-view shared components.
 */

// ── Formatting utilities ─────────────────────────────────────
export {
  formatDate,
  formatDateShort,
  formatCurrency,
  formatBoolean,
  formatValue,
  truncateId,
  truncateUrl,
  fieldLabel,
} from './formatUtils';

// ── Components ───────────────────────────────────────────────
export { AdminCopyButton } from './AdminCopyButton';
export { AdminStatusBadge, AdminStatusDot } from './AdminStatusBadge';
export { AdminKeyValueGrid, recordToKVItems } from './AdminKeyValueGrid';
export type { KVItem } from './AdminKeyValueGrid';
export { AdminDetailSection } from './AdminDetailSection';
export { AdminDetailHeader } from './AdminDetailHeader';
export { AdminDetailTabs } from './AdminDetailTabs';
export { AdminLoadingSkeleton, AdminSectionSkeleton } from './AdminLoadingSkeleton';
export { AdminErrorState } from './AdminErrorState';
export { AdminEmptyState } from './AdminEmptyState';
export { AdminEntityLink, getEntityHref } from './AdminEntityLink';
export { AdminRelatedTable, statusCell, linkCell } from './AdminRelatedTable';
export type { RelatedColumn } from './AdminRelatedTable';
export { AdminAuditTimeline } from './AdminAuditTimeline';
export type { TimelineEntry } from './AdminAuditTimeline';
