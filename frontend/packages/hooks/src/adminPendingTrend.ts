import type { AdminPendingTrendDay } from '@duing/types';

import { addDaysIso } from './calendarMonth';

/** 처리 대기 추이 막대 하나. 0건(value 0)·기록 없음(missing)·오늘 못 불러옴(unavailable)은 서로 다른 막대다. */
export type PendingTrendBar =
  | { date: string; isToday: boolean; kind: 'value'; value: number }
  | { date: string; isToday: boolean; kind: 'missing' }
  | { date: string; isToday: boolean; kind: 'unavailable' };

/** 판단 문장의 두 끝 — 기록이 있는 첫 막대와 비교 기준 막대(오늘 값, 오늘을 못 불러왔으면 마지막 기록일). */
export type PendingTrendComparison = {
  from: { date: string; value: number };
  to: { date: string; value: number; isToday: boolean };
};

type ValueBar = Extract<PendingTrendBar, { kind: 'value' }>;

/** 기록 부족 판정의 단일 기준 — 저장값이 있는 지난날 수(0 도 기록이다). */
export function recordedDayCount(days: AdminPendingTrendDay[]): number {
  return days.filter((day) => day.totalPendingCount !== null).length;
}

/**
 * 지난 13일 기록 + 오늘 값 → 막대 14개(마지막이 오늘).
 * 오늘 날짜는 응답 마지막 날 + 1일 — 기기 시간대를 쓰지 않고, 자정 직후 캐시된 응답이어도 날짜가 이어진다.
 * todayTotal 이 null 이면 pending-counts 조회 실패라 오늘 막대는 unavailable 이다.
 */
export function buildPendingTrendBars(days: AdminPendingTrendDay[], todayTotal: number | null): PendingTrendBar[] {
  const lastDay = days.at(-1);
  if (!lastDay) return [];
  const pastBars = days.map<PendingTrendBar>((day) =>
    day.totalPendingCount === null
      ? { date: day.date, isToday: false, kind: 'missing' }
      : { date: day.date, isToday: false, kind: 'value', value: day.totalPendingCount },
  );
  const todayDate = addDaysIso(lastDay.date, 1);
  const todayBar: PendingTrendBar =
    todayTotal === null
      ? { date: todayDate, isToday: true, kind: 'unavailable' }
      : { date: todayDate, isToday: true, kind: 'value', value: todayTotal };
  return [...pastBars, todayBar];
}

/** 값 막대가 2개 미만이면 null — 비교할 두 끝이 없다. */
export function pendingTrendComparison(bars: PendingTrendBar[]): PendingTrendComparison | null {
  const valueBars = bars.filter((bar): bar is ValueBar => bar.kind === 'value');
  const firstBar = valueBars[0];
  const lastBar = valueBars.at(-1);
  if (!firstBar || !lastBar || valueBars.length < 2) return null;
  return {
    from: { date: firstBar.date, value: firstBar.value },
    to: { date: lastBar.date, value: lastBar.value, isToday: lastBar.isToday },
  };
}
