/**
 * Shared status vocabulary (G19).
 *
 * Single source of truth for the status strings that cross the API ↔ web ↔
 * admin boundary. The API writes these values; the clients compare and label
 * them. Keep in sync with the Drizzle schema comments in apps/api.
 *
 * NOTE: the API package does not consume @scs/contracts at runtime (no
 * workspace dependency / build pipeline for it yet), so API-side literals
 * mirror these constants — update both when the vocabulary changes.
 */

// ── Organization verification ────────────────────────────────
export const ORG_VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type OrgVerificationStatus = (typeof ORG_VERIFICATION_STATUSES)[number];

// ── Business document verification ───────────────────────────
// Aligned with the org vocabulary; reviewVerification mirrors the review
// decision onto documents (APPROVED→VERIFIED, REJECTED→REJECTED, REVISION→PENDING).
export const DOCUMENT_VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type DocumentVerificationStatus = (typeof DOCUMENT_VERIFICATION_STATUSES)[number];

/** Human labels, including legacy values still present in stored rows. */
export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Under Review',
  VERIFIED: 'Verified',
  APPROVED: 'Approved', // legacy
  REJECTED: 'Rejected',
  NEEDS_CHANGES: 'Needs Changes', // legacy
};

// ── Store verification requests (admin review queue) ─────────
export const VERIFICATION_REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'REVISION',
] as const;
export type VerificationRequestStatus = (typeof VERIFICATION_REQUEST_STATUSES)[number];

// ── Organization update requests (G5) ────────────────────────
export const ORG_UPDATE_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type OrgUpdateRequestStatus = (typeof ORG_UPDATE_REQUEST_STATUSES)[number];

/** Human labels for organization update request statuses. */
export const UPDATE_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};
