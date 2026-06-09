import { describe, it, expect } from 'vitest';

import { deriveStepperSubState } from '@/app/me/applications/[applicationId]/_utils/deriveStepperSubState';

// Spec P0-1 의 Step 3 sub-state 매트릭스.
// 호출자 (ApplicationStepper) 가 activeIndex === 2 가드로 `INTERVIEW_PENDING &&
// !interviewScheduleAssigned` 를 보장하므로 본 유틸은 count + deadline + now 3변수만
// 받는다.
//
// 분기 조건:
//   - count > 0 → 'slot-submitted'
//   - count === 0 && deadline != null && deadline < now → 'slot-deadline-passed'
//   - else → 'slot-select-pending'
describe('deriveStepperSubState', () => {
  const now = new Date('2026-06-09T10:00:00');

  it('returns "slot-select-pending" when no availability and deadline not passed', () => {
    expect(
      deriveStepperSubState({
        interviewAvailabilityCount: 0,
        availabilityDeadline: '2026-06-15T18:00:00',
        now,
      }),
    ).toBe('slot-select-pending');
  });

  it('returns "slot-submitted" when availability exists', () => {
    expect(
      deriveStepperSubState({
        interviewAvailabilityCount: 3,
        availabilityDeadline: '2026-06-15T18:00:00',
        now,
      }),
    ).toBe('slot-submitted');
  });

  it('returns "slot-deadline-passed" when no availability and deadline passed', () => {
    expect(
      deriveStepperSubState({
        interviewAvailabilityCount: 0,
        availabilityDeadline: '2026-06-01T18:00:00',
        now,
      }),
    ).toBe('slot-deadline-passed');
  });

  it('returns "slot-select-pending" when deadline is null (useInterview=false)', () => {
    expect(
      deriveStepperSubState({
        interviewAvailabilityCount: 0,
        availabilityDeadline: null,
        now,
      }),
    ).toBe('slot-select-pending');
  });

  it('prioritises "slot-submitted" even when deadline already passed', () => {
    // 제출한 적이 있다면 마감 이후라도 "제출 완료" 안내가 옳다.
    expect(
      deriveStepperSubState({
        interviewAvailabilityCount: 2,
        availabilityDeadline: '2026-06-01T18:00:00',
        now,
      }),
    ).toBe('slot-submitted');
  });
});
