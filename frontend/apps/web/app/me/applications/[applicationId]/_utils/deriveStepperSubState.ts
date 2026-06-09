// 지원자 my-page funnel stepper 의 Step 3 (면접 대상) sub-state 분기 유틸 (Spec P0-1).
//
// 메인 진행 막대는 ApplicationStatus + interviewScheduleAssigned 로 결정되며
// 본 유틸은 Step 3 활성 시점에서만 사용된다 — 호출자가 활성 여부 (즉
// `INTERVIEW_PENDING && !interviewScheduleAssigned`) 를 책임지므로 본 유틸 signature
// 에는 interviewScheduleAssigned 를 받지 않는다 (잘못된 호출 시 silent 오류 방지).
//
// 분기 (spec 정의 그대로):
//   1. interviewAvailabilityCount > 0
//        → 'slot-submitted'     (가능시간 제출 완료, 운영진 배정 대기)
//   2. interviewAvailabilityCount === 0 && availabilityDeadline != null
//        && new Date(availabilityDeadline) < now
//        → 'slot-deadline-passed' (가능시간 제출 마감)
//   3. else
//        → 'slot-select-pending' (가능시간 선택 대기)
//
// availabilityDeadline 이 null 인 경우 (useInterview=false 또는 config 미존재) 는
// 마감 분기를 의도적으로 비활성화한다 — 모집 자체가 면접을 사용하지 않는 케이스.

export type StepperSubState =
  | 'slot-select-pending'
  | 'slot-submitted'
  | 'slot-deadline-passed';

export type DeriveStepperSubStateInput = {
  interviewAvailabilityCount: number;
  availabilityDeadline: string | null;
  now: Date;
};

export function deriveStepperSubState({
  interviewAvailabilityCount,
  availabilityDeadline,
  now,
}: DeriveStepperSubStateInput): StepperSubState {
  if (interviewAvailabilityCount > 0) {
    return 'slot-submitted';
  }
  if (
    interviewAvailabilityCount === 0 &&
    availabilityDeadline !== null &&
    new Date(availabilityDeadline) < now
  ) {
    return 'slot-deadline-passed';
  }
  return 'slot-select-pending';
}
