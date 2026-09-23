import Link from 'next/link';
import { PageHeader, colors, typeScale, radii } from '@scs/ui-kit';

export default function OnboardingSuccessPage() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Header Banner */}
      <PageHeader title="Store Submitted!" />
      <main style={{ padding: '24px 24px 48px', textAlign: 'center' }}>
      <p style={{ ...typeScale.bodyLg, color: colors.muted, lineHeight: 1.6, marginBottom: 32 }}>
        Your store has been submitted for verification. Our team will review your
        documents and get back to you within 1–2 business days.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Link
          href="/merchant"
          style={{
            padding: '10px 28px',
            borderRadius: radii.sm,
            background: colors.brand.DEFAULT,
            color: '#fff',
            textDecoration: 'none',
            ...typeScale.button,
          }}
        >
          Go to Merchant Dashboard
        </Link>
        <Link
          href="/account"
          style={{
            padding: '10px 28px',
            borderRadius: radii.sm,
            background: colors.surface,
            color: colors.brand.DEFAULT,
            textDecoration: 'none',
            ...typeScale.button,
            border: `1px solid ${colors.border}`,
          }}
        >
          My Account
        </Link>
      </div>
      </main>
    </div>
  );
}
