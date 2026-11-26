import { describe, expect, it } from 'vitest';
import { getImportJobOutcome } from '../lib/import-job-outcome';

describe('import job outcome', () => {
  it('treats only COMPLETED as successful', () => {
    expect(getImportJobOutcome('COMPLETED')).toBe('success');
    expect(getImportJobOutcome('FAILED')).toBe('failure');
    expect(getImportJobOutcome('CANCELLED')).toBe('cancelled');
  });

  it('keeps non-terminal states pending', () => {
    expect(getImportJobOutcome('READY')).toBe('pending');
    expect(getImportJobOutcome('PROCESSING')).toBe('pending');
    expect(getImportJobOutcome('IMPORTING')).toBe('pending');
  });
});
