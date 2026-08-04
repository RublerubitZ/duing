import type { MyApplicationDetail, ApplicantInterviewPhase } from '@duing/types';

import { APPLICATION_STATUS_APPLICANT_LABEL } from '@/app/_constants/application-status';

import { getInterviewPhaseGuide } from '../_utils/interviewPhaseGuide';

// 지원자 my-page 진행 stepper (applicantPhase 기반, §9.3).
//
// 서류검토 단계는 제거하고, 면접 단계는 면접 모집(useInterview=true)에서만 표시한다 (스펙 §5-5).
//   면접 모집   : 지원 완료(0) → 면접 대상(1) → 면접 일정 배정 완료(2) → 최종 결과(3)
//   비면접 모집 : 지원 완료(0) → 최종 결과(1)
//
// 활성 단계 결정:
//   면접 모집 + phase != null && phase != 'NOT_APPLICABLE' → guide.stepIndex 우선
//     WAITING_*/AVAILABILITY_*/RESPONDED/NO_SLOT_REPORTED/SCHEDULING → 1
//     SCHEDULED → 2
//   그 외(비면접 모집 · NOT_APPLICABLE · phase=null 로딩 중) → status fallback
//     SUBMITTED·ON_HOLD → 0 (보류는 지원자에게 심사 중과 동일) /
//     INTERVIEW_PENDING → 면접 대상 / ACCEPTED·REJECTED → 마지막
//
// 안내 문구: guide.description 을 role=status 영역에 표시.

type StepperDetail = Pick<
  MyApplicationDetail,
  'status' | 'interviewAvailabilityCount' | 'interview' | 'availabilityDeadline' | 'useInterview'
>;

type Props = {
  detail: StepperDetail;
  // 지원자 면접 진행 phase — null 이면 로딩 중으로 간주해 status fallback 사용.
  phase: ApplicantInterviewPhase | null;
};

type StepKey =
  | 'submitted'
  | 'interview-pending'
  | 'interview-assigned'
  | 'finalized';

type StepDef = {
  key: StepKey;
  defaultLabel: string;
};

// 단계 이름 중 상태와 1:1 로 대응하는 것은 지원자 라벨 SoT 를 소비한다 (스펙 §5-4).
// 'submitted'·'interview-assigned'·'finalized' 는 상태가 아니라 진행 마디라 자체 문구를 쓴다.
const STEPS_WITH_INTERVIEW: readonly StepDef[] = [
  { key: 'submitted', defaultLabel: '지원 완료' },
  { key: 'interview-pending', defaultLabel: APPLICATION_STATUS_APPLICANT_LABEL.INTERVIEW_PENDING },
  { key: 'interview-assigned', defaultLabel: '면접 일정 배정 완료' },
  { key: 'finalized', defaultLabel: '최종 결과' },
];

const STEPS_WITHOUT_INTERVIEW: readonly StepDef[] = [
  { key: 'submitted', defaultLabel: '지원 완료' },
  { key: 'finalized', defaultLabel: '최종 결과' },
];

// 면접 모집 STEPS 에서 '면접 대상' 의 index — guide.stepIndex 1 과 동일하다.
const INTERVIEW_PENDING_STEP_INDEX = 1;

function resolveSteps(useInterview: boolean): readonly StepDef[] {
  return useInterview ? STEPS_WITH_INTERVIEW : STEPS_WITHOUT_INTERVIEW;
}

function resolveActiveStepIndexFromStatus(detail: StepperDetail): number {
  switch (detail.status) {
    case 'SUBMITTED':
    case 'ON_HOLD':
      return 0;
    case 'INTERVIEW_PENDING':
      // 비면접 모집엔 면접 단계가 없어 지원 완료에 머문다 (정상 흐름에선 발생하지 않는 조합).
      return detail.useInterview ? INTERVIEW_PENDING_STEP_INDEX : 0;
    case 'ACCEPTED':
    case 'REJECTED':
      return resolveSteps(detail.useInterview).length - 1;
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
  // 비면접 모집엔 면접 단계가 없으므로 phase 로 활성 단계를 정하지 않는다.
  if (detail.useInterview && phase !== null && phase !== 'NOT_APPLICABLE') {
    const guide = getInterviewPhaseGuide(phase);
    if (guide !== null) {
      // guide.stepIndex: 1=면접 대상, 2=면접 일정 배정 완료
      return guide.stepIndex;
    }
  }
  // NOT_APPLICABLE 또는 로딩 중(null) → status fallback
  return resolveActiveStepIndexFromStatus(detail);
}

function resolveStepLabel(step: StepDef, detail: StepperDetail): string {
  if (step.key !== 'finalized') return step.defaultLabel;
  if (detail.status === 'ACCEPTED' || detail.status === 'REJECTED') {
    return APPLICATION_STATUS_APPLICANT_LABEL[detail.status];
  }
  return step.defaultLabel;
}

export function ApplicationStepper({ detail, phase }: Props) {
  const steps = resolveSteps(detail.useInterview);
  const activeIndex = resolveActiveStepIndex(phase, detail);
  const isFinalReject = detail.status === 'REJECTED';

  // guide 안내 문구 — 면접 모집에서 phase 가 있으면 guide.description 사용, 없으면 없음.
  const guideDescription: string | null =
    detail.useInterview && phase !== null && phase !== 'NOT_APPLICABLE'
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
          gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
          gap: 4,
          margin: 0,
          padding: 0,
          listStyle: 'none',
          position: 'relative',
        }}
      >
        {steps.map((step, index) => {
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
