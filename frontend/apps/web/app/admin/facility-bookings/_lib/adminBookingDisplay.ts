// 관리자 콘솔 전용 파생 — 크롤 신선도·409 payload 가드·검증 컨텍스트 슬롯 스트립(§9.7·§8.3)
import { parseKstInstant } from '@duing/hooks/datetime';
import type { AdminBookingOverlapItem, AdminFacilityBookingCounts, FacilityBookingConflictPayload } from '@duing/types';

export function crawlFreshnessLabel(crawlBasisAt: string | undefined, now: Date): string {
  if (!crawlBasisAt) return '수집 정보 없음';
  // crawlBasisAt 은 Event Time(`…Z` 절대시각, 구버전은 무오프셋) — 브라우저 존 의존 파싱 대신 공통 규칙으로 흡수한다.
  const basis = parseKstInstant(crawlBasisAt);
  if (Number.isNaN(basis.getTime())) return '수집 정보 없음';
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - basis.getTime()) / 60_000));
  if (elapsedMinutes < 60) return `마지막 수집 ${elapsedMinutes}분 전`;
  return `마지막 수집 ${Math.floor(elapsedMinutes / 60)}시간 전`;
}

function isConflictSlot(candidate: unknown): candidate is FacilityBookingConflictPayload['conflicts'][number] {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'source' in candidate &&
    typeof candidate.source === 'string' &&
    'organization' in candidate &&
    typeof candidate.organization === 'string' &&
    'start' in candidate &&
    typeof candidate.start === 'string' &&
    'end' in candidate &&
    typeof candidate.end === 'string'
  );
}

export function isFacilityBookingConflictPayload(payload: unknown): payload is FacilityBookingConflictPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  if (!('conflicts' in payload) || !Array.isArray(payload.conflicts)) return false;
  if (!payload.conflicts.every(isConflictSlot)) return false;
  if (!('crawlBasisAt' in payload)) return false;
  return payload.crawlBasisAt === null || typeof payload.crawlBasisAt === 'string';
}

export type SlotStripCell = { hour: number; inRequest: boolean; overlapSource: string | null };

export function buildSlotStrip(input: {
  startTime: string;
  endTime: string;
  overlaps: Pick<AdminBookingOverlapItem, 'source' | 'organization' | 'startTime' | 'endTime'>[];
}): SlotStripCell[] {
  const requestStart = Number(input.startTime.slice(0, 2));
  const requestEnd = Number(input.endTime.slice(0, 2));
  return Array.from({ length: 13 }, (_, index) => {
    const hour = 9 + index;
    const overlap = input.overlaps.find(
      (item) => Number(item.startTime.slice(0, 2)) <= hour && hour < Number(item.endTime.slice(0, 2)),
    );
    return {
      hour,
      inRequest: requestStart <= hour && hour < requestEnd,
      overlapSource: overlap ? overlap.source : null,
    };
  });
}

export function conflictCardCount(counts: AdminFacilityBookingCounts): number {
  return counts.conflictCount + counts.conflictSuspectedCount;
}
