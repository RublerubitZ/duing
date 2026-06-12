import { describe, it, expect } from 'vitest';
import {
  kstDateString,
  todayKstDateString,
  isTodayKst,
  daysUntilKst,
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
});
