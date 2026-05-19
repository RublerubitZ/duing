import { describe, expect, it } from 'vitest';

import {
  activityScheduleLabel,
  dayLabel,
} from '../../app/clubs/[clubId]/_lib/activeDaysLabel';

describe('dayLabel', () => {
  it.each([
    ['MONDAY', '월'],
    ['TUESDAY', '화'],
    ['WEDNESDAY', '수'],
    ['THURSDAY', '목'],
    ['FRIDAY', '금'],
    ['SATURDAY', '토'],
    ['SUNDAY', '일'],
  ] as const)('%s → %s', (day, expected) => {
    expect(dayLabel(day)).toBe(expected);
  });
});

describe('activityScheduleLabel', () => {
  it('빈도와 요일이 모두 있으면 "주 N회 (요일·요일)"', () => {
    expect(activityScheduleLabel(2, ['WEDNESDAY', 'FRIDAY'])).toBe('주 2회 (수·금)');
  });
  it('빈도만 있으면 "주 N회"', () => {
    expect(activityScheduleLabel(1, [])).toBe('주 1회');
  });
  it('요일만 있으면 "요일·요일" (소괄호 없음)', () => {
    expect(activityScheduleLabel(null, ['MONDAY', 'WEDNESDAY'])).toBe('월·수');
  });
  it('둘 다 없으면 null', () => {
    expect(activityScheduleLabel(null, [])).toBeNull();
  });
  it('요일 입력 순서가 섞여 있어도 월화수목금토일 순으로 정렬된다', () => {
    expect(activityScheduleLabel(null, ['FRIDAY', 'MONDAY', 'WEDNESDAY'])).toBe('월·수·금');
  });
});
