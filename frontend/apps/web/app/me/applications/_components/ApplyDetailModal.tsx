/* a-apply-status-page.jsx → TypeScript 변환: DetailRow + ApplyDetailModal */

import type React from 'react';

import type { MyApplicationDetail } from '@duing/types';
import { useMyInterviewQuery } from '@duing/hooks';

import { ApplicationStepper } from '../[applicationId]/_components/ApplicationStepper';
import { ApplicantInterviewCard } from '../[applicationId]/_components/ApplicantInterviewCard';
import type { App } from '../_constants/data';

import { ClubLogo } from './ClubLogo';

/* ============================================================
   DetailRow
   ============================================================ */
type DetailRowProps = {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
};

export function DetailRow({ label, value, multiline = false }: DetailRowProps) {
  if (multiline) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 0',
        borderBottom: '1px solid var(--gray-line)',
        fontSize: 13.5,
      }}>
        <div style={{ color: 'var(--charcoal-3)', fontWeight: 600, wordBreak: 'keep-all' }}>{label}</div>
        <div style={{
          color: 'var(--ink-deep)',
          fontWeight: 500,
          lineHeight: 1.6,
          wordBreak: 'keep-all',
        }}>
          {value}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '82px 1fr',
      gap: 10,
      padding: '8px 0',
      borderBottom: '1px solid var(--gray-line)',
      alignItems: 'center',
      fontSize: 13.5,
    }}>
      <div style={{ color: 'var(--charcoal-3)', fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{
        color: 'var(--ink-deep)',
        fontWeight: 500,
        lineHeight: 1.4,
        wordBreak: 'keep-all',
      }}>
        {value}
      </div>
    </div>
  );
}

/* ============================================================
   ApplyDetailModal
   ============================================================ */
type ApplyDetailModalProps = {
  app: App | null;
  detail?: MyApplicationDetail | null;
  onClose: () => void;
};

export function ApplyDetailModal({ app, detail, onClose }: ApplyDetailModalProps) {
  // 면접 진행 phase 조회 — detail 이 확정된 후에만 fetch (enabled 조건).
  // phase 는 stepper 활성 단계·문구와 ApplicantInterviewCard 에 주입된다.
  const applicationId = detail?.id;
  const { data: interviewView } = useMyInterviewQuery(
    applicationId ?? 0,
    { enabled: applicationId !== undefined },
  );

  if (!app) return null;

  const phase = interviewView?.phase ?? null;

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
          {/* 전체 funnel stepper — phase 기반으로 재배선.
              detail 도착 후에만 마운트. phase=null 이면 status fallback 사용. */}
          {detail && (
            <div style={{ marginBottom: 16 }}>
              <ApplicationStepper detail={detail} phase={phase} />
            </div>
          )}
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
              {/* mock data 기반 StepTimeline 은 상단 ApplicationStepper 와 중복 노출되어 제거.
                  funnel 진행 표시는 detail 기반 ApplicationStepper 가 authoritative 다. */}
            </div>

            {/* Right — detail table */}
            <div style={{
              borderLeft: '1px solid var(--gray-line)',
              paddingLeft: 22,
            }}>
              <DetailRow label="지원일" value={app.appliedAt} />
              {detail ? (
                detail.questions.length > 0 ? (
                  detail.questions.map((question, i) => (
                    <DetailRow key={i} label={`Q${i + 1}. ${question}`} value={detail.answers[i] ?? '-'} multiline />
                  ))
                ) : (
                  <DetailRow label="지원 내용" value="별도 지원서 없음" />
                )
              ) : (
                <div style={{ padding: '20px 0', fontSize: 13, color: 'var(--charcoal-3)', textAlign: 'center' }}>
                  불러오는 중...
                </div>
              )}

              {/* 면접 카드 — applicantPhase 소비 (InterviewScheduleCard 대체).
                  recruitmentId 가 확정된 detail 도착 후에만 마운트. */}
              {detail && (
                <ApplicantInterviewCard applicationId={detail.id} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
