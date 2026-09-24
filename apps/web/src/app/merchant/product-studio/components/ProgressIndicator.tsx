'use client';

import { type Step, STEPS } from '../../../../hooks/useProductStudio';

interface ProgressIndicatorProps {
  currentStep: Step;
  onStepClick: (step: Step) => void;
  stepIndex: number;
}

export default function ProgressIndicator({ currentStep, onStepClick, stepIndex }: ProgressIndicatorProps) {
  return (
    <div style={{
      background: '#fff', borderBottom: '1px solid #d9e2e6', padding: '16px 24px',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ display: 'flex', gap: 4, maxWidth: 800, margin: '0 auto' }}>
        {STEPS.map((s, i) => {
          const isCurrent = s.key === currentStep;
          const isCompleted = i < stepIndex;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onStepClick(s.key)}
              aria-current={isCurrent ? 'step' : undefined}
              style={{
                flex: 1, padding: '10px 8px', textAlign: 'center', cursor: 'pointer',
                background: isCurrent ? '#0f3340' : isCompleted ? '#e5f2f8' : '#f7f9fa',
                color: isCurrent ? '#fff' : isCompleted ? '#0f3340' : '#5b6b74',
                border: '1px solid', borderColor: isCurrent ? '#0f3340' : '#d9e2e6',
                borderRadius: 6, fontSize: 12, fontWeight: isCurrent ? 700 : 500,
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                {isCompleted ? '✓' : s.num}
              </div>
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
