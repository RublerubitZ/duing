import { describe, expect, it } from 'vitest';
import {
  seoulDateIso,
  daysInMonth,
  formatLastUpdated,
  monthDiff,
  shiftYearMonth,
  yearMonthLabel,
} from '../../app/facilities/_lib/facilityTimeline';

describe('seoulDateIso 는 CI/UTC 와 무관하게 KST wall-clock 날짜를 준다', () => {
  it('02:20Z → 2026-07-01', () => {
    expect(seoulDateIso(new Date('2026-07-01T02:20:00Z'))).toBe('2026-07-01');
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
