// 시설 선택 홈 파생 유틸(§2.2).
import type { FacilityBookingWindow } from '@duing/types';

export function windowRangeLabel(window: FacilityBookingWindow): string {
  const label = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
  return `${label(window.bookableFrom)} ~ ${label(window.bookableUntil)}`;
}

const OPEN_HOUR = 9;
const CLOSE_HOUR = 22;

// FacilityItem.reservations(ReservationSlot)의 실제 시간 필드는 start/end(HH:mm)다 — 구조적 최소 계약.
type ReservationSlice = { start: string; end: string };

/** 오늘 남은 슬롯(현재 시각 이후 시작) 중 예약이 덮지 않은 수. 영업 종료 후엔 null. */
export function todayFreeSlotCount(reservations: ReservationSlice[], now: Date): number | null {
  const firstRemainingHour = Math.max(OPEN_HOUR, now.getMinutes() > 0 || now.getSeconds() > 0
    ? now.getHours() + 1
    : now.getHours());
  if (firstRemainingHour >= CLOSE_HOUR) return null;
  let freeCount = 0;
  for (let hour = firstRemainingHour; hour < CLOSE_HOUR; hour += 1) {
    const covered = reservations.some((reservation) => {
      const startHour = Number(reservation.start.slice(0, 2));
      const endHour = Number(reservation.end.slice(0, 2));
      return startHour <= hour && hour < endHour;
    });
    if (!covered) freeCount += 1;
  }
  return freeCount;
}
