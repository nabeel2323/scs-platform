import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsUUID,
  MaxLength,
  Matches,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Auth endpoint DTOs (API-B10 / P2 DTO validation).
 *
 * These are real classes carrying `class-validator` decorators so the global
 * `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` + `transform`) has
 * runtime metadata to act on. The previous inline structural types emitted only
 * `Object` as `design:paramtypes`, so validation was silently inert and unknown
 * body fields were accepted. Each field is also documented for the OpenAPI spec
 * (consumed later by the `@scs/contracts` generator).
 */

/** Platform / user-agent metadata captured at login for device trust + audit. */
export class DeviceInfoDto {
  @ApiProperty({ example: 'web', description: 'Client platform: web | ios | android' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  platform!: string;

  @ApiProperty({ example: 'Mozilla/5.0 ...' })
  @IsString()
  @MaxLength(1024)
  userAgent!: string;
}

/** POST /v1/auth/otp/request */
export class RequestOtpDto {
  @ApiProperty({ example: '+9665XXXXXXXX' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional({
    enum: ['sms', 'whatsapp'],
    default: 'sms',
    description: 'Delivery channel for the OTP code',
  })
  @IsOptional()
  @IsString()
  @IsIn(['sms', 'whatsapp', 'email'])
  channel?: 'sms' | 'whatsapp' | 'email';
}

/** POST /v1/auth/otp/verify */
export class VerifyOtpDto {
  @ApiProperty({ example: '+9665XXXXXXXX' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
  otp!: string;

  @ApiPropertyOptional({ description: 'Stable per-device id establishing device trust' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional({ type: DeviceInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}

/** POST /v1/auth/refresh and POST /v1/auth/logout (both take the refresh token). */
export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

/** POST /v1/auth/switch-org */
export class SwitchOrgDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orgId!: string;
}

/** POST /v1/auth/login/password */
export class LoginPasswordDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;

  @ApiProperty({ description: 'Required: drives device-trust evaluation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @ApiPropertyOptional({ type: DeviceInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}

/** POST /v1/auth/login/device-check */
export class DeviceCheckDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;
}

// ── Email OTP DTOs (S1.35 Phase 1) ───────────────────────────

/** POST /v1/auth/otp/email/request */
export class EmailOtpRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

/** POST /v1/auth/otp/email/verify */
export class EmailOtpVerifyDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
  otp!: string;

  @ApiPropertyOptional({ description: 'Stable per-device id establishing device trust' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional({ type: DeviceInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}

// ── Account Linking DTOs (S1.35 Phase 1) ─────────────────────

/** POST /v1/auth/account/link-email */
export class LinkEmailDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: '123456',
    description:
      'A live, unconsumed email OTP for this exact address, obtained from /v1/auth/otp/email/request. ' +
      'Required: an identifier may never be attached without proof of mailbox control. Any valid ' +
      'challenge for the address qualifies regardless of the original request intent, because ' +
      'the challenge key is the normalized address.',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
  otp!: string;
}

/** POST /v1/auth/account/link-phone */
export class LinkPhoneDto {
  @ApiProperty({ example: '+9665XXXXXXXX' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @ApiProperty({
    example: '123456',
    description:
      'A live, unconsumed phone OTP for this exact number, obtained from /v1/auth/otp/request. ' +
      'Required: an identifier may never be attached without proof of control (S1.37-F-05). The ' +
      'challenge is keyed on the normalized number, so a code requested for login also proves ' +
      'control for linking, and consuming it here invalidates it for login.',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
  otp!: string;
}
