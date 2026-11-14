'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBootstrapStatus,
  requestOwnerOtp,
  verifyOwnerOtp,
  createSuperAdmin,
  BootstrapError,
  type BootstrapStatus,
  type OwnerOtpRequestResult,
  type OwnerOtpVerifyResult,
} from '@/lib/bootstrap';
import {
  Button, TextInput,
  colors, typeScale, radii, brand,
} from '@scs/ui-kit';

type Step = 'welcome' | 'verify-ownership' | 'create-admin' | 'complete';

type FormErrors = {
  fullName?: string;
  email?: string;
  otp?: string;
  password?: string;
  confirmPassword?: string;
  _form?: string;
};

/** Human-readable mapping of bootstrap error statuses. */
function statusMessage(status: number, body?: Record<string, unknown>): string {
  const detail = body ? (body['detail'] ?? body['message']) : undefined;
  switch (status) {
    case 400:
      return typeof detail === 'string' ? detail : 'Invalid request. Please check your entries.';
    case 403:
      return 'The verification or authorization is invalid, expired, or already used. Please try again.';
    case 409:
      return 'This platform is already initialized, or an account with this email already exists.';
    case 429:
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'Unable to complete setup. Please try again.';
  }
}

function formatWait(seconds: number): string {
  if (!seconds || seconds <= 0) return 'a moment';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)} min`;
}

function passwordStrength(password: string): { valid: boolean; message: string; score: number } {
  let score = 0;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (password.length < 12) {
    return { valid: false, message: 'Password must be at least 12 characters.', score };
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) {
    return {
      valid: false,
      message: 'Password must contain at least three of: lowercase, uppercase, digit, symbol.',
      score,
    };
  }
  return { valid: true, message: 'Strong password.', score };
}

export default function BootstrapPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Step 1: readiness
  const [readinessChecked, setReadinessChecked] = useState(false);

  // Step 2: verify ownership
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpStage, setOtpStage] = useState<'request' | 'verify'>('request');
  const [deliveryNote, setDeliveryNote] = useState<'sent' | 'uncertain' | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [rateLimit, setRateLimit] = useState<{
    message: string;
    retryAfter: number;
  } | null>(null);
  const otpInFlight = useRef(false);

  // Step 3: create admin
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // The authorization grant lives in frontend memory only — never persisted.
  const [authorization, setAuthorization] = useState<string | null>(null);
  const [authorizationExpiresAt, setAuthorizationExpiresAt] = useState(0);

  const mountedRef = useRef(true);

  // ── initialization ───────────────────────────────────────────────

  const retry = useCallback(() => {
    setError(null);
    setPageLoading();
  }, []);

  const setPageLoading = useCallback(() => {
    setStep('welcome');
    setStatus(null);
    setError(null);
    void initialize();
  }, []);

  const initialize = useCallback(async () => {
    try {
      const st: BootstrapStatus = await fetchBootstrapStatus();
      if (!mountedRef.current) return;
      setStatus(st);
      if (st.initialized) {
        // Platform already initialized — go to normal login.
        void router.push('/auth/login');
        return;
      }
      setReadinessChecked(true);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(
        err instanceof BootstrapError
          ? err.message || 'Unable to reach the platform.'
          : 'Unable to reach the platform. Please check your connection and try again.',
      );
    }
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    void initialize();
    return () => {
      mountedRef.current = false;
    };
  }, [initialize]);

  // If the platform became initialized while on this page, go to login.
  useEffect(() => {
    if (status?.initialized) {
      void router.push('/auth/login');
    }
  }, [status?.initialized, router]);

  // Authorization expiry countdown (grant lives in memory only).
  useEffect(() => {
    if (!authorization || authorizationExpiresAt <= Date.now()) return;
    const t = setInterval(() => {
      const remaining = authorizationExpiresAt - Date.now();
      if (remaining <= 0) {
        setAuthorization(null);
        setAuthorizationExpiresAt(0);
        clearInterval(t);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [authorization, authorizationExpiresAt]);

  // Resend cooldown countdown.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Success redirect to normal login (never bypasses auth).
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => {
      void router.push('/auth/login');
    }, 1200);
    return () => clearTimeout(t);
  }, [success, router]);

  // ── field-level blur validation ────────────────────────────────

  const validateField = useCallback(
    (name: keyof FormErrors, value: string): string | undefined => {
      switch (name) {
        case 'fullName':
          return value.trim() ? undefined : 'Full name is required.';
        case 'email': {
          const trimmed = value.trim();
          if (!trimmed) return 'Email address is required.';
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRe.test(trimmed)) return 'Enter a valid email address.';
          return undefined;
        }
        case 'otp':
          return /^\d{6}$/.test(value) ? undefined : 'Enter the 6-digit code.';
        case 'password': {
          if (!value) return 'Password is required.';
          const { valid, message } = passwordStrength(value);
          return valid ? undefined : message;
        }
        case 'confirmPassword': {
          if (!confirmPassword) return 'Please confirm your password.';
          if (confirmPassword !== password) return 'Passwords do not match.';
          return undefined;
        }
        default:
          return undefined;
      }
    },
    [password, confirmPassword],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      const target = e.currentTarget as HTMLInputElement;
      const name = target.name as keyof FormErrors;
      if (!name) return;
      const message = validateField(name, target.value);
      setFormError(prev => ({ ...prev, [name]: message }));
    },
    [validateField],
  );

  // ── Step 1: welcome / readiness ────────────────────────────────

  const handleContinue = useCallback(() => {
    setError('');
    setFormError({});
    if (!status) return;
    if (!status.ownerEmailConfigured) {
      // Blocked: deployment is missing the owner configuration.
      setError('This deployment is not configured for initial setup. The platform owner address (SCS_BOOTSTRAP_OWNER_EMAIL) is not set. Contact your platform operations team.');
      return;
    }
    setStep('verify-ownership');
    // Pre-fill nothing: the operator knows the owner address from the hint.
    setEmail('');
    setOtpStage('request');
  }, [status]);

  // ── Step 2: verify ownership ───────────────────────────────────

  /** Records a 429 and shows the lockout. */
  function noteRateLimit(message: string, retryAfter: number) {
    setRateLimit({ message, retryAfter });
    setResendCooldown(retryAfter > 0 ? retryAfter : 0);
  }

  async function handleRequestOwnerOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpInFlight.current || resendCooldown > 0) return;
    otpInFlight.current = true;
    setError('');
    setRateLimit(null);
    setDeliveryNote(null);
    setSubmitting(true);
    const emailValue = email.trim().toLowerCase();
    try {
      const result: OwnerOtpRequestResult = await requestOwnerOtp(emailValue);
      if (result.success) {
        setDeliveryNote('sent');
        setOtpStage('verify');
        setOtp('');
        // Client-side resend cooldown so a double-click doesn't burn rate budget.
        setResendCooldown(30);
      } else {
        setDeliveryNote(result.deliveryStatus === 'DELIVERY_TIMEOUT' ? 'uncertain' : null);
        setError(
          result.deliveryStatus === 'DELIVERY_TIMEOUT'
            ? "We couldn't confirm that a code reached the owner address. It may still arrive — you can enter it if it does."
            : 'The code could not be sent. Check the owner address and try again.',
        );
      }
    } catch (err: any) {
      if (err instanceof BootstrapError) {
        if (err.status === 429) {
          const body = err.body ?? {};
          const retryAfter = Number(body['retryAfterSeconds'] ?? 0);
          noteRateLimit(err.message || 'Too many OTP requests.', retryAfter || 60);
        } else {
          setError(err.message || 'Unable to send the verification code.');
        }
      } else {
        setError(err.message || 'Unable to send the verification code.');
      }
    } finally {
      otpInFlight.current = false;
      setSubmitting(false);
    }
  }

  async function handleVerifyOwnerOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otpInFlight.current) return;
    otpInFlight.current = true;
    setError('');
    setRateLimit(null);
    setSubmitting(true);
    const emailValue = email.trim().toLowerCase();
    try {
      const result: OwnerOtpVerifyResult = await verifyOwnerOtp(emailValue, otp.trim());
      // The grant is held in frontend memory only — never persisted.
      setAuthorization(result.authorization);
      setAuthorizationExpiresAt(Date.now() + result.expiresInSeconds * 1000);
      setOtpStage('verify');
      setDeliveryNote(null);
      setError('');
      setStep('create-admin');
      // Pre-fill the verified email (owner address) — not freely editable.
      setEmail(emailValue);
    } catch (err: any) {
      if (err instanceof BootstrapError) {
        if (err.status === 429) {
          const body = err.body ?? {};
          const retryAfter = Number(body['retryAfterSeconds'] ?? 0);
          noteRateLimit(err.message || 'Too many verification attempts.', retryAfter || 60);
        } else if (err.status === 403) {
          setError('Invalid, expired, or already-used code. Please request a new one.');
          setOtpStage('request');
          setDeliveryNote(null);
          setOtp('');
        } else {
          setError(err.message || 'Verification failed.');
        }
      } else {
        setError(err.message || 'Verification failed.');
      }
    } finally {
      otpInFlight.current = false;
      setSubmitting(false);
    }
  }

  // ── Step 3: create administrator ───────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError({});
      setError('');

      const errors: FormErrors = {};
      const fullNameValue = fullName.trim();
      const emailValue = email.trim().toLowerCase();

      if (!fullNameValue) errors.fullName = 'Full name is required.';
      if (!emailValue) errors.email = 'Email address is required.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) errors.email = 'Enter a valid email address.';

      if (!authorization) {
        errors._form = 'Ownership verification is required before creating the administrator.';
      }

      const pwCheck = passwordStrength(password);
      if (!password) errors.password = 'Password is required.';
      else if (!pwCheck.valid) errors.password = pwCheck.message;

      if (!confirmPassword) errors.confirmPassword = 'Please confirm your password.';
      else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';

      if (Object.keys(errors).length) {
        setFormError(errors);
        return;
      }

      setSubmitting(true);
      try {
        await createSuperAdmin({
          authorizationToken: authorization!,
          fullName: fullNameValue,
          email: emailValue,
          password,
        });
        setSuccess(true);
        setStep('complete');
      } catch (err: any) {
        if (err instanceof BootstrapError) {
          setFormError(prev => ({
            ...prev,
            _form: statusMessage(err.status, err.body),
            email: err.status === 409
              ? 'An account with this email already exists, or the platform is already initialized.'
              : prev.email,
          }));
        } else {
          setFormError(prev => ({ ...prev, _form: err.message || 'Unable to complete setup. Please try again.' }));
        }
      } finally {
        if (mountedRef.current) setSubmitting(false);
      }
    },
    [fullName, email, password, confirmPassword, authorization],
  );

  // ── rendering helpers ──────────────────────────────────────────

  const maskedHint = status?.ownerEmailHint ?? null;
  const ownerConfigured = status?.ownerEmailConfigured ?? false;

  if (step === 'welcome') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bgSubtle, padding: '0 24px' }}>
        <div style={{ maxWidth: 520, width: '100%', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 48, height: 48, borderRadius: radii.lg,
              background: 'rgba(16, 185, 129, 0.1)', color: '#10b981',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 style={{ ...typeScale.h3, color: colors.ink, margin: '0 0 10px' }}>
              Initialize this platform
            </h1>
            <p style={{ ...typeScale.body, color: colors.muted, margin: 0 }}>
              Create the platform's first Super Admin through a guided setup.
              No operator token or database access is required.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: colors.errBg, color: colors.err,
                padding: '10px 14px', borderRadius: radii.sm, marginBottom: 18,
                ...typeScale.body, border: `1px solid ${colors.err}33`,
              }}
            >
              {error}
            </div>
          )}

          {!ownerConfigured && (
            <div
              style={{
                background: colors.warnBg, color: colors.warn,
                padding: '10px 14px', borderRadius: radii.sm, marginBottom: 18,
                ...typeScale.body, border: `1px solid ${colors.warn}33`,
              }}
            >
              <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
                Deployment configuration is missing
              </p>
              <p style={{ ...typeScale.bodySm, margin: 0 }}>
                The platform owner address ({'SCS_BOOTSTRAP_OWNER_EMAIL'}) is not configured on this deployment.
                Initial setup cannot proceed until it is set and the deployment is restarted. Contact your platform
                operations team.
              </p>
            </div>
          )}

          {readinessChecked && ownerConfigured && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
              <Button
                variant="primary"
                onClick={handleContinue}
                disabled={submitting}
                size="lg"
              >
                {submitting ? 'Checking…' : 'Continue to ownership verification'}
              </Button>
            </div>
          )}

          {!readinessChecked && !error && (
            <div style={{ textAlign: 'center', color: colors.muted, ...typeScale.bodySm }}>
              Checking platform readiness…
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── Step 2: verify ownership ───────────────────────────────────

  if (step === 'verify-ownership') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bgSubtle, padding: '0 24px' }}>
        <div style={{ maxWidth: 520, width: '100%', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 48, height: 48, borderRadius: radii.lg,
              background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1l3 6h-6l3 6" />
                <polyline points="3 7 12 12 21 7" />
              </svg>
            </div>
            <h1 style={{ ...typeScale.h3, color: colors.ink, margin: '0 0 10px' }}>
              Verify platform ownership
            </h1>
            <p style={{ ...typeScale.body, color: colors.muted, margin: 0 }}>
              A verification code is sent to the configured platform owner address. Enter it here to prove
              ownership before creating the administrator.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: colors.errBg, color: colors.err,
                padding: '10px 14px', borderRadius: radii.sm, marginBottom: 16,
                ...typeScale.body, border: `1px solid ${colors.err}33`,
              }}
            >
              {error}
            </div>
          )}

          {rateLimit && (
            <div
              style={{
                background: colors.warnBg, color: colors.warn,
                padding: '10px 14px', borderRadius: radii.sm, marginBottom: 16,
                ...typeScale.body, border: `1px solid ${colors.warn}33`,
              }}
            >
              <strong>{rateLimit.message}</strong>
              <div style={{ marginTop: 4, ...typeScale.bodySm }}>
                {rateLimit.retryAfter > 0
                  ? `Try again in ${formatWait(rateLimit.retryAfter)}.`
                  : 'Try again later.'}
              </div>
            </div>
          )}

          {maskedHint && (
            <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginBottom: 16 }}>
              Code is sent to: <strong>{maskedHint}</strong>
            </p>
          )}

          {otpStage === 'request' ? (
            <form onSubmit={handleRequestOwnerOtp} noValidate>
              <TextInput
                label="Owner email address"
                id="bootstrap-owner-email"
                name="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={handleBlur}
                error={formError.email}
                required
                autoComplete="email"
                placeholder="owner@example.com"
                style={{ marginBottom: 16 }}
              />
              <p style={{ ...typeScale.bodySm, color: colors.muted, marginBottom: 16 }}>
                The code is sent only to the configured platform owner address shown above.
              </p>
              <Button
                type="submit"
                disabled={submitting || otpInFlight.current || resendCooldown > 0}
                size="lg"
                style={{ width: '100%', marginBottom: 8 }}
              >
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : submitting
                    ? 'Sending…'
                    : 'Send verification code'}
              </Button>
              {deliveryNote === 'uncertain' && (
                <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                  Already have a code?{' '}
                  <button
                    type="button"
                    onClick={() => { setOtpStage('verify'); setError(''); }}
                    style={{ background: 'none', border: 'none', color: brand[700], cursor: 'pointer', fontWeight: 600 }}
                  >
                    Enter it
                  </button>
                </p>
              )}
              <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => { setStep('welcome'); setError(''); }}
                  style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer' }}
                >
                  Back to welcome
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerifyOwnerOtp} noValidate>
              <p style={{ color: colors.muted, ...typeScale.body, marginBottom: 16 }}>
                {deliveryNote === 'uncertain'
                  ? `If a code arrived for ${maskedHint}, enter it below.`
                  : `A code is on its way to ${maskedHint}. Enter it below.`}
              </p>
              <TextInput
                label="Verification code"
                id="bootstrap-otp"
                name="otp"
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onBlur={handleBlur}
                error={formError.otp}
                required
                maxLength={6}
                inputMode="numeric"
                placeholder="123456"
                style={{ marginBottom: 16 }}
              />
              <Button type="submit" disabled={submitting || otpInFlight.current} size="lg" style={{ width: '100%', marginBottom: 8 }}>
                {submitting ? 'Verifying…' : 'Verify code'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => { setOtpStage('request'); setError(''); setDeliveryNote(null); }}
                style={{ width: '100%' }}
              >
                Request a new code
              </Button>
            </form>
          )}
        </div>
      </main>
    );
  }

  // ── Step 3: create administrator ───────────────────────────────

  if (step === 'create-admin') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${brand[900]} 0%, ${brand[500]} 50%, ${brand[900]} 100%)`, padding: '0 24px' }}>
        <div style={{ width: '100%', maxWidth: 440, padding: '0 16px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 56, height: 56, borderRadius: radii.lg,
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)',
              marginBottom: 16, backdropFilter: 'blur(8px)',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h1 style={{ ...typeScale.display, color: '#fff', margin: '16px 0 6px' }}>
              Create administrator
            </h1>
            <p style={{ ...typeScale.body, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              Ownership verified. Set up the platform&rsquo;s first Super Admin account.
            </p>
          </div>

          <div style={{ background: colors.surface, borderRadius: radii.lg + 2, padding: '32px 28px', boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}>
            {formError._form && (
              <div
                role="alert"
                style={{
                  background: colors.errBg, color: colors.err,
                  padding: '10px 14px', borderRadius: radii.sm, marginBottom: 18,
                  ...typeScale.body, border: `1px solid ${colors.err}33`,
                }}
              >
                {formError._form}
              </div>
            )}

            {formError.email && (
              <div
                role="alert"
                style={{
                  background: colors.errBg, color: colors.err,
                  padding: '8px 12px', borderRadius: radii.sm, marginBottom: 14,
                  ...typeScale.bodySm, border: `1px solid ${colors.err}33`,
                }}
              >
                {formError.email}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <TextInput
                label="Full name"
                id="bootstrap-full-name"
                name="fullName"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                onBlur={handleBlur}
                error={formError.fullName}
                required
                autoComplete="name"
                style={{ marginBottom: 16 }}
              />

              <TextInput
                label="Email address (verified)"
                id="bootstrap-email"
                name="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={handleBlur}
                error={formError.email}
                required
                autoComplete="email"
                readOnly
                style={{ marginBottom: 16 }}
              />
              <p style={{ ...typeScale.caption, color: colors.muted, marginBottom: 16 }}>
                This is the verified platform owner address and cannot be changed during setup.
              </p>

              <div style={{ position: 'relative', marginBottom: 16 }}>
                <TextInput
                  label="Password"
                  id="bootstrap-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onBlur={handleBlur}
                  error={formError.password}
                  required
                  autoComplete="new-password"
                  style={{ marginBottom: 16 }}
                />
                <p style={{ ...typeScale.caption, color: colors.muted, margin: '0 0 8px 0' }}>
                  At least 12 characters, with lowercase, uppercase, digit and symbol.
                </p>
                <div style={{ ...typeScale.caption, marginTop: 4 }}>
                  {password && (
                    <span
                      style={{
                        color: passwordStrength(password).valid ? '#10b981' : colors.err,
                        fontWeight: 600,
                      }}
                    >
                      {passwordStrength(password).message}
                    </span>
                  )}
                </div>
                {formError.password && (
                  <span style={{ ...typeScale.caption, color: colors.err, display: 'block', marginBottom: 4 }}>
                    {formError.password}
                  </span>
                )}
              </div>

              <div style={{ position: 'relative', marginBottom: 20 }}>
                <TextInput
                  label="Confirm password"
                  id="bootstrap-confirm-password"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  onBlur={handleBlur}
                  error={formError.confirmPassword}
                  required
                  autoComplete="new-password"
                  style={{ marginBottom: 0 }}
                />
                {formError.confirmPassword && (
                  <span style={{ ...typeScale.caption, color: colors.err, display: 'block', marginTop: 4 }}>
                    {formError.confirmPassword}
                  </span>
                )}
              </div>

              <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', marginBottom: 16 }}>
                The authorization grant exists in memory only and is consumed once during setup.
              </p>

              <Button
                type="submit"
                disabled={submitting || !authorization}
                size="lg"
                style={{ width: '100%', marginBottom: 10 }}
              >
                {submitting ? 'Creating administrator…' : 'Create Super Admin'}
              </Button>

              <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', margin: 0 }}>
                After setup, sign in using your email and password.
              </p>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // ── Step 4: complete ───────────────────────────────────────────

  if (step === 'complete') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bgSubtle, padding: '0 24px' }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center', padding: '40px 32px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: radii.lg,
            background: 'rgba(16, 185, 129, 0.1)', color: '#10b981',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ ...typeScale.h3, color: colors.ink, margin: '0 0 10px' }}>
            Platform initialized
          </h1>
          <p style={{ ...typeScale.body, color: colors.muted, margin: 0 }}>
            The initial Super Admin has been created. Redirecting to login…
          </p>
        </div>
      </main>
    );
  }

  return null;
}
