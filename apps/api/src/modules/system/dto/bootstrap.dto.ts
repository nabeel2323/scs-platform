/**
 * Bootstrap endpoint DTOs (ADR-0004).
 *
 * Real class-validator classes so the global ValidationPipe (whitelist +
 * forbidNonWhitelisted + transform) enforces input at runtime. Unknown body
 * fields are stripped; the client cannot inject a role name or role ID.
 *
 * Bootstrap authorizations are now issued internally after owner email
 * verification (POST /v1/system/bootstrap/owner-otp/verify) and consumed by
 * POST /v1/system/bootstrap/super-admin. The CLI (bootstrap-issue-token.ts)
 * remains as a break-glass/recovery mechanism and issues authorizations with
 * no owner-verification proof (emailVerifiedAt stays null).
 */

import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MaxLength,
  MinLength,
  Matches,
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

  /**
   * Whether initial setup requires the platform owner to verify email
   * ownership before a Super Admin can be created. True when the platform is
   * not initialized, an owner address is configured, and no usable
   * authorization is currently available.
   */
  @ApiProperty({ example: true })
  ownerVerificationRequired!: boolean;

  /**
   * Whether the bootstrap owner address (SCS_BOOTSTRAP_OWNER_EMAIL) is
   * configured. Never echoes the address itself.
   */
  @ApiProperty({ example: true })
  ownerEmailConfigured!: boolean;

  /**
   * Masked owner email hint (first char of local part + domain), safe to
   * render in the UI. Null when not configured.
   */
  @ApiProperty({ example: 'a****@example.com', nullable: true })
  ownerEmailHint!: string | null;
}

/** POST /v1/system/bootstrap/owner-otp/request request body. */
export class OwnerOtpRequestDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

/** POST /v1/system/bootstrap/owner-otp/request response body. */
export class OwnerOtpRequestResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 'delivered' })
  deliveryStatus!: string;

  @ApiProperty({ example: false, required: false, nullable: true })
  possiblyDelivered?: boolean | null;

  /** Masked owner email hint, safe to render. */
  @ApiProperty({ example: 'o****@example.com' })
  emailHint!: string;
}

/** POST /v1/system/bootstrap/owner-otp/verify request body. */
export class OwnerOtpVerifyDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit code.' })
  otp!: string;
}

/** POST /v1/system/bootstrap/owner-otp/verify response body. */
export class OwnerOtpVerifyResponseDto {
  /**
   * Short-lived, single-use bootstrap authorization. Returned only after
   * successful owner verification. Kept in frontend memory only — never
   * persisted to localStorage, sessionStorage, URLs, analytics, or logs.
   */
  @ApiProperty({
    example: 'bs_live_abcdef...',
    description: 'Single-use bootstrap authorization (frontend memory only).',
  })
  @IsString()
  @IsNotEmpty()
  authorization!: string;

  @ApiProperty({ example: 900 })
  expiresInSeconds!: number;
}
