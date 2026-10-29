import { describe, expect, it } from 'vitest';
import type { PendingTrendBar } from '@duing/hooks';

import {
  monthDayLabel,
  pendingTrendBarDateText,
  pendingTrendBarValueText,
  pendingTrendSummary,
  recentFlowText,
  shortDateLabel,
} from '@/app/admin/_components/home/adminPendingTrendPresentation';

describe('날짜 표기 — 날짜 문자열만 쪼개 기기 시간대와 무관하다', () => {
  it.each([
    ['2026-10-16', '10월 16일', '10/16'],
    ['2026-01-05', '1월 5일', '1/5'],
  ])('%s → %s · %s', (isoDate, monthDay, short) => {
    expect(monthDayLabel(isoDate)).toBe(monthDay);
    expect(shortDateLabel(isoDate)).toBe(short);
  });
});

describe('pendingTrendSummary', () => {
  it.each([
    [18, 28, '10월 16일보다 10건 늘었어요'],
    [28, 25, '10월 16일보다 3건 줄었어요'],
    [20, 20, '10월 16일과 같아요'],
  ])('오늘 기준 %i → %i: %s', (fromValue, toValue, sentence) => {
    expect(pendingTrendSummary({ from: { date: '2026-10-16', value: fromValue }, to: { date: '2026-10-29', value: toValue, isToday: true } }))
      .toBe(sentence);
  });

  it('오늘을 못 불러왔으면 마지막 기록일의 하루 끝 기준이라고 밝힌다(지금 숫자로 읽히지 않게)', () => {
    expect(pendingTrendSummary({ from: { date: '2026-10-16', value: 18 }, to: { date: '2026-10-28', value: 28, isToday: false } }))
      .toBe('10월 28일 하루 끝은 10월 16일보다 10건 늘었어요');
  });
});

describe('막대 하나의 표·툴팁 문구 — 하루 끝과 지금, 0·기록 없음·못 불러옴을 구분한다', () => {
  it.each<[PendingTrendBar, string, string]>([
    [{ date: '2026-10-28', isToday: false, kind: 'value', value: 18 }, '10월 28일 하루 끝', '18건'],
    [{ date: '2026-10-28', isToday: false, kind: 'value', value: 0 }, '10월 28일 하루 끝', '0건'],
    [{ date: '2026-10-17', isToday: false, kind: 'missing' }, '10월 17일', '기록 없음'],
    [{ date: '2026-10-30', isToday: true, kind: 'value', value: 20 }, '오늘 지금', '20건'],
    [{ date: '2026-10-30', isToday: true, kind: 'unavailable' }, '오늘', '불러오지 못했어요'],
  ])('%o → %s · %s', (bar, dateText, valueText) => {
    expect(pendingTrendBarDateText(bar)).toBe(dateText);
    expect(pendingTrendBarValueText(bar)).toBe(valueText);
  });
});

describe('recentFlowText', () => {
  it('최근 N일 접수·처리를 한 줄로 쓴다', () => {
    expect(recentFlowText({ days: 7, receivedCount: 31, handledCount: 27 })).toBe('최근 7일 접수 31건 · 처리 27건');
  });
});
