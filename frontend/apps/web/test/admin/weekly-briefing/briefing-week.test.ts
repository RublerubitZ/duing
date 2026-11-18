import { describe, expect, it } from 'vitest';

import {
  TOO_OLD_NOTICE,
  briefingWeekRange,
  mondayOf,
  resolveRequestedWeek,
} from '@/app/admin/weekly-briefing/_lib/briefingWeek';

import { NOW_ISO } from './weeklyBriefing.data';

const RANGE = briefingWeekRange(new Date(NOW_ISO));

describe('mondayOf', () => {
  it.each([
    ['2026-11-02', '2026-11-02'],
    ['2026-11-05', '2026-11-02'],
    ['2026-11-08', '2026-11-02'],
    ['2026-01-01', '2025-12-29'],
  ])('%s 가 든 주의 월요일은 %s 다', (isoDate, expectedMonday) => {
    expect(mondayOf(isoDate)).toBe(expectedMonday);
  });
});

describe('briefingWeekRange', () => {
  it('이번 주·가장 최근에 끝난 주·가장 이른 주는 서버 식과 같다(M, M − 7, M − 52·7)', () => {
    expect(RANGE).toEqual({ currentMonday: '2026-11-02', latestWeek: '2026-10-26', oldestWeek: '2025-11-03' });
  });

  it('KST 자정 경계 — UTC 일요일 15:00(KST 월요일 00:00)에 이번 주가 넘어가고, 1초 전에는 아직 앞 주다', () => {
    expect(briefingWeekRange(new Date('2026-11-01T15:00:00Z')).currentMonday).toBe('2026-11-02');
    expect(briefingWeekRange(new Date('2026-11-01T14:59:59Z'))).toEqual({
      currentMonday: '2026-10-26',
      latestWeek: '2026-10-19',
      oldestWeek: '2025-10-27',
    });
  });
});

describe('resolveRequestedWeek', () => {
  it('주가 없거나 날짜로 읽히지 않으면(넘치는 날 포함) 알림 없이 가장 최근에 끝난 주다', () => {
    for (const requested of [null, 'abc', '2026-13-01', '2026-02-30', '20261026']) {
      expect(resolveRequestedWeek(requested, RANGE)).toEqual({ weekStart: '2026-10-26', notice: null });
    }
  });

  it('월요일이 아니면 그 주 월요일로 맞추고 알림은 없다', () => {
    expect(resolveRequestedWeek('2026-10-28', RANGE)).toEqual({ weekStart: '2026-10-26', notice: null });
    expect(resolveRequestedWeek('2026-10-25', RANGE)).toEqual({ weekStart: '2026-10-19', notice: null });
  });

  it('진행 중인 주·미래는 가장 최근 주로 바꾸고 그 주 월요일로 알린다', () => {
    expect(resolveRequestedWeek('2026-11-04', RANGE)).toEqual({
      weekStart: '2026-10-26',
      notice: '11월 2일 주는 아직 끝나지 않아 지난주를 보여 드려요.',
    });
    expect(resolveRequestedWeek('2026-11-12', RANGE).notice).toBe('11월 9일 주는 아직 끝나지 않아 지난주를 보여 드려요.');
  });

  it('가장 이른 주(52주 전)는 받고, 그보다 이른 주는 최근 주로 바꾸고 알린다', () => {
    expect(resolveRequestedWeek('2025-11-03', RANGE)).toEqual({ weekStart: '2025-11-03', notice: null });
    expect(resolveRequestedWeek('2025-11-02', RANGE)).toEqual({ weekStart: '2026-10-26', notice: TOO_OLD_NOTICE });
    expect(TOO_OLD_NOTICE).toBe('1년 전까지만 볼 수 있어요.');
  });
});
