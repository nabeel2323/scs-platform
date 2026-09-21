import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export type AdminListInput = Record<string, string | number | undefined>;
export interface AdminListQueryDto {
  limit: number;
  offset: number;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  dateField: string;
  search?: string;
  from?: string;
  to?: string;
  filters: Record<string, string>;
}

const boundedText = z.string().trim().max(200);
const integer = (fallback: number, max: number, min = 0) => z.preprocess(
  value => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  z.number().int().min(min).max(max).default(fallback),
);

/** Runtime validation is shared by HTTP callers and direct service callers. */
export function parseAdminListQuery(
  input: AdminListInput,
  allowedFilters: string[],
  sorts: string[],
  dates: string[],
  defaultSort = 'createdAt',
  defaultDirection: 'asc' | 'desc' = 'desc',
): AdminListQueryDto {
  const shape: Record<string, z.ZodTypeAny> = {
    search: boundedText.optional(),
    limit: integer(50, 100, 1),
    offset: integer(0, Number.MAX_SAFE_INTEGER),
    sortBy: boundedText.default(defaultSort),
    sortDir: z.enum(['asc', 'desc']).default(defaultDirection),
    dateField: boundedText.default(dates[0]!),
    from: boundedText.optional(),
    to: boundedText.optional(),
  };
  for (const key of allowedFilters) shape[key] = boundedText.optional();
  const parsed = z.object(shape).strict().safeParse(input);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  const value = parsed.data;
  if (!sorts.includes(value['sortBy'])) throw new BadRequestException('Unsupported sortBy');
  if (!dates.includes(value['dateField'])) throw new BadRequestException('Unsupported dateField');
  const filters: Record<string, string> = {};
  for (const key of allowedFilters) if (value[key]) filters[key] = value[key];
  return { ...value, filters } as AdminListQueryDto;
}

export function parseFilterDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new BadRequestException('Dates must be YYYY-MM-DD or ISO timestamps with a timezone');
  }
  const date = new Date(value);
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new BadRequestException('Invalid calendar date');
  }
  return date;
}

export function parseBoolean(value: string): boolean {
  if (value !== 'true' && value !== 'false') throw new BadRequestException('Boolean filters must be true or false');
  return value === 'true';
}

export function parseNonnegativeInteger(value: string): number {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number)) throw new BadRequestException('Expected a nonnegative integer');
  return number;
}
