import type { MyApplicationDetail, ApplicantInterviewPhase } from '@duing/types';

import { getInterviewPhaseGuide } from '../_utils/interviewPhaseGuide';

// 지원자 my-page 면접 funnel stepper (재배선 — applicantPhase 기반, §9.3).
//
// 5단계 메인 진행 막대:
//   0. 지원 완료           — index 0
//   1. 서류 검토 중        — index 1
//   2. 면접 대상           — index 2
//   3. 면접 일정 배정 완료 — index 3
//   4. 최종 합격 / 최종 불합격 — index 4
//
// 활성 단계 결정 (핵심 결정 2):
//   phase != null && phase != 'NOT_APPLICABLE' → guide.stepIndex 우선
//     DOCUMENT_REVIEW → 1
//     WAITING_*/AVAILABILITY_*/RESPONDED/NO_SLOT_REPORTED/SCHEDULING → 2
//     SCHEDULED → 3
//   NOT_APPLICABLE 또는 phase=null(로딩 중) → status fallback
//     SUBMITTED → 0 / UNDER_REVIEW → 1 / INTERVIEW_PENDING → 2 / ACCEPTED·REJECTED → 4
//
// 안내 문구: guide.description 을 role=status 영역에 표시.

type StepperDetail = Pick<
  MyApplicationDetail,
  'status' | 'interviewAvailabilityCount' | 'interview' | 'availabilityDeadline'
>;

type Props = {
  detail: StepperDetail;
  // 지원자 면접 진행 phase — null 이면 로딩 중으로 간주해 status fallback 사용.
  phase: ApplicantInterviewPhase | null;
};

type StepKey =
  | 'submitted'
  | 'under-review'
  | 'interview-pending'
  | 'interview-assigned'
  | 'finalized';

type StepDef = {
  key: StepKey;
  defaultLabel: string;
};

const STEPS: readonly StepDef[] = [
  { key: 'submitted', defaultLabel: '지원 완료' },
  { key: 'under-review', defaultLabel: '서류 검토 중' },
  { key: 'interview-pending', defaultLabel: '면접 대상' },
  { key: 'interview-assigned', defaultLabel: '면접 일정 배정 완료' },
  { key: 'finalized', defaultLabel: '최종 결과' },
];

function resolveActiveStepIndexFromStatus(
  detail: StepperDetail,
): number {
  switch (detail.status) {
    case 'SUBMITTED':
      return 0;
    case 'UNDER_REVIEW':
      return 1;
    case 'INTERVIEW_PENDING':
      return 2;
    case 'ACCEPTED':
    case 'REJECTED':
      return 4;
    default: {
      const _exhaustive: never = detail.status;
      void _exhaustive;
      return 0;
    }
  }
}

function resolveActiveStepIndex(
  phase: ApplicantInterviewPhase | null,
  detail: StepperDetail,
): number {
  if (phase !== null && phase !== 'NOT_APPLICABLE') {
    const guide = getInterviewPhaseGuide(phase);
    if (guide !== null) {
      // guide.stepIndex: 1=서류 검토 중, 2=면접 대상, 3=면접 일정 배정 완료
      return guide.stepIndex;
    }
  }
  // NOT_APPLICABLE 또는 로딩 중(null) → status fallback
  return resolveActiveStepIndexFromStatus(detail);
}

function resolveStepLabel(step: StepDef, detail: StepperDetail): string {
  if (step.key !== 'finalized') return step.defaultLabel;
  if (detail.status === 'ACCEPTED') return '최종 합격';
  if (detail.status === 'REJECTED') return '최종 불합격';
  return step.defaultLabel;
}

export function ApplicationStepper({ detail, phase }: Props) {
  const activeIndex = resolveActiveStepIndex(phase, detail);
  const isFinalReject = detail.status === 'REJECTED';

  // guide 안내 문구 — phase 가 있으면 guide.description 사용, 없으면 없음.
  const guideDescription: string | null =
    phase !== null && phase !== 'NOT_APPLICABLE'
      ? (getInterviewPhaseGuide(phase)?.description ?? null)
      : null;

  return (
    <section
      aria-labelledby="application-stepper-title"
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--gray-line)',
        borderRadius: 14,
        padding: '16px 18px',
      }}
    >
      <h3
        id="application-stepper-title"
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--ink-deep)',
          margin: 0,
          marginBottom: 14,
        }}
      >
        지원 진행 단계
      </h3>

      <ol
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`,
          gap: 4,
          margin: 0,
          padding: 0,
          listStyle: 'none',
          position: 'relative',
        }}
      >
        {STEPS.map((step, index) => {
          const isActive = index === activeIndex;
          const isPast = index < activeIndex;
          const isReachedFinal = step.key === 'finalized' && isActive && isFinalReject;

          const dotColor = isReachedFinal
            ? '#D9523A'
            : isPast || isActive
            ? '#2E6149'
            : '#D9D6CC';
          const dotBackground = isActive ? '#fff' : dotColor;
          const dotBorder = isReachedFinal ? '#D9523A' : isPast || isActive ? '#2E6149' : '#D9D6CC';
          const labelColor = isPast || isActive ? 'var(--ink-deep)' : 'var(--charcoal-3)';

          return (
            <li
              key={step.key}
              aria-current={isActive ? 'step' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                position: 'relative',
                zIndex: 1,
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: dotBackground,
                  border: `2px solid ${dotBorder}`,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {isActive && !isReachedFinal && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#2E6149',
                    }}
                  />
                )}
                {isActive && isReachedFinal && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#D9523A',
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 600,
                  color: labelColor,
                  textAlign: 'center',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                }}
              >
                {resolveStepLabel(step, detail)}
              </span>
            </li>
          );
        })}
      </ol>

      {guideDescription && (
        <p
          role="status"
          style={{
            marginTop: 14,
            marginBottom: 0,
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--sage-tint, #E8EEE8)',
            color: 'var(--ink-deep)',
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {guideDescription}
        </p>
      )}
    </section>
  );
}
