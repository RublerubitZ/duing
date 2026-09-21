// 제출 준비 조회 기간 — 기본은 "오늘 ~ 다음 달 말일"(승인 예약의 대부분이 승인 시점의 다음 달 예약, 스펙 §2.2 B1).
// 프리셋(이번 달·다음 달·이번+다음 달)도 여기서 만든다. 워크플로 탭 건수(셸)와 준비 탭이 같은 기본값을
// 공유해야 React Query 캐시가 하나로 합쳐진다. 날짜는 KST 달력 기준(브라우저 로컬·CI UTC 무관).
import { todayKstDateString } from '@duing/hooks/datetime';

export type SubmissionDateRange = { startDate: string; endDate: string };

/** 'YYYY-MM-DD' 문자열의 연·월(0-based)·일 — 문자열 슬라이스라 타임존 영향이 없다. */
function kstCalendarOf(now: Date): { year: number; monthIndex: number } {
  const today = todayKstDateString(now);
  return { year: Number(today.slice(0, 4)), monthIndex: Number(today.slice(5, 7)) - 1 };
}

/** UTC 자정으로 만든 뒤 ISO 앞 10자리 — day=0 은 전달 말일(월 넘김은 Date.UTC 가 처리). */
function isoDate(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

export function defaultSubmissionRange(now: Date = new Date()): SubmissionDateRange {
  const { year, monthIndex } = kstCalendarOf(now);
  return { startDate: todayKstDateString(now), endDate: isoDate(year, monthIndex + 2, 0) };
}

export function currentMonthRange(now: Date = new Date()): SubmissionDateRange {
  const { year, monthIndex } = kstCalendarOf(now);
  return { startDate: isoDate(year, monthIndex, 1), endDate: isoDate(year, monthIndex + 1, 0) };
}

export function nextMonthRange(now: Date = new Date()): SubmissionDateRange {
  const { year, monthIndex } = kstCalendarOf(now);
  return { startDate: isoDate(year, monthIndex + 1, 1), endDate: isoDate(year, monthIndex + 2, 0) };
}

export function currentAndNextMonthRange(now: Date = new Date()): SubmissionDateRange {
  const { year, monthIndex } = kstCalendarOf(now);
  return { startDate: isoDate(year, monthIndex, 1), endDate: isoDate(year, monthIndex + 2, 0) };
}
