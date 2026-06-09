import type { MyApplicationDetail } from '@duing/types';

import { deriveStepperSubState, type StepperSubState } from '../_utils/deriveStepperSubState';

// 지원자 my-page 면접 funnel stepper (Spec P0-1).
//
// 5단계 메인 진행 막대:
//   1. 지원 완료           — status == SUBMITTED
//   2. 서류 검토 중        — status == UNDER_REVIEW
//   3. 면접 대상           — status == INTERVIEW_PENDING && !interviewScheduleAssigned
//   4. 면접 일정 배정 완료 — status == INTERVIEW_PENDING && interviewScheduleAssigned
//   5. 최종 합격 / 최종 불합격 — status == ACCEPTED / REJECTED
//
// Step 3 활성 시 진행 막대는 그대로 두고 sub-state 안내 문구만 분기 (deriveStepperSubState 참조).

type StepperDetail = Pick<
  MyApplicationDetail,
  'status' | 'interviewAvailabilityCount' | 'interviewScheduleAssigned' | 'availabilityDeadline'
>;

type Props = {
  detail: StepperDetail;
  // SSR/테스트 결정성을 위해 호출자가 명시적으로 주입한다. (default `new Date()` 은
  // server render 결정성을 깨뜨릴 수 있어 의도적으로 required 로 둔다.)
  now: Date;
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

const SUB_STATE_TEXT: Record<StepperSubState, (count: number) => string> = {
  'slot-select-pending': () =>
    '운영진이 면접 대상으로 선정했습니다. 면접 가능 시간을 선택해 주세요.',
  'slot-submitted': (count) =>
    `면접 가능 시간 ${count}개를 제출했습니다. 운영진이 일정을 배정 중입니다.`,
  'slot-deadline-passed': () =>
    '면접 가능 시간 제출이 마감되었습니다. 운영진과 별도 연락이 있을 수 있습니다.',
};

function resolveActiveStepIndex(detail: StepperDetail): number {
  switch (detail.status) {
    case 'SUBMITTED':
      return 0;
    case 'UNDER_REVIEW':
      return 1;
    case 'INTERVIEW_PENDING':
      return detail.interviewScheduleAssigned ? 3 : 2;
    case 'ACCEPTED':
    case 'REJECTED':
      return 4;
    default: {
      // ApplicationStatus union 확장 시 컴파일 타임에 누락을 잡아낸다.
      const _exhaustive: never = detail.status;
      void _exhaustive;
      return 0;
    }
  }
}

function resolveStepLabel(step: StepDef, detail: StepperDetail): string {
  if (step.key !== 'finalized') return step.defaultLabel;
  if (detail.status === 'ACCEPTED') return '최종 합격';
  if (detail.status === 'REJECTED') return '최종 불합격';
  return step.defaultLabel;
}

export function ApplicationStepper({ detail, now }: Props) {
  const activeIndex = resolveActiveStepIndex(detail);
  const isFinalReject = detail.status === 'REJECTED';

  // activeIndex === 2 (Step 3 활성) 시점에 한해서만 sub-state 를 계산한다.
  // 이 가드가 `!interviewScheduleAssigned` 를 이미 보장하므로 util signature 에는
  // interviewScheduleAssigned 를 전달하지 않는다.
  const subState: StepperSubState | null =
    activeIndex === 2
      ? deriveStepperSubState({
          interviewAvailabilityCount: detail.interviewAvailabilityCount,
          availabilityDeadline: detail.availabilityDeadline,
          now,
        })
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

      {subState && (
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
          {SUB_STATE_TEXT[subState](detail.interviewAvailabilityCount)}
        </p>
      )}
    </section>
  );
}
