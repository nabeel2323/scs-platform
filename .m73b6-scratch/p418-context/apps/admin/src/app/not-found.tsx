import Link from 'next/link';
import { colors, typeScale } from '@scs/ui-kit';

export default function AdminNotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '80vh', textAlign: 'center', padding: 48,
    }}>
      <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.4 }}>404</div>
      <h1 style={{ ...typeScale.display, color: colors.brand[700], marginBottom: 8 }}>
        Page not found
      </h1>
      <p style={{ ...typeScale.body, color: colors.muted, marginBottom: 24, maxWidth: 400 }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        style={{
          padding: '10px 24px', fontSize: 14, fontWeight: 600,
          background: colors.brand[700], color: '#fff',
          borderRadius: 8, textDecoration: 'none',
        }}
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
