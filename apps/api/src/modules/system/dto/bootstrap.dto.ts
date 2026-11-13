/**
 * Bootstrap endpoint DTOs (ADR-0004).
 *
 * Real class-validator classes so the global ValidationPipe (whitelist +
 * forbidNonWhitelisted + transform) enforces input at runtime. Unknown body
 * fields are stripped; the client cannot inject a role name or role ID.
 */

import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** POST /v1/system/bootstrap/super-admin request body. */
export class CreateSuperAdminDto {
  @ApiProperty({
    example: 'bs_live_...',
    description: 'Short-lived, single-use bootstrap authorization (out-of-band).',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  authorizationToken!: string;

  @ApiProperty({ example: 'Platform Admin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName!: string;

  @ApiProperty({ example: 'admin@example.com' })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Str0ng!P@ssw0rd' })
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  password!: string;
}

/** POST /v1/system/bootstrap/super-admin successful response body. */
export class CreateSuperAdminResponseDto {
  @ApiProperty({ example: 'initialized' })
  status!: 'initialized';

  @ApiProperty({ example: '/auth/login' })
  loginUrl!: string;
}

/** GET /v1/system/bootstrap/status response body. */
export class BootstrapStatusResponseDto {
  @ApiProperty({ example: false })
  initialized!: boolean;

  @ApiProperty({ example: true })
  bootstrapAvailable!: boolean;

  @ApiProperty({ example: true })
  setupRequired!: boolean;
}
