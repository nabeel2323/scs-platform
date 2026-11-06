import { describe, it, expect } from 'vitest';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import {
  LoginPasswordDto,
  VerifyOtpDto,
  SwitchOrgDto,
  RequestOtpDto,
  DeviceCheckDto,
  RefreshTokenDto,
  EmailOtpRequestDto,
  EmailOtpVerifyDto,
  LinkEmailDto,
  LinkPhoneDto,
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

describe('Email OTP DTO validation (S1.35 Phase 1)', () => {
  it('accepts a valid email OTP request body', async () => {
    const dto = await pipe.transform(
      { email: 'user@example.com' },
      body(EmailOtpRequestDto),
    );
    expect(dto).toBeInstanceOf(EmailOtpRequestDto);
    expect((dto as EmailOtpRequestDto).email).toBe('user@example.com');
  });

  it('rejects purpose field on email OTP request (removed in S1.38 F-10b)', async () => {
    await expect(
      pipe.transform(
        { email: 'user@example.com', purpose: 'login' },
        body(EmailOtpRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid email on email OTP request', async () => {
    await expect(
      pipe.transform({ email: 'not-an-email' }, body(EmailOtpRequestDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects extra fields on email OTP request', async () => {
    await expect(
      pipe.transform(
        { email: 'user@example.com', channel: 'mock' },
        body(EmailOtpRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid email OTP verify body', async () => {
    const dto = await pipe.transform(
      { email: 'user@example.com', otp: '123456', deviceId: 'dev-1' },
      body(EmailOtpVerifyDto),
    );
    expect(dto).toBeInstanceOf(EmailOtpVerifyDto);
    expect((dto as EmailOtpVerifyDto).otp).toBe('123456');
  });

  it('rejects non-6-digit OTP on email verify', async () => {
    await expect(
      pipe.transform(
        { email: 'user@example.com', otp: '12ab56' },
        body(EmailOtpVerifyDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing email on email OTP verify', async () => {
    await expect(
      pipe.transform({ otp: '123456' }, body(EmailOtpVerifyDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // S1.37-F-04: attaching an identifier requires proof of control, so `otp` is
  // part of the link-email contract — a body carrying only the address must not
  // validate, and the controller would reject it before reaching the service.
  it('accepts a valid link-email body', async () => {
    const dto = await pipe.transform(
      { email: 'user@example.com', otp: '123456' },
      body(LinkEmailDto),
    );
    expect((dto as LinkEmailDto).email).toBe('user@example.com');
    expect((dto as LinkEmailDto).otp).toBe('123456');
  });

  it('rejects a link-email body with no OTP proof of control', async () => {
    await expect(
      pipe.transform({ email: 'user@example.com' }, body(LinkEmailDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-6-digit OTP on link-email', async () => {
    await expect(
      pipe.transform(
        { email: 'user@example.com', otp: '12345' },
        body(LinkEmailDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid email on link-email', async () => {
    await expect(
      pipe.transform({ email: 'bad', otp: '123456' }, body(LinkEmailDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid link-phone body', async () => {
    const dto = await pipe.transform(
      { phone: '+966500000000', otp: '123456' },
      body(LinkPhoneDto),
    );
    expect((dto as LinkPhoneDto).phone).toBe('+966500000000');
    expect((dto as LinkPhoneDto).otp).toBe('123456');
  });

  it('rejects a link-phone body with no OTP proof of control (S1.37-F-05)', async () => {
    await expect(
      pipe.transform({ phone: '+966500000000' }, body(LinkPhoneDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-6-digit OTP on link-phone', async () => {
    await expect(
      pipe.transform({ phone: '+966500000000', otp: 'abcdef' }, body(LinkPhoneDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects empty phone on link-phone', async () => {
    await expect(
      pipe.transform({ phone: '', otp: '123456' }, body(LinkPhoneDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
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

/**
 * POST /v1/auth/login/device-check request contract (finding S-2).
 *
 * The endpoint is reachable without a session, so its body is the only input an
 * anonymous caller controls. These cases pin that the input is bounded and that
 * nothing in it can carry a trust claim: the response is a constant, and the
 * server decides trust from the credential cookie, not from a field.
 */
describe('Device-check DTO validation (S-2)', () => {
  it('accepts an email-only body: deviceId is optional', async () => {
    const dto = await pipe.transform({ email: 'a@b.com' }, body(DeviceCheckDto));
    expect(dto).toBeInstanceOf(DeviceCheckDto);
    expect((dto as DeviceCheckDto).deviceId).toBeUndefined();
  });

  it('still accepts a legacy deviceId so deployed clients do not start failing', async () => {
    // `forbidNonWhitelisted` would make removing the field a breaking change for
    // no security gain; the service ignores the value.
    const dto = await pipe.transform(
      { email: 'a@b.com', deviceId: 'desktop-chrome-uuid' },
      body(DeviceCheckDto),
    );
    expect((dto as DeviceCheckDto).deviceId).toBe('desktop-chrome-uuid');
  });

  it('rejects a malformed email', async () => {
    await expect(pipe.transform({ email: 'not-an-email' }, body(DeviceCheckDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a missing email', async () => {
    await expect(pipe.transform({}, body(DeviceCheckDto))).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['an email over 254 characters', { email: `${'a'.repeat(250)}@b.com` }],
    ['a deviceId over 128 characters', { email: 'a@b.com', deviceId: 'd'.repeat(129) }],
    ['a non-string deviceId', { email: 'a@b.com', deviceId: { nested: true } }],
  ])('rejects %s before the service sees it', (_label, value) => {
    // Bounded input is what lets the service skip its own length validation
    // before spending a lookup and a rate-limit slot on the value.
    return expect(pipe.transform(value, body(DeviceCheckDto))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a caller-supplied trust claim', async () => {
    // The pre-remediation client contract had `trusted`/`hasPassword` on the
    // RESPONSE. They must not be accepted as request fields: trust is issued by
    // the server, and an account-existence flag is what S-2 removed.
    for (const injected of [{ trusted: true }, { hasPassword: true }, { canAutoLogin: true }]) {
      await expect(
        pipe.transform({ email: 'a@b.com', ...injected }, body(DeviceCheckDto)),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
