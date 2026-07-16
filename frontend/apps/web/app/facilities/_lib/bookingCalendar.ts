// 예약 홈의 순수 계산 — 시각/날짜 문자열('HH:mm'·'yyyy-MM-dd')은 사전순 비교가 시간순과 일치한다.
// Date 파싱은 로컬 필드 생성만 사용한다(new Date('yyyy-MM-dd') 는 UTC 자정 함정).
import type { BookingAvailabilitySlot } from '@duing/types';

export type CalendarCell = { iso: string; day: number; inMonth: boolean };
export type SlotRange = { start: string; end: string };

const pad2 = (value: number) => String(value).padStart(2, '0');

const toIso = (year: number, monthIndex: number, day: number) =>
  `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** 6×7(월요일 시작 — 주간 타임라인과 일관) 월 그리드 — calendar 페이지 buildMonth 전례 이식. */
export function buildMonthCells(yearMonth: string): CalendarCell[] {
  const [year, month] = yearMonth.split('-').map(Number);
  const monthIndex = (month ?? 1) - 1;
  const startCol = (new Date(year ?? 1970, monthIndex, 1).getDay() + 6) % 7; // 월=0 … 일=6
  const daysInMonth = new Date(year ?? 1970, monthIndex + 1, 0).getDate();
  const prevDays = new Date(year ?? 1970, monthIndex, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const offset = index - startCol;
    let day: number;
    let cellMonth = monthIndex;
    let cellYear = year ?? 1970;
    let inMonth = true;
    if (offset < 0) {
      day = prevDays + offset + 1;
      cellMonth = monthIndex - 1;
      inMonth = false;
    } else if (offset >= daysInMonth) {
      day = offset - daysInMonth + 1;
      cellMonth = monthIndex + 1;
      inMonth = false;
    } else {
      day = offset + 1;
    }
    if (cellMonth < 0) {
      cellMonth = 11;
      cellYear -= 1;
    }
    if (cellMonth > 11) {
      cellMonth = 0;
      cellYear += 1;
    }
    cells.push({ iso: toIso(cellYear, cellMonth, day), day, inMonth });
  }
  return cells;
}

export function isWithinBookable(iso: string, bookableFrom: string, bookableUntil: string): boolean {
  return iso >= bookableFrom && iso <= bookableUntil;
}

export function isSelectableSlot(slot: BookingAvailabilitySlot): boolean {
  return slot.status === 'AVAILABLE' || slot.status === 'PENDING_HOLD';
}

export function slotInRange(slot: BookingAvailabilitySlot, range: SlotRange): boolean {
  return slot.start >= range.start && slot.end <= range.end;
}

/**
 * 연속 슬롯 선택(§9.4): 첫 탭=단일, 둘째 탭=사이 전부 선택 가능이면 범위 확장, 아니면 재시작,
 * 선택 범위 내부 슬롯 재탭=그 슬롯부터 끝까지 해제(첫 슬롯이면 전체 해제). 선택 불가 슬롯 탭은 무시.
 */
export function toggleSlotSelection(
  current: SlotRange | null,
  tapped: BookingAvailabilitySlot,
  slots: BookingAvailabilitySlot[],
): SlotRange | null {
  if (!isSelectableSlot(tapped)) {
    return current;
  }
  const single: SlotRange = { start: tapped.start, end: tapped.end };
  if (!current) {
    return single;
  }
  if (slotInRange(tapped, current)) {
    // 선택된 슬롯 재탭 = 그 슬롯부터 끝까지 해제(첫 슬롯이면 전체 해제) — 연속 범위 계약 유지
    return tapped.start === current.start ? null : { start: current.start, end: tapped.start };
  }
  const start = current.start < single.start ? current.start : single.start;
  const end = current.end > single.end ? current.end : single.end;
  const span = slots.filter((candidate) => slotInRange(candidate, { start, end }));
  const hourCount = Number(end.slice(0, 2)) - Number(start.slice(0, 2));
  if (span.length === hourCount && span.every(isSelectableSlot)) {
    return { start, end };
  }
  return single;
}

export function rangeContainsPendingHold(
  slots: BookingAvailabilitySlot[],
  range: SlotRange,
): boolean {
  return slots.some((slot) => slotInRange(slot, range) && slot.status === 'PENDING_HOLD');
}

export function rangeLabel(range: SlotRange): string {
  return `${range.start}~${range.end}`;
}

/** 선택일이 속한 주(월~일) 7일 — 월 경계를 넘을 수 있다(범위 밖 날짜는 호출부가 데이터 없음 처리). */
export function weekDatesOf(iso: string): string[] {
  const base = parseIsoDate(iso);
  const dayOfWeek = base.getDay();
  const mondayOffset = (dayOfWeek + 6) % 7; // 일=0→6, 월=1→0, … 토=6→5
  const monday = new Date(base);
  monday.setDate(base.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    return toIso(date.getFullYear(), date.getMonth(), date.getDate());
  });
}

// ── 예약 홈 히트맵·패널 요약 파생(§2.2) — 하루 13칸(09~22시) 기준 ─────────────

export type DayLevel = 'HIGH' | 'MID' | 'LOW' | 'FULL';

export const TOTAL_SLOTS = 13;

export function dayLevelOf(availableSlotCount: number): DayLevel {
  const ratio = availableSlotCount / TOTAL_SLOTS;
  if (ratio >= 0.6) return 'HIGH';
  if (ratio >= 0.3) return 'MID';
  if (availableSlotCount > 0) return 'LOW';
  return 'FULL';
}

export const DAY_LEVEL_META: Record<DayLevel, { label: string; barClass: string; textClass: string }> = {
  HIGH: { label: '여유', barClass: 'bg-sage', textClass: 'text-ink' },
  MID: { label: '보통', barClass: 'bg-warm', textClass: 'text-[#8E6620]' },
  LOW: { label: '혼잡', barClass: 'bg-coral', textClass: 'text-coral' },
  FULL: { label: '마감', barClass: 'bg-line', textClass: 'text-charcoal-3' },
};

export type PeriodDistribution = {
  key: 'MORNING' | 'AFTERNOON' | 'EVENING';
  label: string;
  range: string;
  free: number;
  total: number;
};

export function periodDistribution(slots: BookingAvailabilitySlot[]): PeriodDistribution[] {
  const periods: { key: PeriodDistribution['key']; label: string; range: string; fromHour: number; toHour: number }[] = [
    { key: 'MORNING', label: '오전', range: '09–12', fromHour: 9, toHour: 12 },
    { key: 'AFTERNOON', label: '오후', range: '12–18', fromHour: 12, toHour: 18 },
    { key: 'EVENING', label: '저녁', range: '18–22', fromHour: 18, toHour: 22 },
  ];
  return periods.map(({ key, label, range, fromHour, toHour }) => {
    const inPeriod = slots.filter((slot) => {
      const hour = Number(slot.start.slice(0, 2));
      return fromHour <= hour && hour < toHour;
    });
    return {
      key, label, range,
      free: inPeriod.filter((slot) => slot.status === 'AVAILABLE').length,
      total: inPeriod.length,
    };
  });
}

export function firstAvailableStarts(slots: BookingAvailabilitySlot[], max: number): string[] {
  return slots.filter((slot) => slot.status === 'AVAILABLE').slice(0, max).map((slot) => slot.start);
}
