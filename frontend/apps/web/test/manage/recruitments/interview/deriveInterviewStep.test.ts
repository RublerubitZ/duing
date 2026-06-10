import { describe, it, expect } from 'vitest';
import type { InterviewConfig, SlotListView } from '@duing/types';
import { deriveInterviewStep } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_utils/deriveInterviewStep';

// spec §4 — server state(config + slots) 만으로 step 결정.
// 클라이언트 상태 없음. now 는 테스트 결정성을 위해 주입.
const baseConfig: InterviewConfig = {
  configId: 1,
  availabilityDeadline: '2026-06-18T14:00:00Z',
  assignmentCompletedAt: undefined,
  location: undefined,
  slotLifecyclePhase: 'BEFORE_DEADLINE',
};

const oneSlot: SlotListView[] = [
  { slotId: 1, startTime: '2026-06-19T10:00:00Z', endTime: '2026-06-19T10:30:00Z', capacity: 2, availabilityCount: 0, assignedCount: 0 },
];

describe('deriveInterviewStep', () => {
  it('config 가 없으면 Step 1', () => {
    expect(deriveInterviewStep({ config: null, slots: [] })).toBe(1);
  });

  it('config 가 있고 slots 가 0 개면 Step 2', () => {
    expect(deriveInterviewStep({ config: baseConfig, slots: [] })).toBe(2);
  });

  it('config 가 있고 slots 가 있으나 deadline 전이면 Step 2', () => {
    expect(
      deriveInterviewStep({
        config: baseConfig,
        slots: oneSlot,
        now: new Date('2026-06-17T14:00:00Z'),
      }),
    ).toBe(2);
  });

  it('config 가 있고 slots 가 있고 deadline 이 지났으면 Step 3', () => {
    expect(
      deriveInterviewStep({
        config: baseConfig,
        slots: oneSlot,
        now: new Date('2026-06-19T14:00:00Z'),
      }),
    ).toBe(3);
  });

  it('assignmentCompletedAt 이 있으면 Step 4', () => {
    expect(
      deriveInterviewStep({
        config: { ...baseConfig, assignmentCompletedAt: '2026-06-19T15:00:00Z' },
        slots: oneSlot,
      }),
    ).toBe(4);
  });
});
