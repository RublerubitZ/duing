/* a-apply-status-page.jsx → TypeScript 변환: DetailRow + ApplyDetailModal */

import type React from 'react';
import type { App, Step } from '../_constants/data';
import { ClubLogo } from './ClubLogo';
import { StepTimeline } from './StepTimeline';

/* ============================================================
   DetailRow
   ============================================================ */
type DetailRowProps = {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
};

export const DetailRow = ({ label, value, multiline = false }: DetailRowProps) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: '82px 1fr',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid var(--gray-line)',
    alignItems: multiline ? 'flex-start' : 'center',
    fontSize: 13.5,
  }}>
    <div style={{ color: 'var(--charcoal-3)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</div>
    <div style={{
      color: 'var(--ink-deep)',
      fontWeight: 500,
      lineHeight: multiline ? 1.5 : 1.4,
      wordBreak: 'keep-all',
    }}>
      {value}
    </div>
  </div>
);

/* ============================================================
   ApplyDetailModal
   ============================================================ */
type Props = {
  app: App | null;
  onClose: () => void;
};

/* steps 길이가 4가 아닌 경우 4칸으로 채우는 인라인 헬퍼 */
const padToFour = (steps: Step[]): Step[] => {
  const labels = ['서류접수', '서류심사', '면접/인터뷰', '최종발표'];
  const out = [...steps];
  while (out.length < 4) {
    out.push({ label: labels[out.length] ?? '', date: '-', state: 'pending' });
  }
  return out;
};

export const ApplyDetailModal = ({ app, onClose }: Props) => {
  if (!app) return null;

  const steps4 = app.steps.length === 4 ? app.steps : padToFour(app.steps);

  return (
    <>
      {/* 백드롭은 두지 않고 카드만 떠 있도록 — 시안 느낌 살리기 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(20, 48, 37, 0.18)',
          backdropFilter: 'blur(2px)',
          zIndex: 40,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-detail-title"
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 693,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(100vh - 48px)',
          background: 'var(--paper)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-3)',
          border: '1px solid var(--gray-line)',
          zIndex: 41,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 12px',
        }}>
          <h2 id="apply-detail-title" style={{
            fontSize: 15, fontWeight: 700,
            color: 'var(--ink-deep)',
            fontFamily: 'var(--font-body)',
            margin: 0,
            whiteSpace: 'nowrap',
          }}>
            지원 상세 정보
          </h2>
          <button onClick={onClose} aria-label="닫기" style={{
            width: 28, height: 28, borderRadius: 999,
            border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--charcoal-2)',
            display: 'grid', placeItems: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '0 20px 60px', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.65fr', gap: 18 }}>
            {/* Left — club brief + timeline */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <ClubLogo logo={app.logo} size={52} />
                <div>
                  <div style={{
                    display: 'inline-block',
                    fontSize: 10.5, fontWeight: 700,
                    color: '#5C8268',
                    background: 'var(--sage-tint)',
                    padding: '2px 7px', borderRadius: 999,
                    marginBottom: 4,
                    whiteSpace: 'nowrap',
                  }}>{app.cat}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink-deep)', lineHeight: 1.2 }}>
                    {app.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--charcoal-3)', marginTop: 2 }}>{app.tag}</div>
                </div>
              </div>

              <a href="#" style={{
                fontSize: 11, color: 'var(--charcoal-2)',
                textDecoration: 'underline', textUnderlineOffset: 3,
                display: 'inline-block', marginBottom: 16,
                whiteSpace: 'nowrap',
              }}>
                동아리 소개 바로가기 →
              </a>

              <div style={{
                borderTop: '1px solid var(--gray-line)',
                paddingTop: 14, marginTop: 2,
              }}>
                <div style={{
                  fontSize: 11.5, fontWeight: 700,
                  color: 'var(--ink-deep)',
                  marginBottom: 14,
                }}>
                  전형 진행 단계
                </div>
                <StepTimeline steps={steps4} showDate />
              </div>
            </div>

            {/* Right — detail table */}
            <div style={{
              borderLeft: '1px solid var(--gray-line)',
              paddingLeft: 22,
            }}>
              <DetailRow label="지원일" value={app.appliedAt} />
              <DetailRow label="지원 구분" value={app.division} />
              <DetailRow label="지원 부서" value={app.department} />
              {app.files.map((f, i) => (
                <DetailRow key={i} label={f.type} value={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--ink-deep)' }}>{f.name}</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--charcoal-2)', flexShrink: 0 }}>
                      <path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16" />
                    </svg>
                  </span>
                } />
              ))}
              <DetailRow label="메모" value={app.memo} multiline />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
