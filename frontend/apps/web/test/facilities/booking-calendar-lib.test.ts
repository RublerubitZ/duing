import { describe, expect, it } from 'vitest';
import type { BookingAvailabilitySlot, BookingOperatingNote } from '@duing/types';
import {
  adjacentMonthToFetch,
  availableRuns,
  buildMonthCells,
  DAY_LEVEL_META,
  dayBookingEntries,
  dayLevelOf,
  dayUsageEntries,
  hasApplicableSlot,
  isApplicationDeadlinePassed,
  isDayApplicationClosed,
  isSelectableSlot,
  isWithinBookable,
  pastelIndexByLabel,
  PASTEL_PALETTE_SIZE,
  periodDistribution,
  rangeContainsPendingHold,
  rangeLabel,
  shiftDateByDays,
  slotInRange,
  toggleSlotSelection,
  weekDatesOf,
  weekMonthsOf,
  weekRangeLabel,
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

describe('weekMonthsOf (§12.1 주의 걸친 월 파생)', () => {
  it('한 달 안에 있는 주는 월 1개만 반환한다', () => {
    // 2026-07-13(월)~07-19(일) — 전부 7월.
    expect(weekMonthsOf('2026-07-13')).toEqual(['2026-07']);
  });

  it('월 경계를 넘는 주는 두 월을 오름차순으로 반환한다', () => {
    // 2026-07-27(월)~08-02(일) — 7월·8월에 걸침(사용자 지정 케이스).
    expect(weekMonthsOf('2026-07-27')).toEqual(['2026-07', '2026-08']);
    // 2026-08-31(월)~09-06(일) — 8월·9월.
    expect(weekMonthsOf('2026-08-31')).toEqual(['2026-08', '2026-09']);
  });

  it('연도 경계를 넘는 주도 두 월(연도 넘김)을 반환한다', () => {
    // 2026-12-31(목)이 속한 주 = 12/28(월)~01/03(일) — 연도 경계(§12.2).
    expect(weekMonthsOf('2026-12-31')).toEqual(['2026-12', '2027-01']);
    // 새해 첫날 입력도 같은 주라 동일하게 두 월을 만든다.
    expect(weekMonthsOf('2027-01-01')).toEqual(['2026-12', '2027-01']);
  });
});

describe('adjacentMonthToFetch (§12.1 인접월 조회 게이트)', () => {
  it('이월 주면 조회 월이 아닌 다른 월을 반환한다(양방향)', () => {
    // 조회 월=7월이면 이월 대상=8월.
    expect(adjacentMonthToFetch('2026-07-27', '2026-07', ['2026-07', '2026-08'])).toBe('2026-08');
    // 조회 월=8월(선택일이 8월로 넘어간 경우)이면 이월 대상=7월.
    expect(adjacentMonthToFetch('2026-07-27', '2026-08', ['2026-07', '2026-08'])).toBe('2026-07');
  });

  it('이월이 아닌(한 달) 주는 undefined 다', () => {
    expect(adjacentMonthToFetch('2026-07-13', '2026-07', ['2026-07', '2026-08'])).toBeUndefined();
  });

  it('인접월이 허용 범위(당월·익월) 밖이면 undefined 다(400 방지)', () => {
    // 8/31~9/6 주에서 조회 월=8월, 다른 월=9월(익월 밖) → 조회하지 않는다.
    expect(adjacentMonthToFetch('2026-08-31', '2026-08', ['2026-07', '2026-08'])).toBeUndefined();
  });

  it('연도 경계에서도 허용 범위 안이면 인접월을 반환한다(월 산술 연도 넘김)', () => {
    expect(adjacentMonthToFetch('2026-12-31', '2026-12', ['2026-12', '2027-01'])).toBe('2027-01');
  });

  it('직전 월이 허용 범위에 있으면 지난 주의 인접 전월도 반환한다(기록 열람 — 2026-09-03)', () => {
    // 7/27~8/2 주에서 조회 월=8월이고 허용 범위가 [6,7,8]월이면 7월을 조회한다.
    expect(adjacentMonthToFetch('2026-08-01', '2026-08', ['2026-06', '2026-07', '2026-08'])).toBe('2026-07');
    // 6/29~7/5 주에서 조회 월=7월이면 직전 월 6월도 허용 범위라 조회한다.
    expect(adjacentMonthToFetch('2026-07-01', '2026-07', ['2026-06', '2026-07', '2026-08'])).toBe('2026-06');
  });
});

describe('shiftDateByDays', () => {
  it('일 단위로 더하고 빼며 월·연 경계를 넘긴다(로컬 파싱, UTC 자정 함정 회피)', () => {
    expect(shiftDateByDays('2026-07-20', 7)).toBe('2026-07-27');
    expect(shiftDateByDays('2026-07-27', 7)).toBe('2026-08-03'); // 월 경계
    expect(shiftDateByDays('2026-08-03', -7)).toBe('2026-07-27');
    expect(shiftDateByDays('2026-12-29', 7)).toBe('2027-01-05'); // 연 경계
    expect(shiftDateByDays('2026-07-20', 0)).toBe('2026-07-20');
  });
});

describe('weekRangeLabel', () => {
  it('같은 달 주는 "M월 D일 – D일" 로 표기한다', () => {
    // 월요일 입력 → 그 주(월~일) 라벨. 2026-07-20 은 월요일, 주 끝=07-26.
    expect(weekRangeLabel('2026-07-20')).toBe('7월 20일 – 26일');
  });

  it('월 경계를 넘는 주는 끝 날짜에 월을 함께 표기한다', () => {
    // 2026-07-27(월)~08-02(일) — 끝이 다음 달.
    expect(weekRangeLabel('2026-07-27')).toBe('7월 27일 – 8월 2일');
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

// 확보 시간 비차단 전환(2026-08-27): BASIC_SECURED 는 응답에서 사라졌다(확보 슬롯 = AVAILABLE).
// 미지 blockedBy fail-closed 계약은 절대 유지 — 미래의 새 차단 소스가 와도 차단 표시를 지킨다.
describe('미지 blockedBy — fail-closed', () => {
  it('미지의 blockedBy 값도 BLOCKED 표시를 유지한다 — AVAILABLE 로 풀리지 않는다(fail-closed)', () => {
    const unknownSource = {
      start: '09:00',
      end: '10:00',
      status: 'BLOCKED',
      blockedBy: 'FUTURE_SOURCE',
      organization: '미래단체',
    } as unknown as BookingAvailabilitySlot;
    expect(isSelectableSlot(unknownSource)).toBe(false);
    expect(dayBookingEntries([unknownSource])).toEqual([
      { start: '09:00', end: '10:00', label: '미래단체', kind: 'INTERNAL' },
    ]);
  });
});

// 확보 시간 비차단 정보 표시 복원(2026-08-27 스펙 §3): operatingNotes(기본 확보 창)는 차단이 아니라
// 사용 중 계층의 통짜 표기 데이터다 — 예약 건과 함께 시작 시각순으로 합친다.
describe('dayUsageEntries', () => {
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

  it('운영 노트는 자르지 않은 통짜로, 예약 건과 시작 시각순으로 합친다(동률은 기본 확보 먼저)', () => {
    expect(
      dayUsageEntries(
        [schoolBlock(9, '비호응원단'), pendingSlot(15)],
        [note('고정관념', '09:00', '20:00')],
      ),
    ).toEqual([
      { start: '09:00', end: '20:00', label: '고정관념', kind: 'OPERATING' },
      { start: '09:00', end: '10:00', label: '비호응원단', kind: 'SCHOOL' },
      { start: '15:00', end: '16:00', label: '승인 대기', kind: 'PENDING' },
    ]);
  });

  it('노트 구간과 겹치는 예약도 절단 없이 둘 다 그대로 남는다(계층 표시)', () => {
    expect(
      dayUsageEntries([schoolBlock(10, '비호응원단'), schoolBlock(11, '비호응원단')], [note('고정관념', '09:00', '20:00')]),
    ).toEqual([
      { start: '09:00', end: '20:00', label: '고정관념', kind: 'OPERATING' },
      { start: '10:00', end: '12:00', label: '비호응원단', kind: 'SCHOOL' },
    ]);
  });

  it('노트가 없으면 예약 건만, 슬롯·노트 둘 다 없으면 빈 배열이다(구응답 fail-soft)', () => {
    expect(dayUsageEntries([schoolBlock(10, '비호응원단')], [])).toEqual([
      { start: '10:00', end: '11:00', label: '비호응원단', kind: 'SCHOOL' },
    ]);
    expect(dayUsageEntries([], [])).toEqual([]);
  });
});

describe('availableRuns', () => {
  it('하루 전체 시간축 기준으로 AVAILABLE 을 인접 병합한다 — BLOCKED·PENDING 이 구간을 끊는다', () => {
    expect(
      availableRuns([
        slot(9, 'AVAILABLE'),
        slot(10, 'AVAILABLE'),
        slot(11, 'BLOCKED'),
        slot(12, 'PENDING_HOLD'),
        slot(13, 'AVAILABLE'),
      ]),
    ).toEqual([
      { start: '09:00', end: '11:00', slotCount: 2 },
      { start: '13:00', end: '14:00', slotCount: 1 },
    ]);
  });

  it('PAST 는 구간을 끊고 자체 행도 만들지 않는다', () => {
    expect(availableRuns([slot(9, 'AVAILABLE'), slot(10, 'PAST'), slot(11, 'AVAILABLE')])).toEqual([
      { start: '09:00', end: '10:00', slotCount: 1 },
      { start: '11:00', end: '12:00', slotCount: 1 },
    ]);
  });

  it('AVAILABLE 이 없으면 빈 배열이다', () => {
    expect(availableRuns([slot(9, 'BLOCKED'), slot(10, 'PAST')])).toEqual([]);
    expect(availableRuns([])).toEqual([]);
  });
});


describe('pastelIndexByLabel', () => {
  it('같은 라벨은 같은 인덱스이고, 라벨은 첫 등장 순서로 팔레트를 순환 배정한다(§8.3)', () => {
    // 첫 등장 순서: A(0) → B(1) → A(이미) → C(2). 같은 라벨 재등장은 인덱스 고정.
    const indexByLabel = pastelIndexByLabel(['비호응원단', '트레몰로', '비호응원단', '고정관념']);
    expect(indexByLabel.get('비호응원단')).toBe(0);
    expect(indexByLabel.get('트레몰로')).toBe(1);
    expect(indexByLabel.get('고정관념')).toBe(2);
  });

  it('6색을 넘어서면 7번째 라벨부터 인덱스 0 으로 재순환한다', () => {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const indexByLabel = pastelIndexByLabel(labels);
    expect(PASTEL_PALETTE_SIZE).toBe(6);
    expect([...'ABCDEF'].map((label) => indexByLabel.get(label))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(indexByLabel.get('G')).toBe(0); // 7번째 = 0 재순환
    expect(indexByLabel.get('H')).toBe(1); // 8번째 = 1
  });

  it('빈 라벨 목록은 빈 맵을 반환한다', () => {
    expect(pastelIndexByLabel([]).size).toBe(0);
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

describe('isApplicationDeadlinePassed', () => {
  // 사용일 7/20 의 마감 = 7/19 12:01(KST)부터 — 서버 BookingDeadlinePolicy 와 동일 경계(분 단위)
  const useDate = '2026-07-20';

  it('전날 12:00분대(12:00:59)까지는 마감이 아니다', () => {
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T11:59:00+09:00'))).toBe(false);
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T12:00:59+09:00'))).toBe(false);
  });

  it('전날 12:01부터는 마감이다', () => {
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T12:01:00+09:00'))).toBe(true);
  });

  it('당일과 과거 날짜는 항상 마감이다', () => {
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-20T00:00:01+09:00'))).toBe(true);
    expect(isApplicationDeadlinePassed('2026-07-18', new Date('2026-07-19T09:00:00+09:00'))).toBe(true);
  });

  it('이틀 이상 남은 날짜는 마감이 아니다', () => {
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-18T23:59:59+09:00'))).toBe(false);
  });

  it('KST 자정 경계 — UTC 기준 전날 밤이라도 KST 날짜로 판정한다', () => {
    // UTC 7/19 02:59 = KST 7/19 11:59 → 미마감, UTC 7/19 03:01 = KST 7/19 12:01 → 마감
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T02:59:00Z'))).toBe(false);
    expect(isApplicationDeadlinePassed(useDate, new Date('2026-07-19T03:01:00Z'))).toBe(true);
  });
});

describe('isDayApplicationClosed / hasApplicableSlot (신청 마감 날 파생 — 서버 applicationClosed 우선, 없으면 DEADLINE_PASSED 존재)', () => {
  it('빈 슬롯이 DEADLINE_PASSED 로 내려온 날은 마감이고, 대기 슬롯이 남아도 신청 가능한 슬롯이 없다(플래그 없는 구응답)', () => {
    const closed = { slots: [slot(9, 'DEADLINE_PASSED'), slot(10, 'BLOCKED'), slot(11, 'PENDING_HOLD')] };
    expect(isDayApplicationClosed(closed)).toBe(true);
    expect(hasApplicableSlot(closed)).toBe(false);
  });

  it('서버 applicationClosed=true 면 빈 슬롯이 하나도 없어도(전부 점유·대기) 마감이다 — 잔여 한계 해소', () => {
    const closedNoEmpty = { applicationClosed: true, slots: [slot(9, 'BLOCKED'), slot(10, 'PENDING_HOLD')] };
    expect(isDayApplicationClosed(closedNoEmpty)).toBe(true);
    expect(hasApplicableSlot(closedNoEmpty)).toBe(false);
  });

  it('서버 applicationClosed=false 는 슬롯 파생보다 우선한다(서버가 진실)', () => {
    const open = { applicationClosed: false, slots: [slot(9, 'DEADLINE_PASSED'), slot(10, 'AVAILABLE')] };
    expect(isDayApplicationClosed(open)).toBe(false);
    expect(hasApplicableSlot(open)).toBe(true);
  });

  it('DEADLINE_PASSED 가 없는 날은 마감이 아니고, AVAILABLE·PENDING_HOLD 가 하나라도 있으면 신청 가능하다', () => {
    const open = { slots: [slot(9, 'BLOCKED'), slot(10, 'PENDING_HOLD'), slot(11, 'AVAILABLE')] };
    expect(isDayApplicationClosed(open)).toBe(false);
    expect(hasApplicableSlot(open)).toBe(true);
    expect(hasApplicableSlot({ slots: [slot(9, 'BLOCKED'), slot(10, 'PENDING_HOLD')] })).toBe(true);
  });

  it('지난 날짜(PAST·BLOCKED 만, applicationClosed=false)는 마감 표시가 아니지만 신청 가능한 슬롯도 없다', () => {
    const past = { applicationClosed: false, slots: [slot(9, 'PAST'), slot(10, 'BLOCKED'), slot(11, 'PAST')] };
    expect(isDayApplicationClosed(past)).toBe(false);
    expect(hasApplicableSlot(past)).toBe(false);
  });

  it('isSelectableSlot 은 DEADLINE_PASSED 를 선택 불가로 본다(fail-closed 무변경)', () => {
    expect(isSelectableSlot(slot(9, 'DEADLINE_PASSED'))).toBe(false);
    expect(isSelectableSlot(slot(9, 'PENDING_HOLD'))).toBe(true);
  });
});
