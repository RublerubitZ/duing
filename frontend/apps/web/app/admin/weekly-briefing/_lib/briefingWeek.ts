import { addDaysIso } from '@duing/hooks';
import { todayKstDateString } from '@duing/hooks/datetime';

import { monthDayLabel } from '@/app/admin/_components/home/adminPendingTrendPresentation';

/** 돌아볼 수 있는 가장 이른 주 — 이번 주 월요일에서 52주 전(서버 WeekBounds.HISTORY_WEEKS 와 같다). */
export const WEEK_HISTORY_WEEKS = 52;
const DAYS_IN_WEEK = 7;

export const TOO_OLD_NOTICE = '1년 전까지만 볼 수 있어요.';

/** 그 날짜가 든 주의 월요일. 입력이 달력 날짜뿐이라 UTC 요일로 계산해도 기기 시간대와 무관하다. */
export function mondayOf(isoDate: string): string {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0 = 일요일
  return addDaysIso(isoDate, -((weekday + 6) % DAYS_IN_WEEK));
}

export type BriefingWeekRange = {
  /** 이번 주(진행 중) 월요일 */
  currentMonday: string;
  /** 가장 최근에 끝난 주 — 처음 들어오면 보는 주 */
  latestWeek: string;
  /** 가장 이른 주 */
  oldestWeek: string;
};

/** 지금(KST) 기준 주 범위 — 서버 식(이번 주 월요일 M, M − 52·7 ≤ W ≤ M − 7)과 같다. */
export function briefingWeekRange(now: Date): BriefingWeekRange {
  const currentMonday = mondayOf(todayKstDateString(now));
  return {
    currentMonday,
    latestWeek: addDaysIso(currentMonday, -DAYS_IN_WEEK),
    oldestWeek: addDaysIso(currentMonday, -DAYS_IN_WEEK * WEEK_HISTORY_WEEKS),
  };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 실제 달력 날짜인가 — 2026-02-30 처럼 넘치는 값은 Date 가 다음 달로 굴려 왕복이 어긋난다. */
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return false;
  return addDaysIso(value, 0) === value;
}

export type WeekResolution = { weekStart: string; notice: string | null };

/**
 * 주소의 week 값을 보여 줄 주로 정한다. 날짜로 읽히지 않으면 최근 주(알림 없음), 월요일이 아니면 그 주 월요일로 맞춘다.
 * 진행 중인 주·미래·52주보다 이른 주는 최근 주로 바꾸고 한 줄 알림을 준다. 날짜 문자열은 사전순 = 날짜순이다.
 */
export function resolveRequestedWeek(requested: string | null, range: BriefingWeekRange): WeekResolution {
  if (requested === null || !isCalendarDate(requested)) return { weekStart: range.latestWeek, notice: null };
  const monday = mondayOf(requested);
  if (monday > range.latestWeek) {
    return { weekStart: range.latestWeek, notice: `${monthDayLabel(monday)} 주는 아직 끝나지 않아 지난주를 보여 드려요.` };
  }
  if (monday < range.oldestWeek) return { weekStart: range.latestWeek, notice: TOO_OLD_NOTICE };
  return { weekStart: monday, notice: null };
}
