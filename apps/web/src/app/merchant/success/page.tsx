import Link from 'next/link';

export default function OnboardingSuccessPage() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: '#e8f5e9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 20px',
        fontSize: 28,
      }}>
        ✓
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f3340', marginBottom: 8 }}>
        Store Submitted!
      </h1>
      <p style={{ color: '#5b6b74', fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
        Your store has been submitted for verification. Our team will review your
        documents and get back to you within 1–2 business days.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Link
          href="/"
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
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
