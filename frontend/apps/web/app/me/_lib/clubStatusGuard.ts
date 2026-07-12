import type { ClubStatus } from '@duing/types';

/**
 * 알려진 비 ACTIVE 상태 — 마이페이지에서 액션·배너 노출을 막는 기준.
 * status 미제공(구 백엔드 전환기)·미지의 신규 값은 기존 동작 유지(fail-open) —
 * 비 ACTIVE 차단의 1차 방어선은 백엔드 필터(#591)다.
 */
const KNOWN_NON_ACTIVE_STATUSES: ReadonlySet<ClubStatus> = new Set([
  'PENDING_APPROVAL',
  'REJECTED',
  'INACTIVE',
]);

export function isKnownNonActiveClubStatus(status: ClubStatus): boolean {
  return KNOWN_NON_ACTIVE_STATUSES.has(status);
}
