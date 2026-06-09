import type { MatchingCandidatesView } from '@duing/types';

// spec §4.5 — Step 3 자동 배정 dry-run 5 지표.
// `MatchingCandidatesResponse` 는 OpenAPI 상 모든 필드가 optional 로 생성되므로,
// 응답이 도착해도 부분 누락 가능성을 가정하고 안전한 fallback(0) 으로 환산한다.
export type DryRunStats = {
  totalCandidates: number;
  totalCapacity: number;
  expectedAssigned: number;
  expectedUnassigned: number;
  noAvailabilityCount: number;
};

export function calculateDryRunStats(candidates: MatchingCandidatesView): DryRunStats {
  const slots = candidates.slots ?? [];
  // 슬롯별 남은 정원 합산. `capacity - alreadyAssignedCount` 의 음수 가능성은 0 으로 보정.
  const totalCapacity = slots.reduce((sum, slot) => {
    const capacity = slot.capacity ?? 0;
    const alreadyAssigned = slot.alreadyAssignedCount ?? 0;
    const remaining = Math.max(0, capacity - alreadyAssigned);
    return sum + remaining;
  }, 0);

  const candidatesWithAvailability = candidates.candidatesWithAvailability ?? 0;
  const expectedAssigned = Math.min(candidatesWithAvailability, totalCapacity);
  const expectedUnassigned = Math.max(0, candidatesWithAvailability - totalCapacity);

  return {
    totalCandidates: candidates.totalCandidates ?? 0,
    totalCapacity,
    expectedAssigned,
    expectedUnassigned,
    noAvailabilityCount: candidates.candidatesWithoutAvailability ?? 0,
  };
}
