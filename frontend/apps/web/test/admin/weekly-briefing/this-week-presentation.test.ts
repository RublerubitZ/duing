import { describe, expect, it } from 'vitest';

import {
  closingEndText,
  eventPeriodText,
  shortRangeText,
  updatedAtText,
  upcomingEventsRange,
} from '@/app/admin/weekly-briefing/_lib/thisWeekPresentation';

describe('thisWeekPresentation', () => {
  it('종료일은 기간이 지났으면(만료-OPEN) 날짜만, 아니면 요일까지 쓴다', () => {
    expect(closingEndText('2026-11-03', true)).toBe('11월 3일 종료');
    expect(closingEndText('2026-11-05', false)).toBe('11월 5일(목) 종료');
    expect(closingEndText('2026-11-06', false)).toBe('11월 6일(금) 종료');
  });

  it('다가오는 행사 기간은 오늘 ~ 다음 주 일요일(이번 주 월요일 + 13)이고, 같은 달이면 끝에 일만 쓴다', () => {
    expect(upcomingEventsRange('2026-11-05', '2026-11-02')).toEqual({ from: '2026-11-05', to: '2026-11-15' });
    expect(shortRangeText('2026-11-05', '2026-11-15')).toBe('11월 5일 – 15일');
    expect(shortRangeText('2026-11-26', '2026-12-06')).toBe('11월 26일 – 12월 6일');
  });

  it('행사 기간 — 하루면 날짜(요일), 여러 날이면 끝 날짜까지(오프셋 없는 일정 시각은 KST)', () => {
    expect(eventPeriodText('2026-11-05T18:00:00', '2026-11-05T21:00:00')).toBe('11월 5일(목)');
    expect(eventPeriodText('2026-11-05T10:00:00', '2026-11-07T18:00:00')).toBe('11월 5일(목) – 7일(토)');
    expect(eventPeriodText('2026-11-30T10:00:00', '2026-12-01T18:00:00')).toBe('11월 30일(월) – 12월 1일(화)');
  });

  it('지금 기준 시각은 조회를 받은 시각(KST)이다', () => {
    expect(updatedAtText(Date.parse('2026-11-05T05:05:00Z'))).toBe('지금 기준 11월 5일 오후 2:05');
  });
});
