import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewVerificationDto {
  @IsIn(['APPROVED', 'REJECTED', 'REVISION'])
  decision!: 'APPROVED' | 'REJECTED' | 'REVISION';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  rejectionReasons?: string[];
}
