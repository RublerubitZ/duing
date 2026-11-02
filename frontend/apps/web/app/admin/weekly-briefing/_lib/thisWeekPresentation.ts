import { addDaysIso } from '@duing/hooks';
import { kstDateString, kstDateTimeFormatter } from '@duing/hooks/datetime';

import { monthDayLabel } from '@/app/admin/_components/home/adminPendingTrendPresentation';

export const CLOSING_EMPTY_TEXT = '이번 주에 모집 기간이 끝나는 모집이 없어요';
export const EVENTS_EMPTY_TEXT = '다음 주까지 잡힌 행사가 없어요';
export const THIS_WEEK_FAILED_TEXT = '이번 주 일정을 불러오지 못했어요';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const UPDATED_AT_FORMAT = kstDateTimeFormatter({ month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** 달력 날짜의 요일 — 입력이 날짜뿐이라 UTC 요일로 계산해도 기기 시간대와 무관하다. */
const weekdayOf = (isoDate: string) => WEEKDAY_LABELS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()] ?? '';
const monthOf = (isoDate: string) => Number(isoDate.split('-')[1]);
const dayOf = (isoDate: string) => Number(isoDate.split('-')[2]);

/** 둘째 구역 머리 — 이번 주 모집 조회를 받은 시각(KST). */
export const updatedAtText = (updatedAtMs: number) => `지금 기준 ${UPDATED_AT_FORMAT.format(new Date(updatedAtMs))}`;

/** 종료일 — 기간이 지났으면(isRecruitmentExpiredOpen) "11월 3일 종료"(옆에 '기간 종료' 칩), 아니면 "11월 6일(금) 종료". */
export function closingEndText(endDate: string, isExpired: boolean): string {
  return isExpired ? `${monthDayLabel(endDate)} 종료` : `${monthDayLabel(endDate)}(${weekdayOf(endDate)}) 종료`;
}

/** 다가오는 행사 — 오늘 ~ 다음 주 일요일(이번 주 월요일 + 13). 공개 행사 API 의 to 는 그날 끝까지라 일요일 행사가 든다. */
export function upcomingEventsRange(todayIso: string, currentMonday: string): { from: string; to: string } {
  return { from: todayIso, to: addDaysIso(currentMonday, 13) };
}

/** "11월 5일 – 15일" / "11월 26일 – 12월 6일" */
export function shortRangeText(fromIso: string, toIso: string): string {
  return `${monthDayLabel(fromIso)} – ${monthOf(fromIso) === monthOf(toIso) ? `${dayOf(toIso)}일` : monthDayLabel(toIso)}`;
}

/** 행사 기간 — 하루면 "11월 5일(목)", 여러 날이면 "11월 5일(목) – 7일(토)". 오프셋 없는 일정 시각은 KST 로 읽는다. */
export function eventPeriodText(startAt: string, endAt: string): string {
  const startDate = kstDateString(startAt);
  const endDate = kstDateString(endAt);
  const startText = `${monthDayLabel(startDate)}(${weekdayOf(startDate)})`;
  if (startDate === endDate) return startText;
  const endText = monthOf(startDate) === monthOf(endDate) ? `${dayOf(endDate)}일` : monthDayLabel(endDate);
  return `${startText} – ${endText}(${weekdayOf(endDate)})`;
}
