import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /v1/admin/org-update-requests/:id/review (G5) —
 * admin decision on a merchant-submitted organization update request.
 */
export class ReviewOrgUpdateDto {
  @ApiProperty({ description: 'APPROVED applies the proposed payload; REJECTED discards it', enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Optional notes shown to the merchant', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
