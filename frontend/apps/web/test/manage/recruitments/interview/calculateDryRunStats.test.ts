import { describe, it, expect } from 'vitest';
import type { MatchingCandidatesView } from '@duing/types';
import { calculateDryRunStats } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_utils/calculateDryRunStats';

// spec §4.5 — Step 3 dry-run 5 지표. capacity 가 충분/부족/0 인 경계와
// 모든 후보가 availability 미제출인 케이스를 검증한다.

function makeCandidates(overrides: Partial<MatchingCandidatesView>): MatchingCandidatesView {
  return {
    totalCandidates: 0,
    candidatesWithAvailability: 0,
    candidatesWithoutAvailability: 0,
    slots: [],
    ...overrides,
  };
}

describe('calculateDryRunStats', () => {
  it('capacity 가 충분하면 expectedAssigned = candidatesWithAvailability, expectedUnassigned = 0', () => {
    const stats = calculateDryRunStats(
      makeCandidates({
        totalCandidates: 10,
        candidatesWithAvailability: 8,
        candidatesWithoutAvailability: 2,
        slots: [
          { slotId: 1, startTime: '', capacity: 5, availabilityCount: 4, alreadyAssignedCount: 0 },
          { slotId: 2, startTime: '', capacity: 5, availabilityCount: 4, alreadyAssignedCount: 0 },
        ],
      }),
    );

    expect(stats).toEqual({
      totalCandidates: 10,
      totalCapacity: 10,
      expectedAssigned: 8,
      expectedUnassigned: 0,
      noAvailabilityCount: 2,
    });
  });

  it('capacity 가 부족하면 expectedAssigned = totalCapacity, expectedUnassigned > 0', () => {
    const stats = calculateDryRunStats(
      makeCandidates({
        totalCandidates: 10,
        candidatesWithAvailability: 8,
        candidatesWithoutAvailability: 2,
        slots: [
          { slotId: 1, startTime: '', capacity: 2, availabilityCount: 4, alreadyAssignedCount: 0 },
          { slotId: 2, startTime: '', capacity: 3, availabilityCount: 4, alreadyAssignedCount: 0 },
        ],
      }),
    );

    expect(stats.totalCapacity).toBe(5);
    expect(stats.expectedAssigned).toBe(5);
    expect(stats.expectedUnassigned).toBe(3);
  });

  it('이미 모두 배정되어 남은 capacity 가 0 이면 expectedAssigned = 0', () => {
    const stats = calculateDryRunStats(
      makeCandidates({
        totalCandidates: 5,
        candidatesWithAvailability: 5,
        candidatesWithoutAvailability: 0,
        slots: [
          { slotId: 1, startTime: '', capacity: 2, availabilityCount: 3, alreadyAssignedCount: 2 },
          { slotId: 2, startTime: '', capacity: 3, availabilityCount: 3, alreadyAssignedCount: 3 },
        ],
      }),
    );

    expect(stats.totalCapacity).toBe(0);
    expect(stats.expectedAssigned).toBe(0);
    expect(stats.expectedUnassigned).toBe(5);
  });

  it('모든 후보가 availability 미제출이면 expectedAssigned = 0, noAvailabilityCount 가 전체', () => {
    const stats = calculateDryRunStats(
      makeCandidates({
        totalCandidates: 4,
        candidatesWithAvailability: 0,
        candidatesWithoutAvailability: 4,
        slots: [
          { slotId: 1, startTime: '', capacity: 5, availabilityCount: 0, alreadyAssignedCount: 0 },
        ],
      }),
    );

    expect(stats).toEqual({
      totalCandidates: 4,
      totalCapacity: 5,
      expectedAssigned: 0,
      expectedUnassigned: 0,
      noAvailabilityCount: 4,
    });
  });
});
