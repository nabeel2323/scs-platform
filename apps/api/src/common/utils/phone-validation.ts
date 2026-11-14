/**
 * Phone number validation and normalization utility.
 *
 * Uses libphonenumber-js to parse and validate phone numbers,
 * normalizing them to E.164 format for consistent Redis key
 * construction and provider delivery.
 *
 * Security:
 * - Rejects malformed numbers before consuming provider resources.
 * - Ensures the same logical number cannot bypass rate limits
 *   through formatting differences.
 * - Never logs raw phone numbers in error messages.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { BadRequestException } from '@nestjs/common';

/**
 * Validate and normalize a phone number to E.164 format.
 *
 * @param phone - Raw phone number input (any common format).
 * @returns Normalized phone number in E.164 format (e.g., +966500000000).
 * @throws BadRequestException if the phone number is invalid.
 */
export function normalizePhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    throw new BadRequestException('Phone number is required');
  }

  const parsed = parsePhoneNumberFromString(phone);

  if (!parsed || !parsed.isValid()) {
    throw new BadRequestException('Invalid phone number format');
  }

  return parsed.format('E.164');
}

/**
 * Mask a phone number for logging (show only last 4 digits).
 *
 * @param phone - Phone number in E.164 format.
 * @returns Masked phone number (e.g., "***0000").
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length <= 4) return '***';
  return '***' + phone.slice(-4);
}
