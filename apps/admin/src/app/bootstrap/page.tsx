'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBootstrapStatus,
  createSuperAdmin,
  BootstrapError,
  type BootstrapStatus,
} from '@/lib/bootstrap';
import {
  Button, TextInput,
  colors, typeScale, radii, brand,
} from '@scs/ui-kit';

type PageStatus =
  | 'loading'
  | 'initialized'
  | 'setup'
  | 'operator-required'
  | 'error'
  | 'success';

type FormErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  authorizationToken?: string;
  _form?: string;
};

/** Human-readable mapping of bootstrap error statuses. */
function statusMessage(status: number, body?: Record<string, unknown>): string {
  const detail = body ? (body['detail'] ?? body['message']) : undefined;
  switch (status) {
    case 400:
      return typeof detail === 'string' ? detail : 'Invalid setup request. Please check your entries.';
    case 403:
      return 'The bootstrap authorization is invalid, expired, or already used. Please obtain a new one from your deployment operator.';
    case 409:
      return 'This platform is already initialized, or an account with this email already exists.';
    case 429:
      return 'Too many setup attempts. Please wait a moment and try again.';
    default:
      return 'Unable to complete setup. Please try again.';
  }
}

function passwordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < 12) {
    return { valid: false, message: 'Password must be at least 12 characters.' };
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) {
    return {
      valid: false,
      message: 'Password must contain at least three of: lowercase, uppercase, digit, symbol.',
    };
  }
  return { valid: true, message: 'Strong password.' };
}

export default function BootstrapPage() {
  const router = useRouter();
  const [page, setPage] = useState<PageStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authorizationToken, setAuthorizationToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const mountedRef = useRef(true);

  const retry = useCallback(() => {
    setError(null);
    setPage('loading');
    void initialize();
  }, []);

  const initialize = useCallback(async () => {
    try {
      const status: BootstrapStatus = await fetchBootstrapStatus();
      if (!mountedRef.current) return;
      if (status.initialized) {
        // Platform already initialized — go to normal login.
        setPage('initialized');
        void router.push('/auth/login');
        return;
      }
      if (status.setupRequired && status.bootstrapAvailable) {
        setPage('setup');
      } else {
        setPage('operator-required');
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setPage('error');
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
    if (page === 'initialized') {
      void router.push('/auth/login');
    }
  }, [page, router]);

  // ── success redirect ─────────────────────────────────────────────

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => {
      void router.push('/auth/login');
    }, 1200);
    return () => clearTimeout(t);
  }, [success, router]);

  // ── field-level blur validation ──────────────────────────────────

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
        case 'authorizationToken':
          return value.trim() ? undefined : 'Enter the bootstrap authorization.';
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

  // ── submit ───────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError({});

      const errors: FormErrors = {};
      const fullNameValue = fullName.trim();
      const emailValue = email.trim().toLowerCase();

      if (!fullNameValue) errors.fullName = 'Full name is required.';
      if (!emailValue) errors.email = 'Email address is required.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) errors.email = 'Enter a valid email address.';

      const pwCheck = passwordStrength(password);
      if (!password) errors.password = 'Password is required.';
      else if (!pwCheck.valid) errors.password = pwCheck.message;

      if (!confirmPassword) errors.confirmPassword = 'Please confirm your password.';
      else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';

      if (!authorizationToken.trim()) errors.authorizationToken = 'Enter the bootstrap authorization.';

      if (Object.keys(errors).length) {
        setFormError(errors);
        return;
      }

      setSubmitting(true);
      try {
        await createSuperAdmin({
          authorizationToken: authorizationToken.trim(),
          fullName: fullNameValue,
          email: emailValue,
          password,
        });
        setSuccess(true);
        setPage('success');
      } catch (err: any) {
        if (err instanceof BootstrapError) {
          setFormError(prev => ({
            ...prev,
            _form: statusMessage(err.status, err.body),
            authorizationToken: err.status === 403
              ? 'Invalid, expired, or already-used bootstrap authorization.'
              : prev.authorizationToken,
            email: err.status === 409
              ? 'An account with this email already exists, or the platform is already initialized.'
              : prev.email,
          }));
        } else {
          setFormError(prev => ({
            ...prev,
            _form: err.message || 'Unable to complete setup. Please try again.',
          }));
        }
      } finally {
        if (mountedRef.current) setSubmitting(false);
      }
    },
    [fullName, email, password, confirmPassword, authorizationToken],
  );

  // ── loading ──────────────────────────────────────────────────────

  if (page === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: colors.bgSubtle, color: colors.muted, ...typeScale.body }}>
        Preparing administrator setup…
      </div>
    );
  }

  // ── already initialized → login ──────────────────────────────────

  if (page === 'initialized') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: colors.bgSubtle, color: colors.muted, ...typeScale.body }}>
        Platform already initialized. Opening login…
      </div>
    );
  }

  // ── operator required ────────────────────────────────────────────

  if (page === 'operator-required') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bgSubtle, padding: '0 24px' }}>
        <div style={{ maxWidth: 520, width: '100%', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 48, height: 48, borderRadius: radii.lg,
              background: colors.warnBg, color: colors.warn,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <h1 style={{ ...typeScale.h3, color: colors.ink, margin: '0 0 10px' }}>
              Initial administrator setup
            </h1>
            <p style={{ ...typeScale.body, color: colors.muted, margin: 0 }}>
              This platform has not been initialized yet.
            </p>
          </div>
          <p style={{ ...typeScale.body, color: colors.ink, marginBottom: 22 }}>
            An authorized deployment operator must provision the bootstrap
            authorization before an administrator can be created. Please contact
            your platform operations team to generate the one-time setup
            authorization, then return here to complete setup.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button variant="secondary" onClick={retry} disabled={submitting} size="lg">
              {submitting ? 'Checking…' : 'Check again'}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // ── API unreachable ──────────────────────────────────────────────

  if (page === 'error') {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.bgSubtle, padding: '0 24px' }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center', padding: '40px 32px', background: colors.surface, borderRadius: radii.lg + 2, border: `1px solid ${colors.border}`, boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 48, height: 48, borderRadius: radii.lg,
              background: colors.errBg, color: colors.err,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
                <line x1="12" y1="12" x2="12.01" y2="12" />
              </svg>
            </div>
            <h1 style={{ ...typeScale.h3, color: colors.ink, margin: '0 0 10px' }}>
              Unable to reach the platform
            </h1>
            <p style={{ ...typeScale.body, color: colors.muted, margin: 0 }}>
              {error}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button variant="secondary" onClick={retry} disabled={submitting} size="lg">
              {submitting ? 'Checking…' : 'Try again'}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // ── success ──────────────────────────────────────────────────────

  if (page === 'success') {
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

  // ── setup form ───────────────────────────────────────────────────

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
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                background: 'rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.8)',
                borderRadius: radii.sm,
                ...typeScale.caption,
                fontWeight: 700,
                letterSpacing: '0.5px',
              }}
            >
              ADMIN CONSOLE
            </span>
          </div>
          <h1 style={{ ...typeScale.display, color: '#fff', margin: '16px 0 6px' }}>
            First-Time Administrator Setup
          </h1>
          <p style={{ ...typeScale.body, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Create the platform&rsquo;s initial Super Admin account.
          </p>
        </div>

        <div style={{ background: colors.surface, borderRadius: radii.lg + 2, padding: '32px 28px', boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}>
          {formError._form && (
            <div
              role="alert"
              style={{
                background: colors.errBg,
                color: colors.err,
                padding: '10px 14px',
                borderRadius: radii.sm,
                marginBottom: 18,
                ...typeScale.body,
                border: `1px solid ${colors.err}33`,
              }}
            >
              {formError._form}
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
              label="Email address"
              id="bootstrap-email"
              name="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onBlur={handleBlur}
              error={formError.email}
              required
              autoComplete="email"
              style={{ marginBottom: 16 }}
            />

            <div style={{ position: 'relative', marginBottom: 16 }}>
              <TextInput
                label="Password"
                id="bootstrap-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onBlur={handleBlur}
                error={formError.password}
                required
                autoComplete="new-password"
                style={{ marginBottom: 16 }}
                prefix={
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute', right: 10, background: 'none', border: 'none',
                      cursor: 'pointer', padding: 4, color: colors.muted,
                    }}
                  >
                    {showPassword ? '&#128275;' : '&#128065;'}
                  </button>
                }
              />
              <p style={{ ...typeScale.caption, color: colors.muted, margin: '0 0 8px 0' }}>
                At least 12 characters, with lowercase, uppercase, digit and symbol.
              </p>
              {formError.password && (
                <span style={{ ...typeScale.caption, color: colors.err, display: 'block', marginBottom: 4 }}>
                  {formError.password}
                </span>
              )}
            </div>

            <div style={{ position: 'relative', marginBottom: 16 }}>
              <TextInput
                label="Confirm password"
                id="bootstrap-confirm-password"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onBlur={handleBlur}
                error={formError.confirmPassword}
                required
                autoComplete="new-password"
                style={{ marginBottom: 0 }}
                prefix={
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute', right: 10, background: 'none', border: 'none',
                      cursor: 'pointer', padding: 4, color: colors.muted,
                    }}
                  >
                    {showConfirmPassword ? '&#128275;' : '&#128065;'}
                  </button>
                }
              />
              {formError.confirmPassword && (
                <span style={{ ...typeScale.caption, color: colors.err, display: 'block', marginTop: 4 }}>
                  {formError.confirmPassword}
                </span>
              )}
            </div>

            <TextInput
              label="Bootstrap authorization"
              id="bootstrap-authorization-token"
              name="authorizationToken"
              value={authorizationToken}
              onChange={e => setAuthorizationToken(e.target.value)}
              onBlur={handleBlur}
              error={formError.authorizationToken}
              required
              helpText="One-time setup authorization provided by your deployment operator."
              autoComplete="off"
              style={{ marginBottom: 20 }}
            />

            <Button
              type="submit"
              disabled={submitting}
              size="lg"
              style={{ width: '100%', marginBottom: 10 }}
            >
              {submitting ? 'Creating administrator…' : 'Create Super Admin'}
            </Button>

            <p style={{ ...typeScale.bodySm, color: colors.muted, textAlign: 'center', margin: 0 }}>
              This creates the platform&rsquo;s first Super Admin. After setup, sign in
              using your email and password.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
