/* a-apply-status-parts.jsx → TypeScript 변환: ApplyRow */

import { CAT_LABEL_COLOR } from '../_constants/data';
import { ClubLogo } from './ClubLogo';
import { StepTimeline } from './StepTimeline';
import { StatusBadge } from './StatusBadge';
import type React from 'react';
import type { App } from '../_constants/data';

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
      className="apply-row"
      style={{
        background: 'var(--paper)',
        border: `1px solid ${isActive ? 'var(--ink)' : 'var(--gray-line)'}`,
        borderRadius: 14,
        padding: '16px 18px',
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
      <div className="ar-logo">
        <ClubLogo logo={app.logo} size={50} />
      </div>

      {/* 2. 동아리 정보 */}
      <div className="ar-info">
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
      <div className="ar-timeline" style={{ padding: '0 2px' }}>
        <StepTimeline steps={app.steps} />
      </div>

      {/* 4. 상태 + 부가 정보 */}
      <div className="ar-status" style={{ textAlign: 'left' }}>
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

      {/* 5. 화살표 (데스크탑 전용 — 모바일은 카드 전체가 탭 영역) */}
      <div className="ar-arrow hidden place-items-center md:grid" style={{ color: 'var(--charcoal-3)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </div>
    </div>
  );
}
