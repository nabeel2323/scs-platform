import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * PATCH /v1/admin/products/:id/moderate
 *
 * Validated DTO for product moderation decisions (P2 DTO validation, API-B10
 * pattern). Without this, an unrecognized `decision` value would skip every
 * switch branch, bump only `updatedAt`, and return 200 — a fake success that
 * leaves the product in its original status.
 */
export class ModerateProductDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED', 'ARCHIVED'] })
  @IsIn(['APPROVED', 'REJECTED', 'ARCHIVED'], {
    message: 'decision must be one of: APPROVED, REJECTED, ARCHIVED',
  })
  decision!: 'APPROVED' | 'REJECTED' | 'ARCHIVED';

  @ApiPropertyOptional({ description: 'Optional reviewer note echoed in the response; not persisted' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
