/* a-apply-status.jsx → TypeScript 변환: StepNode + StepTimeline */

import type { Step, StepState } from '../_constants/data';

/* ============================================================
   StepNode
   ============================================================ */
type StepNodeProps = {
  step: Step;
  showDate?: boolean;
  dim?: boolean;
};

type NodeColor = {
  bg: string;
  border: string;
  icon: 'check' | 'x' | null;
  iconColor: string;
  inner?: string;
};

export function StepNode({ step, showDate = false, dim = false }: StepNodeProps) {
  const stepState: StepState = step.state;
  const colorMap: Record<StepState, NodeColor> = {
    done:    { bg: '#2E6149', border: '#2E6149', icon: 'check', iconColor: '#fff' },
    current: { bg: '#fff',   border: '#2E6149', icon: null,    iconColor: '#2E6149', inner: '#2E6149' },
    pending: { bg: '#fff',   border: '#D9D6CC', icon: null,    iconColor: 'transparent' },
    failed:  { bg: '#D9523A', border: '#D9523A', icon: 'x',    iconColor: '#fff' },
  };
  const nodeColor = colorMap[stepState] ?? colorMap.pending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: '0 0 auto', zIndex: 1 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: nodeColor.bg,
        border: `2px solid ${nodeColor.border}`,
        display: 'grid', placeItems: 'center',
        position: 'relative',
      }}>
        {nodeColor.icon === 'check' && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <path d="M5 12 L10 17 L19 7" stroke={nodeColor.iconColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {nodeColor.icon === 'x' && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M6 6 L18 18 M18 6 L6 18" stroke={nodeColor.iconColor} strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {stepState === 'current' && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: nodeColor.inner,
          }} />
        )}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 600,
        color: dim ? 'var(--charcoal-3)'
              : stepState === 'done' || stepState === 'current' ? 'var(--ink-deep)'
              : stepState === 'failed' ? '#9A3F23'
              : 'var(--charcoal-3)',
        whiteSpace: 'nowrap',
        textAlign: 'center',
        lineHeight: 1.2,
      }}>
        {step.label}
      </div>
      {showDate && (
        <div style={{
          fontSize: 9.5,
          color: 'var(--charcoal-3)',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}>
          {step.date}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   StepTimeline — 단계 타임라인 (수평) — 칸 수는 steps 길이를 따른다
   ============================================================ */
type StepTimelineProps = {
  steps: Step[];
  showDate?: boolean;
  width?: string;
};

export function StepTimeline({ steps, showDate = false, width = '100%' }: StepTimelineProps) {
  const cols = steps.length;
  return (
    <div style={{
      width,
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      position: 'relative',
      alignItems: 'start',
      columnGap: 4,
    }}>
      {/* 연결선들 (마디 사이) */}
      {steps.slice(0, -1).map((step, i) => {
        const nextStep = steps[i + 1];
        if (!nextStep) return null;
        const bothDone = step.state === 'done' && (nextStep.state === 'done' || nextStep.state === 'failed');
        const halfDone = step.state === 'done' && nextStep.state === 'current';
        const lineColor = bothDone ? '#2E6149'
                        : halfDone ? '#2E6149'
                        : '#D9D6CC';
        return (
          <div key={i} style={{
            position: 'absolute',
            top: 10,
            left: `calc(${(i + 0.5) * (100 / cols)}% + 11px)`,
            width: `calc(${100 / cols}% - 22px)`,
            height: 2,
            background: lineColor,
            opacity: halfDone ? 0.55 : 1,
            zIndex: 0,
          }} />
        );
      })}
      {steps.map((step, i) => (
        <StepNode key={i} step={step} showDate={showDate} />
      ))}
    </div>
  );
}
