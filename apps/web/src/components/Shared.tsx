'use client';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  // Order statuses
  DRAFT: { bg: '#edf2f7', text: '#4a5568' },
  SUBMITTED: { bg: '#fef3c7', text: '#92400e' },
  ACCEPTED: { bg: '#d1fae5', text: '#065f46' },
  PARTIALLY_ACCEPTED: { bg: '#fef3c7', text: '#92400e' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b' },
  CONFIRMED: { bg: '#dbeafe', text: '#1e40af' },
  PREPARING: { bg: '#e0e7ff', text: '#3730a3' },
  READY: { bg: '#d1fae5', text: '#065f46' },
  OUT_FOR_DELIVERY: { bg: '#dbeafe', text: '#1e40af' },
  DELIVERED: { bg: '#d1fae5', text: '#065f46' },
  COMPLETED: { bg: '#d1fae5', text: '#065f46' },
  CANCELLED: { bg: '#fee2e2', text: '#991b1b' },
  // Store statuses
  VERIFIED: { bg: '#d1fae5', text: '#065f46' },
  PENDING: { bg: '#fef3c7', text: '#92400e' },
  ACTIVE: { bg: '#d1fae5', text: '#065f46' },
  // Notification statuses
  SENT: { bg: '#dbeafe', text: '#1e40af' },
  READ: { bg: '#edf2f7', text: '#4a5568' },
  FAILED: { bg: '#fee2e2', text: '#991b1b' },
  // Dispute statuses
  OPEN: { bg: '#fef3c7', text: '#92400e' },
  EVIDENCE: { bg: '#fef3c7', text: '#92400e' },
  RESPONSE: { bg: '#dbeafe', text: '#1e40af' },
  REVIEW: { bg: '#e0e7ff', text: '#3730a3' },
  RESOLVED: { bg: '#d1fae5', text: '#065f46' },
  CLOSED: { bg: '#edf2f7', text: '#4a5568' },
};

const DEFAULT_COLOR = { bg: '#edf2f7', text: '#4a5568' };

export function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] || DEFAULT_COLOR;
  const label = status.replace(/_/g, ' ');

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: colors.bg,
      color: colors.text,
      textTransform: 'capitalize',
    }}>
      {label}
    </span>
  );
}

export function formatMinor(minor: number, currency = 'SAR'): string {
  const major = minor / 100;
  if (currency === 'SAR') {
    return `${major.toFixed(2)} SAR`;
  }
  return `${major.toFixed(2)} ${currency}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EmptyState({ title, description, action }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📦</div>
      <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f3340', marginBottom: 8 }}>{title}</h3>
      {description && <p style={{ color: '#5b6b74', fontSize: 14, marginBottom: 16 }}>{description}</p>}
      {action}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <div style={{
        width: 32,
        height: 32,
        border: '3px solid #d9e2e6',
        borderTopColor: '#0f3340',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{
      background: '#fee2e2',
      border: '1px solid #fca5a5',
      borderRadius: 8,
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <span style={{ color: '#991b1b', fontSize: 14 }}>{message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{
          background: '#991b1b',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 12px',
          fontSize: 12,
          cursor: 'pointer',
        }}>Retry</button>
      )}
    </div>
  );
}
