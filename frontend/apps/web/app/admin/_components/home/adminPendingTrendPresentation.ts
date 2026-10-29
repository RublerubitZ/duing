import type { PendingTrendBar, PendingTrendComparison } from '@duing/hooks';
import type { AdminPendingTrend } from '@duing/types';

/** 막대를 그릴 최소 기록 수 — 미만이면 막대 대신 안내(막대 하나짜리 차트를 그리지 않는다). */
export const MIN_RECORDED_DAYS = 2;

export const PENDING_TREND_GUIDE = '매일 자정에 하루 한 번 기록해요. 며칠 지나면 추이가 보여요.';
export const RECENT_FLOW_SCOPE = '접수·처리는 신고·문의·시설 예약·홍보·회장 승계만 세요';
export const MISSING_DAY_LEGEND = '점선은 기록이 없는 날이에요';

/** "2026-10-16" → "10월 16일" — 날짜 문자열만 쪼개 기기 시간대와 무관하다. */
export function monthDayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

/** "2026-10-16" → "10/16" (x축 첫 날짜). */
export function shortDateLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${Number(month)}/${Number(day)}`;
}

/**
 * 판단 문장 — 화면 보조 줄과 막대 묶음 aria-label 에 같은 문장을 쓴다. 날짜는 늘 "…일" 로 끝나 조사는 "과"다.
 * 오늘을 못 불러와 마지막 기록일이 기준이면 "그날 하루 끝은 …" 으로 밝혀 지금 숫자로 읽히지 않게 한다.
 */
export function pendingTrendSummary(comparison: PendingTrendComparison): string {
  const fromLabel = monthDayLabel(comparison.from.date);
  const prefix = comparison.to.isToday ? '' : `${monthDayLabel(comparison.to.date)} 하루 끝은 `;
  const difference = comparison.to.value - comparison.from.value;
  if (difference === 0) return `${prefix}${fromLabel}과 같아요`;
  return difference > 0
    ? `${prefix}${fromLabel}보다 ${difference}건 늘었어요`
    : `${prefix}${fromLabel}보다 ${-difference}건 줄었어요`;
}

/** 표 날짜 칸·툴팁 앞부분 — 지난날은 "하루 끝", 오늘 값은 "지금". */
export function pendingTrendBarDateText(bar: PendingTrendBar): string {
  if (bar.isToday) return bar.kind === 'value' ? '오늘 지금' : '오늘';
  return bar.kind === 'value' ? `${monthDayLabel(bar.date)} 하루 끝` : monthDayLabel(bar.date);
}

/** 표 값 칸·툴팁 뒷부분. */
export function pendingTrendBarValueText(bar: PendingTrendBar): string {
  switch (bar.kind) {
    case 'value':
      return `${bar.value}건`;
    case 'missing':
      return '기록 없음';
    case 'unavailable':
      return '불러오지 못했어요';
  }
}

export function recentFlowText(recentFlow: AdminPendingTrend['recentFlow']): string {
  return `최근 ${recentFlow.days}일 접수 ${recentFlow.receivedCount}건 · 처리 ${recentFlow.handledCount}건`;
}
