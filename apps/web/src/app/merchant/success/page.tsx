import Link from 'next/link';

export default function OnboardingSuccessPage() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ background: 'linear-gradient(135deg, #0c2831 0%, #1e6178 100%)', padding: '36px 24px 28px', color: '#fff', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: 28, border: '2px solid rgba(255,255,255,0.3)',
        }}>
          ✓
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Store Submitted!</h1>
      </div>
      <main style={{ padding: '24px 24px 48px', textAlign: 'center' }}>
      <p style={{ color: '#5b6b74', fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
        Your store has been submitted for verification. Our team will review your
        documents and get back to you within 1–2 business days.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Link
          href="/merchant"
          style={{
            padding: '10px 28px',
            borderRadius: 6,
            background: '#174a5b',
            color: '#fff',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Go to Merchant Dashboard
        </Link>
        <Link
          href="/account"
          style={{
            padding: '10px 28px',
            borderRadius: 6,
            background: '#fff',
            color: '#174a5b',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
            border: '1px solid #d9e2e6',
          }}
        >
          My Account
        </Link>
      </div>
      </main>
    </div>
  );
}
