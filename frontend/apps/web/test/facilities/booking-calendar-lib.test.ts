import { describe, expect, it } from 'vitest';
import type { BookingAvailabilitySlot, BookingOperatingNote } from '@duing/types';
import {
  buildMonthCells,
  DAY_LEVEL_META,
  dayBookingEntries,
  dayLevelOf,
  dayOverviewTimeline,
  isWithinBookable,
  periodDistribution,
  rangeContainsPendingHold,
  rangeLabel,
  slotInRange,
  slotStatusCounts,
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

// 저녁 연속 3칸(18~21시) — 선택 범위 내부 슬롯 재탭 해제 규칙 검증용.
// 인덱스 접근(noUncheckedIndexedAccess) 회피를 위해 슬롯을 개별 상수로 둔다.
const eveningSlot18: BookingAvailabilitySlot = slot(18, 'AVAILABLE'); // 18:00~19:00
const eveningSlot19: BookingAvailabilitySlot = slot(19, 'AVAILABLE'); // 19:00~20:00
const eveningSlot20: BookingAvailabilitySlot = slot(20, 'AVAILABLE'); // 20:00~21:00
const eveningSlots: BookingAvailabilitySlot[] = [eveningSlot18, eveningSlot19, eveningSlot20];

describe('buildMonthCells', () => {
  it('6×7 그리드를 월요일 시작으로 만들고 해당 월 날짜 수만 inMonth 다', () => {
    const cells = buildMonthCells('2026-07'); // 2026-07-01 은 수요일(dow=3) → 월 시작 startCol=2
    expect(cells).toHaveLength(42);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(cells[2]).toMatchObject({ iso: '2026-07-01', day: 1, inMonth: true });
    expect(cells[0]).toMatchObject({ iso: '2026-06-29', day: 29, inMonth: false }); // 월요일 = 그 주 첫 칸
    expect(cells[1]?.inMonth).toBe(false); // ?.: noUncheckedIndexedAccess 하 배열 인덱스는 `| undefined`
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

  it('다중 범위에서 마지막 슬롯을 재탭하면 그 슬롯만 해제된다', () => {
    const current = { start: '18:00', end: '20:00' }; // 18~20 선택 중
    expect(toggleSlotSelection(current, eveningSlot19, eveningSlots)).toEqual({ start: '18:00', end: '19:00' });
  });

  it('다중 범위에서 중간 슬롯을 재탭하면 그 지점부터 끝까지 해제된다', () => {
    const current = { start: '18:00', end: '21:00' }; // 18~21 선택 중
    expect(toggleSlotSelection(current, eveningSlot19, eveningSlots)).toEqual({ start: '18:00', end: '19:00' });
  });

  it('다중 범위에서 첫 슬롯을 재탭하면 전체가 해제된다', () => {
    const current = { start: '18:00', end: '20:00' }; // 18~20 선택 중
    expect(toggleSlotSelection(current, eveningSlot18, eveningSlots)).toBeNull();
  });

  it('범위 안의 승인 대기 슬롯 재탭도 동일하게 그 지점부터 해제된다', () => {
    const current = { start: '12:00', end: '14:00' }; // 12~13 HOLD 포함 범위
    expect(toggleSlotSelection(current, daySlots[4], daySlots)).toEqual({ start: '12:00', end: '13:00' }); // 13~14 재탭
    expect(toggleSlotSelection(current, daySlots[3], daySlots)).toBeNull(); // 첫 슬롯(HOLD) 재탭 = 전체 해제
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
  it('선택일이 속한 주(월~일)를 로컬 파싱으로 만든다 — 월 경계 포함', () => {
    expect(weekDatesOf('2026-07-01')).toEqual([ // 수요일
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
      '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
  });

  it('일요일 입력은 그 주의 마지막 날이라 같은 주(월 시작)를 만든다', () => {
    expect(weekDatesOf('2026-07-05')).toEqual([ // 일요일
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
      '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
  });

  it('isWithinBookable 은 경계 포함이다', () => {
    expect(isWithinBookable('2026-07-13', '2026-07-13', '2026-08-31')).toBe(true);
    expect(isWithinBookable('2026-08-31', '2026-07-13', '2026-08-31')).toBe(true);
    expect(isWithinBookable('2026-07-12', '2026-07-13', '2026-08-31')).toBe(false);
  });
});

describe('dayLevelOf', () => {
  it('가용 칸 비율로 여유/보통/혼잡/마감을 나눈다', () => {
    expect(dayLevelOf(13)).toBe('HIGH'); // 1.0
    expect(dayLevelOf(8)).toBe('HIGH'); // ≥0.6
    expect(dayLevelOf(7)).toBe('MID'); // ≥0.3
    expect(dayLevelOf(4)).toBe('MID');
    expect(dayLevelOf(3)).toBe('LOW'); // >0
    expect(dayLevelOf(1)).toBe('LOW');
    expect(dayLevelOf(0)).toBe('FULL');
    expect(DAY_LEVEL_META.HIGH.label).toBe('여유');
    expect(DAY_LEVEL_META.FULL.label).toBe('마감');
  });
});

describe('slotStatusCounts', () => {
  it('혼합 슬롯을 상태별로 집계한다', () => {
    const mixed: BookingAvailabilitySlot[] = [
      slot(9, 'AVAILABLE'),
      slot(10, 'AVAILABLE'),
      slot(11, 'BLOCKED'),
      slot(12, 'PENDING_HOLD'),
      slot(13, 'PAST'),
    ];
    expect(slotStatusCounts(mixed)).toEqual({ available: 2, pendingHold: 1, blocked: 1, past: 1 });
  });
});

describe('dayBookingEntries', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const schoolSlot = (startHour: number, organization: string): BookingAvailabilitySlot => ({
    start: `${pad(startHour)}:00`,
    end: `${pad(startHour + 1)}:00`,
    status: 'BLOCKED',
    blockedBy: 'SCHOOL',
    organization,
  });
  const internalSlot = (startHour: number): BookingAvailabilitySlot => ({
    start: `${pad(startHour)}:00`,
    end: `${pad(startHour + 1)}:00`,
    status: 'BLOCKED',
    blockedBy: 'INTERNAL',
  });
  const namedInternalSlot = (startHour: number, organization: string): BookingAvailabilitySlot => ({
    start: `${pad(startHour)}:00`,
    end: `${pad(startHour + 1)}:00`,
    status: 'BLOCKED',
    blockedBy: 'INTERNAL',
    organization,
  });
  const pendingSlot = (startHour: number): BookingAvailabilitySlot => ({
    start: `${pad(startHour)}:00`,
    end: `${pad(startHour + 1)}:00`,
    status: 'PENDING_HOLD',
  });

  it('(a) 같은 단체 연속 3칸은 한 건(09:00~12:00)으로 병합한다', () => {
    expect(
      dayBookingEntries([schoolSlot(9, '비호응원단'), schoolSlot(10, '비호응원단'), schoolSlot(11, '비호응원단')]),
    ).toEqual([{ start: '09:00', end: '12:00', label: '비호응원단', kind: 'SCHOOL' }]);
  });

  it('(b) 다른 단체가 인접하면 병합하지 않는다', () => {
    expect(dayBookingEntries([schoolSlot(9, '비호응원단'), schoolSlot(10, '트레몰로')])).toEqual([
      { start: '09:00', end: '10:00', label: '비호응원단', kind: 'SCHOOL' },
      { start: '10:00', end: '11:00', label: '트레몰로', kind: 'SCHOOL' },
    ]);
  });

  it('(c) organization 없는 INTERNAL(구 백엔드)은 "예약됨" 폴백으로 한 건 병합한다(fail-open)', () => {
    expect(dayBookingEntries([internalSlot(9), internalSlot(10)])).toEqual([
      { start: '09:00', end: '11:00', label: '예약됨', kind: 'INTERNAL' },
    ]);
  });

  it('(f) organization 이 실린 INTERNAL 은 소스 무관 동아리명으로 표기·병합한다(정책 반전)', () => {
    expect(dayBookingEntries([namedInternalSlot(9, '두잉밴드'), namedInternalSlot(10, '두잉밴드')])).toEqual([
      { start: '09:00', end: '11:00', label: '두잉밴드', kind: 'INTERNAL' },
    ]);
  });

  it('(g) INTERNAL 이라도 이름이 다르면 병합하지 않는다(병합은 label 기준)', () => {
    expect(dayBookingEntries([namedInternalSlot(9, '두잉밴드'), namedInternalSlot(10, '고정관념')])).toEqual([
      { start: '09:00', end: '10:00', label: '두잉밴드', kind: 'INTERNAL' },
      { start: '10:00', end: '11:00', label: '고정관념', kind: 'INTERNAL' },
    ]);
  });

  it('(d) 사이가 예약 가능으로 끊기면 같은 단체라도 두 건이다', () => {
    expect(
      dayBookingEntries([schoolSlot(9, '비호응원단'), slot(10, 'AVAILABLE'), schoolSlot(11, '비호응원단')]),
    ).toEqual([
      { start: '09:00', end: '10:00', label: '비호응원단', kind: 'SCHOOL' },
      { start: '11:00', end: '12:00', label: '비호응원단', kind: 'SCHOOL' },
    ]);
  });

  it('(e) 예약 가능·지난 시간만 있으면 빈 배열이다', () => {
    expect(dayBookingEntries([slot(9, 'AVAILABLE'), slot(10, 'PAST'), slot(11, 'AVAILABLE')])).toEqual([]);
  });

  it('승인 대기(PENDING_HOLD)는 "승인 대기" 건으로 병합·추출하고 지난 시간·예약 가능은 제외한다', () => {
    expect(
      dayBookingEntries([slot(9, 'PAST'), pendingSlot(10), pendingSlot(11), slot(12, 'AVAILABLE')]),
    ).toEqual([{ start: '10:00', end: '12:00', label: '승인 대기', kind: 'PENDING' }]);
  });
});

describe('dayOverviewTimeline', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const note = (organization: string, start: string, end: string): BookingOperatingNote => ({ organization, start, end });
  const schoolBlock = (startHour: number, organization: string): BookingAvailabilitySlot => ({
    start: `${pad(startHour)}:00`,
    end: `${pad(startHour + 1)}:00`,
    status: 'BLOCKED',
    blockedBy: 'SCHOOL',
    organization,
  });
  const pendingSlot = (startHour: number): BookingAvailabilitySlot => ({
    start: `${pad(startHour)}:00`,
    end: `${pad(startHour + 1)}:00`,
    status: 'PENDING_HOLD',
  });

  it('(a) 운영 09~20 을 확정 예약 10~12 로 잘라 앞/뒤 운영 조각을 만든다', () => {
    expect(
      dayOverviewTimeline([schoolBlock(10, '비호응원단'), schoolBlock(11, '비호응원단')], [note('고정관념', '09:00', '20:00')]),
    ).toEqual([
      { start: '09:00', end: '10:00', label: '고정관념', kind: 'OPERATING' },
      { start: '10:00', end: '12:00', label: '비호응원단', kind: 'SCHOOL' },
      { start: '12:00', end: '20:00', label: '고정관념', kind: 'OPERATING' },
    ]);
  });

  it('(b) 예약 2건(10~12·15~17)이 운영행을 세 조각으로 갈라 총 5행이 된다', () => {
    expect(
      dayOverviewTimeline(
        [schoolBlock(10, '비호응원단'), schoolBlock(11, '비호응원단'), schoolBlock(15, '트레몰로'), schoolBlock(16, '트레몰로')],
        [note('고정관념', '09:00', '20:00')],
      ),
    ).toEqual([
      { start: '09:00', end: '10:00', label: '고정관념', kind: 'OPERATING' },
      { start: '10:00', end: '12:00', label: '비호응원단', kind: 'SCHOOL' },
      { start: '12:00', end: '15:00', label: '고정관념', kind: 'OPERATING' },
      { start: '15:00', end: '17:00', label: '트레몰로', kind: 'SCHOOL' },
      { start: '17:00', end: '20:00', label: '고정관념', kind: 'OPERATING' },
    ]);
  });

  it('(c) 예약이 운영 노트 시작 경계(09~12)와 일치하면 앞 조각을 만들지 않는다', () => {
    expect(
      dayOverviewTimeline(
        [schoolBlock(9, '비호응원단'), schoolBlock(10, '비호응원단'), schoolBlock(11, '비호응원단')],
        [note('고정관념', '09:00', '20:00')],
      ),
    ).toEqual([
      { start: '09:00', end: '12:00', label: '비호응원단', kind: 'SCHOOL' },
      { start: '12:00', end: '20:00', label: '고정관념', kind: 'OPERATING' },
    ]);
  });

  it('(d) 예약이 없는 운영행은 통짜 조각 1행이다', () => {
    expect(dayOverviewTimeline([], [note('고정관념', '09:00', '20:00')])).toEqual([
      { start: '09:00', end: '20:00', label: '고정관념', kind: 'OPERATING' },
    ]);
  });

  it('(e) 운영 구간 밖 예약은 운영행을 자르지 않고 둘 다 타임라인에 남는다', () => {
    expect(dayOverviewTimeline([pendingSlot(20)], [note('고정관념', '09:00', '20:00')])).toEqual([
      { start: '09:00', end: '20:00', label: '고정관념', kind: 'OPERATING' },
      { start: '20:00', end: '21:00', label: '승인 대기', kind: 'PENDING' },
    ]);
  });

  it('(f) 승인 대기(PENDING)도 분할 기준이라 운영행을 자른다', () => {
    expect(dayOverviewTimeline([pendingSlot(10), pendingSlot(11)], [note('고정관념', '09:00', '20:00')])).toEqual([
      { start: '09:00', end: '10:00', label: '고정관념', kind: 'OPERATING' },
      { start: '10:00', end: '12:00', label: '승인 대기', kind: 'PENDING' },
      { start: '12:00', end: '20:00', label: '고정관념', kind: 'OPERATING' },
    ]);
  });

  it('(g) 시작 시각순으로 정렬하며 예약 건을 운영 조각보다 앞에 둔다', () => {
    // 운영 10~20 앞의 예약 09~10 은 겹치지 않아 통짜 운영 조각(10~20)과 함께 남고, 시작 시각순으로 예약이 먼저다.
    // 시작 동률은 알고리즘상 발생하지 않으나(운영 조각 시작 시각엔 예약이 없음) 정렬 규칙을 함께 고정한다.
    expect(dayOverviewTimeline([schoolBlock(9, '비호응원단')], [note('고정관념', '10:00', '20:00')])).toEqual([
      { start: '09:00', end: '10:00', label: '비호응원단', kind: 'SCHOOL' },
      { start: '10:00', end: '20:00', label: '고정관념', kind: 'OPERATING' },
    ]);
  });

  it('(h) 운영 노트가 여러 개면 각각 독립으로 분할한다', () => {
    expect(
      dayOverviewTimeline(
        [schoolBlock(10, '비호응원단'), schoolBlock(11, '비호응원단')],
        [note('고정관념', '09:00', '13:00'), note('두잉밴드', '14:00', '18:00')],
      ),
    ).toEqual([
      { start: '09:00', end: '10:00', label: '고정관념', kind: 'OPERATING' },
      { start: '10:00', end: '12:00', label: '비호응원단', kind: 'SCHOOL' },
      { start: '12:00', end: '13:00', label: '고정관념', kind: 'OPERATING' },
      { start: '14:00', end: '18:00', label: '두잉밴드', kind: 'OPERATING' },
    ]);
  });
});

describe('periodDistribution', () => {
  it('오전(09-12)/오후(12-18)/저녁(18-22) 가용 분포를 파생한다', () => {
    const slots = Array.from({ length: 13 }, (_, index) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const start = `${pad(9 + index)}:00`;
      const end = `${pad(10 + index)}:00`;
      // 11·12시 차단, 18시 홀드(선택 가능하나 분포에선 가용 아님으로 볼지? — 가용=AVAILABLE만)
      if (index === 2 || index === 3) return { start, end, status: 'BLOCKED' as const, blockedBy: 'INTERNAL' as const };
      if (index === 9) return { start, end, status: 'PENDING_HOLD' as const };
      return { start, end, status: 'AVAILABLE' as const };
    });
    const distribution = periodDistribution(slots);
    expect(distribution).toEqual([
      { key: 'MORNING', label: '오전', range: '09–12', free: 2, total: 3 },
      { key: 'AFTERNOON', label: '오후', range: '12–18', free: 5, total: 6 },
      { key: 'EVENING', label: '저녁', range: '18–22', free: 3, total: 4 },
    ]);
  });
});
