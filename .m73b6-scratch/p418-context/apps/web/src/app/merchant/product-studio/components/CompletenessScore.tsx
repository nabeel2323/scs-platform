'use client';

interface CompletenessScoreProps {
  score: number; // 0–100
}

export default function CompletenessScore({ score }: CompletenessScoreProps) {
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Great' : score >= 50 ? 'Good' : 'Incomplete';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: 48, height: 48 }}>
        <svg viewBox="0 0 36 36" style={{ width: 48, height: 48, transform: 'rotate(-90deg)' }}>
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5ecf0" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${score} ${100 - score}`} strokeDashoffset="0"
            strokeLinecap="round"
          />
        </svg>
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color,
        }}>
          {score}%
        </span>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#16232b' }}>{label}</div>
        <div style={{ fontSize: 11, color: '#5b6b74' }}>Product completeness</div>
      </div>
    </div>
  );
}
