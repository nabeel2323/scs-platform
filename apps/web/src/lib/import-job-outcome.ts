export type ImportJobOutcome = 'success' | 'failure' | 'cancelled' | 'pending';

/** Classify terminal import states without treating FAILED as successful completion. */
export function getImportJobOutcome(status: string): ImportJobOutcome {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED') return 'failure';
  if (status === 'CANCELLED') return 'cancelled';
  return 'pending';
}
