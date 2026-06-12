'use client';

import { useState } from 'react';
import { useMyInterviewQuery } from '@duing/hooks';
import type { ApplicantInterviewPhase } from '@duing/types';
import { formatSlotRange } from '@/components/interview/_utils/localDateTime';
import { RespondAvailabilityModal } from './RespondAvailabilityModal';

// 핵심 결정 3: 카드 노출 범위
//   AVAILABILITY_REQUESTED·AVAILABILITY_CLOSED·RESPONDED·NO_SLOT_REPORTED·SCHEDULING·SCHEDULED
//   만 카드 렌더. 그 이전 단계(서류·대기)는 stepper 문구가 담당. NOT_APPLICABLE 은 양쪽 다 숨김.
// 핵심 결정 5: 재응답 노출 규칙
//   RESPONDED·NO_SLOT_REPORTED 의 [변경하기] 는 availabilityDeadline 이 미래일 때만.
//   AVAILABILITY_REQUESTED 는 항상 [시간 선택하기].

type Props = {
  applicationId: number;
};

const CARD_PHASES: ReadonlySet<ApplicantInterviewPhase> = new Set([
  'AVAILABILITY_REQUESTED',
  'AVAILABILITY_CLOSED',
  'RESPONDED',
  'NO_SLOT_REPORTED',
  'SCHEDULING',
  'SCHEDULED',
] as const);

function formatDeadline(isoString: string): string {
  // YYYY-MM-DDTHH:mm:ss → "M월 D일 HH:mm 마감"
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return isoString;
  const [, , m, d, hh, mm] = match;
  return `${Number(m)}월 ${Number(d)}일 ${hh}:${mm} 마감`;
}

export function ApplicantInterviewCard({ applicationId }: Props) {
  const { data: interviewView, isLoading } = useMyInterviewQuery(applicationId);
  const [isModalOpen, setModalOpen] = useState(false);

  if (isLoading || !interviewView) return null;

  const { phase, availabilityDeadline, slots, myAlternativeText, scheduledInterview } =
    interviewView;

  // 카드 노출 범위 밖이면 렌더하지 않는다 (핵심 결정 3).
  const shouldRender = CARD_PHASES.has(phase);
  if (!shouldRender) return null;

  // 재응답 버튼 노출 판정 (핵심 결정 5) — 클라이언트 비교는 버튼 노출용, 서버 409 가 최종 가드.
  const isBeforeDeadline =
    availabilityDeadline !== null && new Date() < new Date(availabilityDeadline);

  return (
    <section
      aria-labelledby="applicant-interview-card-title"
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--gray-line)',
        borderRadius: 14,
        padding: '16px 18px',
        marginTop: 12,
      }}
    >
      <h3
        id="applicant-interview-card-title"
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--ink-deep)',
          margin: 0,
          marginBottom: 12,
        }}
      >
        면접 안내
      </h3>

      {/* AVAILABILITY_REQUESTED — 슬롯 선택 전 */}
      {phase === 'AVAILABILITY_REQUESTED' && (
        <div>
          {availabilityDeadline && (
            <p style={{ fontSize: 12.5, color: 'var(--charcoal-3)', marginBottom: 10 }}>
              {formatDeadline(availabilityDeadline)}
            </p>
          )}
          {slots !== null && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{
                padding: '7px 14px',
                borderRadius: 8,
                border: 'none',
                background: '#2E6149',
                color: '#fff',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              시간 선택하기
            </button>
          )}
        </div>
      )}

      {/* AVAILABILITY_CLOSED — 마감, 미응답 */}
      {phase === 'AVAILABILITY_CLOSED' && (
        <p style={{ fontSize: 13, color: 'var(--charcoal-3)' }}>
          가능 시간 제출이 마감되었습니다. 운영진과 별도 연락이 있을 수 있습니다.
        </p>
      )}

      {/* RESPONDED — 내가 고른 슬롯 목록 */}
      {phase === 'RESPONDED' && (
        <div>
          {slots && slots.filter((s) => s.selected).length > 0 && (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                marginBottom: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {slots
                .filter((s) => s.selected)
                .map((s) => (
                  <li
                    key={s.slotId}
                    style={{ fontSize: 13, color: 'var(--ink-deep)' }}
                  >
                    {formatSlotRange(s.startTime, s.endTime)}
                  </li>
                ))}
            </ul>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--charcoal-3)', marginBottom: 8 }}>
            가능 시간을 제출했습니다. 운영진이 일정을 배정 중입니다.
          </p>
          {isBeforeDeadline && slots !== null && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--gray-line)',
                background: 'transparent',
                fontSize: 12.5,
                color: 'var(--charcoal-2)',
                cursor: 'pointer',
              }}
            >
              변경하기
            </button>
          )}
        </div>
      )}

      {/* NO_SLOT_REPORTED — 가능없음 응답 */}
      {phase === 'NO_SLOT_REPORTED' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--charcoal-2)', marginBottom: 6 }}>
            가능한 시간이 없다고 응답했습니다.
          </p>
          {myAlternativeText && (
            <p
              style={{
                fontSize: 12.5,
                color: 'var(--charcoal-3)',
                marginBottom: 8,
                padding: '8px 10px',
                background: 'var(--sage-tint, #E8EEE8)',
                borderRadius: 8,
              }}
            >
              {myAlternativeText}
            </p>
          )}
          {isBeforeDeadline && slots !== null && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--gray-line)',
                background: 'transparent',
                fontSize: 12.5,
                color: 'var(--charcoal-2)',
                cursor: 'pointer',
              }}
            >
              변경하기
            </button>
          )}
        </div>
      )}

      {/* SCHEDULING — 조율 중 */}
      {phase === 'SCHEDULING' && (
        <p style={{ fontSize: 13, color: 'var(--charcoal-3)' }}>
          운영진이 면접 일정을 조율하고 있습니다.
        </p>
      )}

      {/* SCHEDULED — 확정 일시·장소 */}
      {phase === 'SCHEDULED' && scheduledInterview && (
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 10, fontSize: 13 }}>
            <dt style={{ color: 'var(--charcoal-3)', minWidth: 32, fontWeight: 600 }}>
              일시
            </dt>
            <dd style={{ color: 'var(--ink-deep)', margin: 0 }}>
              {formatSlotRange(scheduledInterview.startTime, scheduledInterview.endTime)}
            </dd>
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 13 }}>
            <dt style={{ color: 'var(--charcoal-3)', minWidth: 32, fontWeight: 600 }}>
              장소
            </dt>
            <dd style={{ color: 'var(--ink-deep)', margin: 0 }}>
              {scheduledInterview.location ?? '미정'}
            </dd>
          </div>
        </dl>
      )}

      {/* RespondAvailabilityModal — AVAILABILITY_REQUESTED / RESPONDED / NO_SLOT_REPORTED */}
      {isModalOpen && slots && (
        <RespondAvailabilityModal
          isOpen={isModalOpen}
          onClose={() => setModalOpen(false)}
          applicationId={applicationId}
          slots={slots}
          initialNoSlot={phase === 'NO_SLOT_REPORTED' ? true : undefined}
          initialAlternativeText={phase === 'NO_SLOT_REPORTED' ? myAlternativeText : undefined}
        />
      )}
    </section>
  );
}
