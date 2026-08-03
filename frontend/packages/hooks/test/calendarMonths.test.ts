import { describe, expect, it } from 'vitest';

import { addDaysIso, monthBounds, monthsInRange } from '../src/calendarMonth';

describe('monthsInRange', () => {
  it('같은 달 안이면 1개', () => {
    expect(monthsInRange('2026-08-03', '2026-08-20')).toEqual(['2026-08']);
  });

  it('30일 창이 다음 달로 넘어가면 2개', () => {
    const today = '2026-08-03';
    expect(monthsInRange(today, addDaysIso(today, 30))).toEqual(['2026-08', '2026-09']);
  });

  it('연 경계를 넘어도 안전하다', () => {
    const today = '2026-12-31';
    expect(monthsInRange(today, addDaysIso(today, 30))).toEqual(['2026-12', '2027-01']);
  });

  it('1월 말은 2월이 통째로 들어가 3개가 된다', () => {
    // 2027-01-31 + 30일 = 2027-03-02 — "이번 달 + 다음 달" 고정이면 3월 초 일정이 누락된다.
    const today = '2027-01-31';
    expect(addDaysIso(today, 30)).toBe('2027-03-02');
    expect(monthsInRange(today, addDaysIso(today, 30))).toEqual(['2027-01', '2027-02', '2027-03']);
  });

  it('시작이 끝보다 뒤면 시작 달 하나만 돌려준다(무한 루프 방지)', () => {
    expect(monthsInRange('2026-08-03', '2026-07-01')).toEqual(['2026-08']);
  });
});

describe('monthBounds', () => {
  it('해당 달의 1일과 말일을 돌려준다', () => {
    expect(monthBounds('2026-08')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(monthBounds('2027-02')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});
