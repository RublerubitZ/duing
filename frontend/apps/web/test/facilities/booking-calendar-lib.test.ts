import { describe, expect, it } from 'vitest';
import type { BookingAvailabilitySlot } from '@duing/types';
import {
  buildMonthCells,
  isWithinBookable,
  rangeContainsPendingHold,
  rangeLabel,
  slotInRange,
  toggleSlotSelection,
  weekDatesOf,
} from '@/app/facilities/_lib/bookingCalendar';

function slot(startHour: number, status: BookingAvailabilitySlot['status']): BookingAvailabilitySlot {
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start: `${pad(startHour)}:00`, end: `${pad(startHour + 1)}:00`, status };
}

// 고정 길이 튜플 — 레포 tsconfig 의 noUncheckedIndexedAccess 하에서 리터럴 인덱스 접근(daySlots[0] 등)이
// `... | undefined` 로 넓어지지 않게 한다(테스트 단언·런타임 동작은 브리프 그대로).
const daySlots: [
  BookingAvailabilitySlot,
  BookingAvailabilitySlot,
  BookingAvailabilitySlot,
  BookingAvailabilitySlot,
  BookingAvailabilitySlot,
] = [
  slot(9, 'AVAILABLE'),
  slot(10, 'AVAILABLE'),
  slot(11, 'BLOCKED'),
  slot(12, 'PENDING_HOLD'),
  slot(13, 'AVAILABLE'),
];

describe('buildMonthCells', () => {
  it('6×7 그리드를 일요일 시작으로 만들고 해당 월 날짜 수만 inMonth 다', () => {
    const cells = buildMonthCells('2026-07'); // 2026-07-01 은 수요일(dow=3)
    expect(cells).toHaveLength(42);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(cells[3]).toMatchObject({ iso: '2026-07-01', day: 1, inMonth: true });
    expect(cells[0]?.inMonth).toBe(false); // ?.: noUncheckedIndexedAccess 하 배열 인덱스는 `| undefined`
  });
});

describe('toggleSlotSelection', () => {
  it('첫 탭은 단일 선택, 같은 단일 슬롯 재탭은 해제다', () => {
    const first = toggleSlotSelection(null, daySlots[0], daySlots);
    expect(first).toEqual({ start: '09:00', end: '10:00' });
    expect(toggleSlotSelection(first, daySlots[0], daySlots)).toBeNull();
  });

  it('사이가 전부 선택 가능하면 범위로 확장한다 (PENDING_HOLD 포함 가능)', () => {
    const first = toggleSlotSelection(null, daySlots[3], daySlots); // 12~13 HOLD
    const expanded = toggleSlotSelection(first, daySlots[4], daySlots); // 13~14
    expect(expanded).toEqual({ start: '12:00', end: '14:00' });
  });

  it('사이에 차단 슬롯이 있으면 탭한 슬롯으로 재시작한다', () => {
    const first = toggleSlotSelection(null, daySlots[0], daySlots); // 09~10
    const restarted = toggleSlotSelection(first, daySlots[3], daySlots); // 11시가 BLOCKED
    expect(restarted).toEqual({ start: '12:00', end: '13:00' });
  });

  it('차단·과거 슬롯 탭은 무시된다', () => {
    const current = { start: '09:00', end: '10:00' };
    expect(toggleSlotSelection(current, daySlots[2], daySlots)).toEqual(current);
  });
});

describe('range 유틸', () => {
  it('rangeContainsPendingHold 는 범위 내 승인 대기 슬롯을 감지한다', () => {
    expect(rangeContainsPendingHold(daySlots, { start: '12:00', end: '14:00' })).toBe(true);
    expect(rangeContainsPendingHold(daySlots, { start: '09:00', end: '11:00' })).toBe(false);
  });

  it('rangeLabel 과 slotInRange', () => {
    expect(rangeLabel({ start: '18:00', end: '20:00' })).toBe('18:00~20:00');
    expect(slotInRange(daySlots[0], { start: '09:00', end: '11:00' })).toBe(true);
    expect(slotInRange(daySlots[4], { start: '09:00', end: '11:00' })).toBe(false);
  });
});

describe('weekDatesOf / isWithinBookable', () => {
  it('선택일이 속한 주(일~토)를 로컬 파싱으로 만든다 — 월 경계 포함', () => {
    expect(weekDatesOf('2026-07-01')).toEqual([
      '2026-06-28', '2026-06-29', '2026-06-30', '2026-07-01',
      '2026-07-02', '2026-07-03', '2026-07-04',
    ]);
  });

  it('isWithinBookable 은 경계 포함이다', () => {
    expect(isWithinBookable('2026-07-13', '2026-07-13', '2026-08-31')).toBe(true);
    expect(isWithinBookable('2026-08-31', '2026-07-13', '2026-08-31')).toBe(true);
    expect(isWithinBookable('2026-07-12', '2026-07-13', '2026-08-31')).toBe(false);
  });
});
