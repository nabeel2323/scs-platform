import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsUUID,
  MaxLength,
  Matches,
  ValidateNested,
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
