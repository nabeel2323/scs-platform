import { describe, it, expect } from 'vitest';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import {
  LoginPasswordDto,
  VerifyOtpDto,
  SwitchOrgDto,
  RequestOtpDto,
  DeviceCheckDto,
  RefreshTokenDto,
} from '../../../modules/identity/dto/auth.dto';
import { SetupCredentialsDto, ChangePasswordDto } from '../../../modules/identity/dto/profile.dto';

/**
 * Auth DTO validation (API-B10 / P2 DTO validation).
 *
 * Drives the SAME global ValidationPipe config used in main.ts against the real
 * DTO classes, proving `whitelist` + `forbidNonWhitelisted` are now effective:
 * unknown body fields and malformed values are rejected with 400, which was
 * impossible when the endpoints used inline structural types (no runtime
 * metadata → validation silently skipped).
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const body = (metatype: unknown) => ({ type: 'body', metatype }) as any;

describe('Auth DTO validation (forbidNonWhitelisted effective)', () => {
  it('accepts a well-formed login/password body and transforms it', async () => {
    const dto = await pipe.transform(
      {
        email: 'a@b.com',
        password: 'secret123',
        deviceId: 'dev-1',
        deviceInfo: { platform: 'web', userAgent: 'UA' },
      },
      body(LoginPasswordDto),
    );
    expect(dto).toBeInstanceOf(LoginPasswordDto);
    expect((dto as LoginPasswordDto).email).toBe('a@b.com');
  });

  it('rejects unknown body fields on login/password', async () => {
    await expect(
      pipe.transform(
        { email: 'a@b.com', password: 'secret123', deviceId: 'dev-1', isAdmin: true },
        body(LoginPasswordDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid email on login/password', async () => {
    await expect(
      pipe.transform(
        { email: 'not-an-email', password: 'secret123', deviceId: 'dev-1' },
        body(LoginPasswordDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing required deviceId on login/password', async () => {
    await expect(
      pipe.transform({ email: 'a@b.com', password: 'secret123' }, body(LoginPasswordDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid OTP verify body', async () => {
    const dto = await pipe.transform(
      { phone: '+966500000000', otp: '123456', deviceId: 'dev-1' },
      body(VerifyOtpDto),
    );
    expect((dto as VerifyOtpDto).otp).toBe('123456');
  });

  it('rejects an OTP that is not exactly 6 digits', async () => {
    await expect(
      pipe.transform({ phone: '+966500000000', otp: '12ab56' }, body(VerifyOtpDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a UUID orgId on switch-org', async () => {
    const dto = await pipe.transform(
      { orgId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' },
      body(SwitchOrgDto),
    );
    expect((dto as SwitchOrgDto).orgId).toBe('3f2504e0-4f89-11d3-9a0c-0305e82c3301');
  });

  it('rejects a non-UUID orgId on switch-org', async () => {
    await expect(
      pipe.transform({ orgId: 'not-a-uuid' }, body(SwitchOrgDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an empty phone on otp/request', async () => {
    await expect(pipe.transform({ phone: '' }, body(RequestOtpDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects extra fields on device-check', async () => {
    await expect(
      pipe.transform({ email: 'a@b.com', deviceId: 'd', extra: 1 }, body(DeviceCheckDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires refreshToken on refresh/logout', async () => {
    await expect(pipe.transform({}, body(RefreshTokenDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('Credential DTO validation', () => {
  it('rejects a setup password shorter than 8 chars', async () => {
    await expect(
      pipe.transform({ email: 'a@b.com', password: 'short' }, body(SetupCredentialsDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid change-password body', async () => {
    const dto = await pipe.transform(
      { currentPassword: 'oldpass12', newPassword: 'newpass12' },
      body(ChangePasswordDto),
    );
    expect((dto as ChangePasswordDto).newPassword).toBe('newpass12');
  });

  it('rejects a change-password body missing currentPassword', async () => {
    await expect(
      pipe.transform({ newPassword: 'newpass12' }, body(ChangePasswordDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
