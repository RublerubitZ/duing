import { describe, expect, it } from 'vitest';
import type { ReservationSlot } from '@duing/types';
import {
  buildTimelineSegments,
  timelineIndicatorPct,
  seoulMinutesOfDay,
  seoulDateIso,
  daysInMonth,
  formatLastUpdated,
  nextSlotLabel,
  monthDiff,
  shiftYearMonth,
  yearMonthLabel,
} from '../../app/facilities/_lib/facilityTimeline';

const slots: ReservationSlot[] = [
  { date: '2026-07-01', start: '09:00', end: '11:00', organization: '고정관념', status: 'USING' },
  { date: '2026-07-01', start: '19:00', end: '20:00', organization: '댄스동아리', status: 'UPCOMING' },
  { date: '2026-07-02', start: '16:00', end: '17:00', organization: '밴드', status: 'UPCOMING' },
];

describe('buildTimelineSegments', () => {
  it('선택 날짜의 예약만 남기고 시작시각 오름차순으로 정렬한다', () => {
    const segments = buildTimelineSegments(slots, '2026-07-01');
    expect(segments.map((segment) => segment.organization)).toEqual(['고정관념', '댄스동아리']);
  });

  it('09~22(780분) 축 기준 left/width 퍼센트를 계산한다', () => {
    const [first] = buildTimelineSegments(slots, '2026-07-01');
    if (!first) throw new Error('expected at least one segment');
    expect(first.startLabel).toBe('09:00');
    expect(first.endLabel).toBe('11:00');
    expect(first.leftPct).toBe(0);
    // 09:00~11:00 = 120분 / 780분
    expect(first.widthPct).toBeCloseTo((120 / 780) * 100, 5);
  });

  it('축을 벗어난 구간은 클램프하되 원본 라벨은 보존한다', () => {
    const early: ReservationSlot[] = [
      { date: '2026-07-01', start: '08:00', end: '10:00', organization: '조기예약', status: 'FINISHED' },
    ];
    const [segment] = buildTimelineSegments(early, '2026-07-01');
    if (!segment) throw new Error('expected at least one segment');
    expect(segment.leftPct).toBe(0); // 08:00 → 09:00 로 클램프
    expect(segment.widthPct).toBeCloseTo((60 / 780) * 100, 5);
    expect(segment.startLabel).toBe('08:00'); // 라벨은 원본
  });

  it('축과 겹치지 않는 슬롯은 제거한다', () => {
    const late: ReservationSlot[] = [
      { date: '2026-07-01', start: '23:00', end: '23:30', organization: '심야', status: 'UPCOMING' },
    ];
    expect(buildTimelineSegments(late, '2026-07-01')).toHaveLength(0);
  });
});

describe('timelineIndicatorPct', () => {
  it('축 안이면 퍼센트, 밖이면 null', () => {
    expect(timelineIndicatorPct(9 * 60)).toBe(0);
    expect(timelineIndicatorPct(22 * 60)).toBe(100);
    expect(timelineIndicatorPct(13 * 60)).toBeCloseTo((240 / 780) * 100, 5);
    expect(timelineIndicatorPct(8 * 60)).toBeNull();
    expect(timelineIndicatorPct(23 * 60)).toBeNull();
  });
});

describe('seoul* 헬퍼는 CI/UTC 와 무관하게 KST wall-clock 을 준다', () => {
  it('02:20Z → KST 11:20 / 2026-07-01', () => {
    const instant = new Date('2026-07-01T02:20:00Z');
    expect(seoulMinutesOfDay(instant)).toBe(11 * 60 + 20);
    expect(seoulDateIso(instant)).toBe('2026-07-01');
  });
});

describe('daysInMonth', () => {
  it.each([
    ['2026-02', 28],
    ['2024-02', 29],
    ['2026-07', 31],
  ] as const)('%s → %d일', (yearMonth, expected) => {
    expect(daysInMonth(yearMonth)).toBe(expected);
  });
});

describe('nextSlotLabel', () => {
  const slot: ReservationSlot = {
    date: '2026-07-04',
    start: '16:00',
    end: '17:00',
    organization: '고정관념',
    status: 'UPCOMING',
  };

  it('오늘 예약이면 시간만 표기한다', () => {
    expect(nextSlotLabel(slot, '2026-07-04')).toBe('16:00~17:00');
  });

  it('오늘이 아니면 M/D 를 병기한다(0패딩 제거)', () => {
    expect(nextSlotLabel(slot, '2026-07-02')).toBe('7/4 16:00~17:00');
  });
});

describe('monthDiff / shiftYearMonth / yearMonthLabel', () => {
  it('monthDiff 는 to - from 개월 차를 준다', () => {
    expect(monthDiff('2026-07', '2026-07')).toBe(0);
    expect(monthDiff('2026-07', '2026-08')).toBe(1);
    expect(monthDiff('2026-07', '2025-07')).toBe(-12);
    expect(monthDiff('2026-07', '2027-07')).toBe(12);
    expect(monthDiff('2026-12', '2027-01')).toBe(1);
  });

  it('shiftYearMonth 는 연 경계를 넘어도 안전하다', () => {
    expect(shiftYearMonth('2026-07', 1)).toBe('2026-08');
    expect(shiftYearMonth('2026-07', -1)).toBe('2026-06');
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftYearMonth('2026-07', -12)).toBe('2025-07');
    expect(shiftYearMonth('2026-07', 12)).toBe('2027-07');
  });

  it('yearMonthLabel 은 "YYYY년 M월"(0패딩 제거) 형식이다', () => {
    expect(yearMonthLabel('2026-07')).toBe('2026년 7월');
    expect(yearMonthLabel('2026-12')).toBe('2026년 12월');
  });
});

describe('formatLastUpdated', () => {
  it('+09:00 ISO → "YYYY-MM-DD HH:mm"(KST)', () => {
    expect(formatLastUpdated('2026-07-01T11:20:00+09:00')).toBe('2026-07-01 11:20');
  });
  it('UTC ISO 도 KST 로 변환한다', () => {
    expect(formatLastUpdated('2026-07-01T02:20:00Z')).toBe('2026-07-01 11:20');
  });
  it('잘못된 값은 빈 문자열', () => {
    expect(formatLastUpdated('not-a-date')).toBe('');
  });
});
