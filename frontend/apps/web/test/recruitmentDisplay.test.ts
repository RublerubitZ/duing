import { describe, expect, it } from 'vitest';
import {
  displayStatusLabel,
  recruitmentPeriodLabel,
  recruitmentDaysLeft,
} from '../app/_lib/recruitmentDisplay';

describe('displayStatusLabel', () => {
  it.each([
    ['UPCOMING', '모집예정'],
    ['OPEN', '모집중'],
    ['ALWAYS_OPEN', '상시모집'],
    ['CLOSED', '모집마감'],
  ] as const)('%s → %s', (status, expected) => {
    expect(displayStatusLabel(status)).toBe(expected);
  });
});

describe('recruitmentPeriodLabel', () => {
  it('endDate 가 null 이면 "상시모집"을 반환한다', () => {
    expect(recruitmentPeriodLabel('2026-05-01', null)).toBe('상시모집');
  });
  it('endDate 가 있으면 "YYYY-MM-DD ~ YYYY-MM-DD" 형식', () => {
    expect(recruitmentPeriodLabel('2026-05-01', '2026-05-31')).toBe('2026-05-01 ~ 2026-05-31');
  });
});

describe('recruitmentDaysLeft', () => {
  const today = new Date('2026-05-18');
  it('endDate 가 null 이면 null 을 반환한다', () => {
    expect(recruitmentDaysLeft(null, today)).toBeNull();
  });
  it('endDate 가 미래면 양수', () => {
    expect(recruitmentDaysLeft('2026-05-27', today)).toBe(9);
  });
  it('endDate 가 오늘이면 0', () => {
    expect(recruitmentDaysLeft('2026-05-18', today)).toBe(0);
  });
  it('endDate 가 과거면 음수', () => {
    expect(recruitmentDaysLeft('2026-05-10', today)).toBe(-8);
  });
});
