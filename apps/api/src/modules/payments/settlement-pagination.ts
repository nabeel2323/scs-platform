import { BadRequestException } from '@nestjs/common';

export const DEFAULT_SETTLEMENT_PAGE_SIZE = 25;
export const MAX_SETTLEMENT_PAGE_SIZE = 100;

export interface SettlementPagination {
  limit: number;
  offset: number;
}

function parseNonNegativeInteger(
  value: string | undefined,
  field: 'limit' | 'offset',
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  if (!/^[0-9]+$/.test(value)) {
    throw new BadRequestException(field + ' must be a non-negative integer');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(field + ' exceeds the supported integer range');
  }
  return parsed;
}

/** Strictly parse public query parameters; never silently coerce invalid paging input. */
export function parseSettlementPagination(
  limitValue?: string,
  offsetValue?: string,
): SettlementPagination {
  const limit = parseNonNegativeInteger(limitValue, 'limit', DEFAULT_SETTLEMENT_PAGE_SIZE);
  const offset = parseNonNegativeInteger(offsetValue, 'offset', 0);
  if (limit < 1 || limit > MAX_SETTLEMENT_PAGE_SIZE) {
    throw new BadRequestException('limit must be between 1 and ' + MAX_SETTLEMENT_PAGE_SIZE);
  }
  return { limit, offset };
}

/** Validate service-level callers as well as controller-parsed query parameters. */
export function normalizeSettlementPagination(
  input?: Partial<SettlementPagination>,
): SettlementPagination {
  const limit = input?.limit ?? DEFAULT_SETTLEMENT_PAGE_SIZE;
  const offset = input?.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SETTLEMENT_PAGE_SIZE) {
    throw new BadRequestException(
      'limit must be an integer between 1 and ' + MAX_SETTLEMENT_PAGE_SIZE,
    );
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new BadRequestException('offset must be a non-negative safe integer');
  }
  return { limit, offset };
}
