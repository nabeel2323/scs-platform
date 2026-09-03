import Link from 'next/link';

export default function AdminHomePage() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f3340', marginBottom: 8 }}>
        SCS Admin Console
      </h1>
      <p style={{ color: '#5b6b74', fontSize: 18, marginBottom: 32 }}>
        Platform operations &amp; merchant management
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <Link href="/auth/login" style={cardStyle}>
          <b>Sign In</b>
          <span>Admin authentication</span>
        </Link>
        <Link href="/merchants" style={cardStyle}>
          <b>Merchants</b>
          <span>Verification &amp; onboarding</span>
        </Link>
        <Link href="/orders" style={cardStyle}>
          <b>Orders</b>
          <span>Disputes &amp; escalations</span>
        </Link>
        <Link href="/analytics" style={cardStyle}>
          <b>Analytics</b>
          <span>Platform metrics &amp; reports</span>
        </Link>
        <Link href="/audit-log" style={cardStyle}>
          <b>Audit Log</b>
          <span>System-wide activity trail</span>
        </Link>
        <Link href="/feature-flags" style={cardStyle}>
          <b>Feature Flags</b>
          <span>Toggle platform capabilities</span>
        </Link>
      </div>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'block',
  padding: '20px 24px',
  background: '#fff',
  border: '1px solid #d9e2e6',
  borderRadius: 10,
  textDecoration: 'none',
  boxShadow: '0 1px 2px rgba(22,35,43,.06),0 4px 14px rgba(22,35,43,.05)',
};
