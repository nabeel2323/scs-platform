import { IsString, IsNotEmpty, IsOptional, IsEmail, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Profile / credential-management DTOs (P2 DTO validation).
 *
 * Credential setup and change are authentication operations, so they are held to
 * the same validated-DTO standard as the auth controller. `whitelist` +
 * `forbidNonWhitelisted` now reject unexpected body fields; password *strength*
 * (character classes) remains enforced in IdentityService via
 * `validatePasswordStrength`, with `@MinLength(8)` here as a fast first gate.
 */

/** PATCH /v1/me */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Aisha Ali' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ example: 'aisha@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: 'en', description: 'BCP-47 locale tag' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;
}

/** POST /v1/me/credentials/setup */
export class SetupCredentialsDto {
  @ApiProperty({ example: 'aisha@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ description: 'Min 8 chars; full strength policy enforced server-side' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

/** POST /v1/me/credentials/change-password */
export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ description: 'Min 8 chars; full strength policy enforced server-side' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
