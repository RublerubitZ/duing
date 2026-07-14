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
