// 시설 선택 홈 파생 유틸(§2.2).
import { seoulTimeHHmm } from './facilityTimeline';

/** 두 ISO 날짜(yyyy-MM-dd)를 'M.d ~ M.d' 로 표기. 창 배지·구간 칩이 공유하는 단일 산식. */
export function rangeDatesLabel(startIso: string, endIso: string): string {
  const label = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
  return `${label(startIso)} ~ ${label(endIso)}`;
}

/** ISO 날짜(yyyy-MM-dd)를 'M.d' 로. 오픈일 문구가 공유하는 단일 산식. */
const monthDayLabel = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

/** 홈 카드 오픈 안내(D7). 미래 → "M.d부터 예약 가능", 오늘 이하 → "예약 신청 가능", null → "예약 준비 중"(닫힘), 필드 없음(구 BE) → "예약 신청 가능". */
export function openDateLabel(bookingOpenDate: string | null | undefined, todayIso: string): string {
  if (bookingOpenDate === null) return '예약 준비 중';
  if (bookingOpenDate !== undefined && bookingOpenDate > todayIso) {
    return `${monthDayLabel(bookingOpenDate)}부터 예약 가능`;
  }
  return '예약 신청 가능';
}

/** 창 밖 셀 탭·무효 딥링크 토스트. 빈 창(from > until)은 "아직 열리지 않음" 으로 안내한다. */
export function bookingWindowToastMessage(bookableFrom: string, bookableUntil: string): string {
  if (bookableFrom > bookableUntil) return '아직 예약 신청이 열리지 않았어요';
  return `현재 예약 가능한 기간이 아니에요 (${rangeDatesLabel(bookableFrom, bookableUntil)})`;
}

/** 캘린더 상단 안내줄(D9). 닫힘 → 시설 문구, 오픈일 미래 → 날짜 문구, 그 외 null(표시 없음). */
export function bookingWindowNote(
  bookableFrom: string,
  bookableUntil: string,
  todayIso: string,
): string | null {
  if (bookableFrom > bookableUntil) return '아직 예약 신청을 받지 않는 시설이에요';
  if (bookableFrom > todayIso) return `${monthDayLabel(bookableFrom)}부터 신청할 수 있어요`;
  return null;
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
