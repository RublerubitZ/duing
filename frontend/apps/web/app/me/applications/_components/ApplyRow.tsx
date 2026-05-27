/* a-apply-status-parts.jsx → TypeScript 변환: ApplyRow + padToFour */

import { CAT_LABEL_COLOR } from '../_constants/data';
import { ClubLogo } from './ClubLogo';
import { StepTimeline } from './StepTimeline';
import { StatusBadge } from './StatusBadge';
import type React from 'react';
import type { App, Step } from '../_constants/data';

/* 단계가 1개뿐인 카드(취소된 지원 등)도 4-칸 그리드로 보이게 패딩 */
export const padToFour = (steps: Step[]): Step[] => {
  const labels = ['서류접수', '서류심사', '면접/인터뷰', '최종발표'];
  const out = [...steps];
  while (out.length < 4) {
    out.push({ label: labels[out.length] ?? '', date: '-', state: 'pending' });
  }
  return out;
};

type Props = {
  app: App;
  onOpen: (id: string) => void;
  isActive: boolean;
};

export function ApplyRow({ app, onOpen, isActive }: Props) {
  const labelColor = CAT_LABEL_COLOR[app.cat] ?? '#5C8268';
  return (
    <div
      onClick={() => onOpen(app.id)}
      style={{
        background: 'var(--paper)',
        border: `1px solid ${isActive ? 'var(--ink)' : 'var(--gray-line)'}`,
        borderRadius: 14,
        padding: '16px 18px',
        display: 'grid',
        gridTemplateColumns: '50px 1fr 220px 108px 12px',
        gap: 10,
        alignItems: 'center',
        cursor: 'pointer',
        transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-2)';
        e.currentTarget.style.borderColor = 'var(--ink)';
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
        if (!isActive) e.currentTarget.style.borderColor = 'var(--gray-line)';
      }}
    >
      {/* 1. 로고 */}
      <ClubLogo logo={app.logo} size={50} />

      {/* 2. 동아리 정보 */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'inline-block',
          fontSize: 10.5, fontWeight: 700,
          color: labelColor,
          background: 'var(--sage-tint)',
          padding: '2px 7px', borderRadius: 999,
          marginBottom: 4,
          whiteSpace: 'nowrap',
        }}>{app.cat}</div>
        <div style={{
          fontSize: 15.5, fontWeight: 700,
          color: 'var(--ink-deep)',
          marginBottom: 2,
          lineHeight: 1.2,
        }}>{app.name}</div>
        <div style={{
          fontSize: 11, color: 'var(--charcoal-3)',
          marginBottom: 4,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{app.tag}</div>
        <div style={{
          fontSize: 10.5, color: 'var(--charcoal-3)',
          fontFamily: 'var(--font-mono)',
        }}>
          지원일 {app.appliedDate}
        </div>
      </div>

      {/* 3. 타임라인 */}
      <div style={{ padding: '0 2px' }}>
        <StepTimeline steps={app.steps.length === 4 ? app.steps : padToFour(app.steps)} />
      </div>

      {/* 4. 상태 + 부가 정보 */}
      <div style={{ textAlign: 'left' }}>
        {app.status && (
          <div style={{ marginBottom: 6 }}>
            <StatusBadge status={app.status} />
          </div>
        )}
        {app.right && (
          <>
            <div style={{ fontSize: 10.5, color: 'var(--charcoal-3)', marginBottom: 1 }}>
              {app.right.eyebrow}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-deep)', fontFamily: 'var(--font-mono)' }}>
              {app.right.value}
            </div>
            {app.right.sub && (
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-deep)', fontFamily: 'var(--font-mono)' }}>
                {app.right.sub}
              </div>
            )}
          </>
        )}
      </div>

      {/* 5. 화살표 */}
      <div style={{ color: 'var(--charcoal-3)', display: 'grid', placeItems: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </div>
    </div>
  );
}
