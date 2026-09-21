import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /v1/organizations/:id/update-requests (G5) —
 * proposed changes to legal business details, pending admin approval.
 * At least one field must be provided (enforced in the service).
 */
export class OrgUpdateRequestDto {
  @ApiPropertyOptional({ description: 'Proposed trading name', maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ description: 'Proposed legal name', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional({ description: 'Proposed tax identifier', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxId?: string;
}
