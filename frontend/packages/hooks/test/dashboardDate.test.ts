import { describe, it, expect } from 'vitest';
import {
  kstDateString,
  todayKstDateString,
  isTodayKst,
  daysUntilKst,
  parseKstInstant,
} from '../src/dashboardDate';

describe('dashboardDate', () => {
  it('kstDateString: UTC ISO를 KST 날짜로 변환한다', () => {
    // 2026-06-12T16:30:00Z == 2026-06-13 01:30 KST
    expect(kstDateString('2026-06-12T16:30:00Z')).toBe('2026-06-13');
    // 2026-06-12T10:00:00Z == 2026-06-12 19:00 KST
    expect(kstDateString('2026-06-12T10:00:00Z')).toBe('2026-06-12');
  });

  it('todayKstDateString: now(Date)를 KST 날짜로 변환한다', () => {
    expect(todayKstDateString(new Date('2026-06-11T20:00:00Z'))).toBe('2026-06-12');
  });

  it('isTodayKst: 같은 KST 날짜면 true', () => {
    const now = new Date('2026-06-12T03:00:00Z'); // 12:00 KST 6/12
    expect(isTodayKst('2026-06-12T05:00:00Z', now)).toBe(true);
    expect(isTodayKst('2026-06-11T05:00:00Z', now)).toBe(false);
  });

  it('daysUntilKst: KST 캘린더 일수 차이(양수=미래)', () => {
    const now = new Date('2026-06-12T03:00:00Z'); // 6/12 KST
    expect(daysUntilKst('2026-06-15', now)).toBe(3);
    expect(daysUntilKst('2026-06-12', now)).toBe(0);
    expect(daysUntilKst('2026-06-10', now)).toBe(-2);
  });

  it('daysUntilKst: KST 자정 직전(23:59)도 당일로 계산', () => {
    // 2026-06-12T14:59:00Z == 2026-06-12 23:59 KST → 6/13까지 1일
    expect(daysUntilKst('2026-06-13', new Date('2026-06-12T14:59:00Z'))).toBe(1);
  });
});

describe('parseKstInstant', () => {
  it('offset 없는 datetime은 KST(+09:00)로 파싱한다', () => {
    // 2026-06-12T23:30:00 KST == 2026-06-12T14:30:00Z
    const result = parseKstInstant('2026-06-12T23:30:00');
    expect(result.toISOString()).toBe('2026-06-12T14:30:00.000Z');
  });

  it('kstDateString: offset 없는 datetime은 KST 당일 날짜로 반환한다', () => {
    // 23:30 KST → 당일 2026-06-12, 브라우저 TZ 무관
    expect(kstDateString('2026-06-12T23:30:00')).toBe('2026-06-12');
  });

  it('isTodayKst: offset 없는 datetime도 KST 기준 오늘 판정', () => {
    // now = 2026-06-12T03:00:00Z (12:00 KST 6/12)
    // iso = 2026-06-12T23:30:00 (offset 없음) → KST 6/12 23:30 → 오늘
    const now = new Date('2026-06-12T03:00:00Z');
    expect(isTodayKst('2026-06-12T23:30:00', now)).toBe(true);
  });

  it('Z suffix 문자열은 UTC instant로 그대로 파싱한다', () => {
    // 2026-06-12T16:30:00Z == KST 2026-06-13 01:30 → kstDateString '2026-06-13'
    expect(kstDateString('2026-06-12T16:30:00Z')).toBe('2026-06-13');
  });

  it('날짜만 문자열(length 10)은 KST 자정으로 파싱한다', () => {
    const result = parseKstInstant('2026-06-12');
    expect(result.toISOString()).toBe('2026-06-11T15:00:00.000Z');
  });

  it('+09:00 offset이 이미 있으면 그대로 파싱한다', () => {
    const result = parseKstInstant('2026-06-12T14:00:00+09:00');
    expect(result.toISOString()).toBe('2026-06-12T05:00:00.000Z');
  });
});
