import { describe, it, expect } from 'vitest';
import {
  formatDateTimeKst,
  formatDateKst,
  formatTimeKst,
  formatRelativeTime,
  kstDateTimeFormatter,
} from '../src/datetime';

// 모든 단언은 절대시각(Z) 또는 KST 벽시계 문자열 기준 — 러너의 로컬 TZ에 의존하지 않는다.
describe('formatDateTimeKst', () => {
  it('Z 문자열(Event Time)을 KST로 변환한다', () => {
    // 2026-07-20T04:07:00Z == 2026-07-20 13:07 KST
    expect(formatDateTimeKst('2026-07-20T04:07:00Z')).toBe('2026.07.20 13:07');
  });

  it('오프셋 없는 문자열(Schedule Time)은 KST 벽시계 그대로 표시한다', () => {
    expect(formatDateTimeKst('2026-07-20T18:00:00')).toBe('2026.07.20 18:00');
  });

  it('KST 기준 날짜가 넘어가는 Z 시각도 올바르다', () => {
    // 2026-06-12T16:30:00Z == 2026-06-13 01:30 KST
    expect(formatDateTimeKst('2026-06-12T16:30:00Z')).toBe('2026.06.13 01:30');
  });

  it('date-only 는 KST 자정으로 표시한다 (h23 → 00시)', () => {
    expect(formatDateTimeKst('2026-07-20')).toBe('2026.07.20 00:00');
  });

  it('Invalid 입력은 원문을 반환한다', () => {
    expect(formatDateTimeKst('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDateKst', () => {
  it('Z 문자열을 KST 날짜로 변환한다', () => {
    expect(formatDateKst('2026-06-12T16:30:00Z')).toBe('2026.06.13');
  });

  it('오프셋 없는 문자열과 date-only 를 그대로 표시한다', () => {
    expect(formatDateKst('2026-07-20T18:00:00')).toBe('2026.07.20');
    expect(formatDateKst('2026-07-20')).toBe('2026.07.20');
  });

  it('Invalid 입력은 원문을 반환한다', () => {
    expect(formatDateKst('invalid')).toBe('invalid');
  });
});

describe('formatTimeKst', () => {
  it('Z 문자열을 KST 시각으로 변환한다', () => {
    expect(formatTimeKst('2026-07-20T04:07:00Z')).toBe('13:07');
  });

  it('오프셋 없는 문자열은 벽시계 시각 그대로 표시한다', () => {
    expect(formatTimeKst('2026-07-20T23:30:00')).toBe('23:30');
  });

  it('KST 자정은 24:00 이 아닌 00:00 으로 표시한다', () => {
    // 2026-07-19T15:00:00Z == 2026-07-20 00:00 KST
    expect(formatTimeKst('2026-07-19T15:00:00Z')).toBe('00:00');
  });

  it('Invalid 입력은 원문을 반환한다', () => {
    expect(formatTimeKst('invalid')).toBe('invalid');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('1분 미만은 방금 전', () => {
    expect(formatRelativeTime('2026-07-20T11:59:30Z', now)).toBe('방금 전');
  });

  it('미래 시각(서버 시계 편차)도 방금 전', () => {
    expect(formatRelativeTime('2026-07-20T12:05:00Z', now)).toBe('방금 전');
  });

  it('1시간 미만은 N분 전', () => {
    expect(formatRelativeTime('2026-07-20T11:55:00Z', now)).toBe('5분 전');
    expect(formatRelativeTime('2026-07-20T11:01:00Z', now)).toBe('59분 전');
  });

  it('24시간 미만은 N시간 전', () => {
    expect(formatRelativeTime('2026-07-20T11:00:00Z', now)).toBe('1시간 전');
    expect(formatRelativeTime('2026-07-19T13:00:00Z', now)).toBe('23시간 전');
  });

  it('7일 미만은 N일 전', () => {
    expect(formatRelativeTime('2026-07-19T12:00:00Z', now)).toBe('1일 전');
    expect(formatRelativeTime('2026-07-14T12:00:01Z', now)).toBe('5일 전');
  });

  it('7일 이상은 KST 날짜로 폴백한다', () => {
    expect(formatRelativeTime('2026-07-13T12:00:00Z', now)).toBe('2026.07.13');
  });

  it('오프셋 없는 문자열은 KST 로 간주해 계산한다', () => {
    // 2026-07-20T20:55:00 KST == 2026-07-20T11:55:00Z → 5분 전
    expect(formatRelativeTime('2026-07-20T20:55:00', now)).toBe('5분 전');
  });

  it('Invalid 입력은 원문을 반환한다', () => {
    expect(formatRelativeTime('invalid', now)).toBe('invalid');
  });
});

describe('kstDateTimeFormatter', () => {
  it('timeZone 을 Asia/Seoul 로 고정한다', () => {
    const weekdayFormatter = kstDateTimeFormatter({ weekday: 'short' });
    expect(weekdayFormatter.resolvedOptions().timeZone).toBe('Asia/Seoul');
    // 2026-07-20 은 KST 기준 월요일
    expect(weekdayFormatter.format(new Date('2026-07-20T00:00:00+09:00'))).toBe('월');
  });

  it('UTC 기준 전날 저녁도 KST 요일로 판정한다', () => {
    const weekdayFormatter = kstDateTimeFormatter({ weekday: 'short' });
    // 2026-07-19T16:00:00Z == 2026-07-20 01:00 KST → 월요일
    expect(weekdayFormatter.format(new Date('2026-07-19T16:00:00Z'))).toBe('월');
  });
});
