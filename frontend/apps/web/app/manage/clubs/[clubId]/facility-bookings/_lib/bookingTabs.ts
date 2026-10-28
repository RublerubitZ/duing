// 동아리 예약 관리 2탭 분류(§3). 진행중 = 아직 액션/이용이 남은 것(대기·승인·충돌 + 미래 확정).
import type { BookingStatus, FacilityBookingSummary } from '@duing/types';

export const MANAGE_TAB_KEYS = ['ACTIVE', 'PAST'] as const;
export type ManageTabKey = (typeof MANAGE_TAB_KEYS)[number];

export const MANAGE_TAB_LABELS: Record<ManageTabKey, string> = {
  ACTIVE: '진행중',
  PAST: '지난 예약',
};

const ALWAYS_ACTIVE: readonly BookingStatus[] = ['PENDING', 'APPROVED', 'CONFLICT'];

export function manageTabOf(
  booking: Pick<FacilityBookingSummary, 'status' | 'date'>,
  todayIso: string,
): ManageTabKey {
  if (ALWAYS_ACTIVE.includes(booking.status)) return 'ACTIVE';
  if (booking.status === 'CONFIRMED') return booking.date >= todayIso ? 'ACTIVE' : 'PAST';
  return 'PAST';
}

/** `?tab=past` → 지난 예약 탭(운영진 홈의 거절 예약 행). 그 외는 진행중. 탭을 바꿔도 주소는 고치지 않는다. */
export function parseManageTab(value: string | string[] | undefined): ManageTabKey {
  return value === 'past' ? 'PAST' : 'ACTIVE';
}
