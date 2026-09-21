import { IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * PATCH /v1/admin/organizations/:id/deactivate
 *
 * Soft-delete toggle for merchant organizations (G14: validated DTO instead
 * of an untyped body so `isActive` can never reach Drizzle as undefined).
 */
export class DeactivateOrganizationDto {
  @ApiProperty({ description: 'true = active, false = deactivated' })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive!: boolean;
}
