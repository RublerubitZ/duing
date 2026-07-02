import type { ReservationSlot, ReservationStatus } from '@duing/types';

// 타임라인 시간 축: 09:00 ~ 22:00 (학생회관 운영시간).
export const AXIS_START_HOUR = 9;
export const AXIS_END_HOUR = 22;
export const TIMELINE_HOURS: number[] = Array.from(
  { length: AXIS_END_HOUR - AXIS_START_HOUR + 1 },
  (_, index) => AXIS_START_HOUR + index,
);

export type TimelineSegment = {
  organization: string;
  status: ReservationStatus;
  startLabel: string; // 원본 HH:mm
  endLabel: string; // 원본 HH:mm
  startMinutes: number; // 축 기준(클램프)
  endMinutes: number; // 축 기준(클램프)
  leftPct: number;
  widthPct: number;
};

function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

// 해당 날짜의 예약을 09~22 축 위 세그먼트로 변환. 축을 벗어난 구간은 클램프하고,
// 축과 겹치지 않는 슬롯은 제거하며 시작시각 오름차순 정렬한다. (병합은 백엔드가 이미 수행)
export function buildTimelineSegments(
  reservations: ReservationSlot[],
  date: string,
): TimelineSegment[] {
  const axisStart = AXIS_START_HOUR * 60;
  const axisEnd = AXIS_END_HOUR * 60;
  const axisSpan = axisEnd - axisStart;

  return reservations
    .filter((slot) => slot.date === date)
    .map((slot) => {
      const clampedStart = Math.max(toMinutes(slot.start), axisStart) - axisStart;
      const clampedEnd = Math.min(toMinutes(slot.end), axisEnd) - axisStart;
      const segment: TimelineSegment = {
        organization: slot.organization,
        status: slot.status,
        startLabel: slot.start,
        endLabel: slot.end,
        startMinutes: clampedStart,
        endMinutes: clampedEnd,
        leftPct: (clampedStart / axisSpan) * 100,
        widthPct: ((clampedEnd - clampedStart) / axisSpan) * 100,
      };
      return segment;
    })
    .filter((segment) => segment.endMinutes > segment.startMinutes)
    .sort((left, right) => left.startMinutes - right.startMinutes);
}

// 현재시각(분/일)을 축 위 위치(%)로. 축을 벗어나면 null(인디케이터 미표시).
export function timelineIndicatorPct(minutesOfDay: number): number | null {
  const axisStart = AXIS_START_HOUR * 60;
  const axisEnd = AXIS_END_HOUR * 60;
  if (minutesOfDay < axisStart || minutesOfDay > axisEnd) return null;
  return ((minutesOfDay - axisStart) / (axisEnd - axisStart)) * 100;
}

// Asia/Seoul 기준 오늘의 '분(minute of day)'. prod JVM/CI 타임존과 무관하게 KST wall-clock.
export function seoulMinutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return read('hour') * 60 + read('minute');
}

// Asia/Seoul 기준 오늘 날짜(YYYY-MM-DD).
export function seoulDateIso(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

// YYYY-MM 의 일수.
export function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(year ?? 1970, month ?? 1, 0).getDate();
}

// 'HH:mm~HH:mm' 시간 구간 라벨.
export function slotTimeRange(slot: ReservationSlot): string {
  return `${slot.start}~${slot.end}`;
}

// nextReservation 은 '월 내 가장 이른 예약'이라 오늘이 아닐 수 있다 — 오늘이 아니면 날짜(M/D)를 함께 표기해
// 오늘 예약으로 오인되지 않게 한다. todayIso 는 seoulDateIso(now) 로 계산해 넘긴다(KST wall-clock).
export function nextSlotLabel(slot: ReservationSlot, todayIso: string): string {
  if (slot.date === todayIso) return slotTimeRange(slot);
  const [, month, day] = slot.date.split('-');
  return `${Number(month)}/${Number(day)} ${slotTimeRange(slot)}`;
}

// 'YYYY-MM' → 0000년 1월 기준 연속 개월 인덱스(월 이동·경계 계산용 내부 헬퍼).
function yearMonthIndex(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  return (year ?? 0) * 12 + ((month ?? 1) - 1);
}

// 두 'YYYY-MM' 사이 개월 차(to - from). 예: ('2026-07', '2026-08') → 1, ('2026-07', '2025-07') → -12.
export function monthDiff(fromYearMonth: string, toYearMonth: string): number {
  return yearMonthIndex(toYearMonth) - yearMonthIndex(fromYearMonth);
}

// 'YYYY-MM' 에 개월을 더한 'YYYY-MM'. 연 경계·음수 delta 모두 안전.
export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const index = yearMonthIndex(yearMonth) + deltaMonths;
  const year = Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

// 'YYYY-MM' → 'YYYY년 M월' 표시 라벨.
export function yearMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${year}년 ${month}월`;
}

// lastUpdatedAt(+09:00 ISO)를 'YYYY-MM-DD HH:mm'(KST)로 표시. 콜드/미수집(null) 은 빈 문자열.
export function formatLastUpdated(iso: string | null): string {
  if (!iso) return ''; // null/빈 값: new Date(null)=epoch(0) 은 NaN 이 아니라 1970 이 되므로 먼저 차단
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}`;
}
