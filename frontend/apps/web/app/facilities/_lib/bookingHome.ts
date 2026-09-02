// 시설 선택 홈 파생 유틸(§2.2).
import type { FacilityBookingWindow } from '@duing/types';
import { seoulTimeHHmm } from './facilityTimeline';

/** 두 ISO 날짜(yyyy-MM-dd)를 'M.d ~ M.d' 로 표기. 창 배지·구간 칩이 공유하는 단일 산식. */
export function rangeDatesLabel(startIso: string, endIso: string): string {
  const label = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
  return `${label(startIso)} ~ ${label(endIso)}`;
}

export function windowRangeLabel(window: FacilityBookingWindow): string {
  return rangeDatesLabel(window.bookableFrom, window.bookableUntil);
}

const OPEN_HOUR = 9;
const CLOSE_HOUR = 22;

// FacilityItem.reservations(ReservationSlot)의 실제 시간 필드는 start/end(HH:mm)다 — 구조적 최소 계약.
type ReservationSlice = { start: string; end: string };

/** 오늘 남은 슬롯(현재 시각 이후 시작) 중 예약이 덮지 않은 수. 영업 종료 후엔 null. */
export function todayFreeSlotCount(reservations: ReservationSlice[], now: Date): number | null {
  // 호출부(FacilityHomeCard)가 오늘 예약을 KST 날짜로 거르므로 시각도 KST 로 읽는다(P2-18). 시·분은
  // seoulTimeHHmm(KST 변환), 초는 getSeconds() — 모든 UTC 오프셋이 분 단위라 초는 타임존과 무관하다.
  const [seoulHour = 0, seoulMinute = 0] = seoulTimeHHmm(now).split(':').map(Number);
  const hourInProgress = seoulMinute > 0 || now.getSeconds() > 0;
  const firstRemainingHour = Math.max(OPEN_HOUR, hourInProgress ? seoulHour + 1 : seoulHour);
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
