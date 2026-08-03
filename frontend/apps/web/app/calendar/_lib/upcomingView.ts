import { addDaysIso } from '@duing/hooks';

import type { AccentStyle, CalEvent } from '../_types';
import { ACCENT, KIND_LABEL } from './calendarDisplay';

export type UpcomingView = {
  /** '08.31' */
  dateLabel: string;
  /** '월' */
  weekdayLabel: string;
  /** 'D-DAY' | 'D-28' */
  dday: string;
  title: string;
  /** '지원폼 · FLYING' — 동아리가 없으면 장소만 */
  placeLabel: string;
  /** 다일 이벤트만 '8/10 ~ 8/12', 아니면 null */
  periodLabel: string | null;
  kindLabel: string;
  timeLabel: string;
  accent: AccentStyle;
};

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

function toLocalDate(iso: string): Date {
  const parts = iso.split('-').map(Number);
  return new Date(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

function shortDate(iso: string): string {
  const parts = iso.split('-').map(Number);
  return `${parts[1] ?? 0}/${parts[2] ?? 0}`;
}

/**
 * 목록 표시에 필요한 문자열만 만든다 — 데스크탑 카드와 모바일 타임라인이 같은 값을 소비해
 * 날짜 표기·D-Day 가 갈라질 수 없게 한다. 각 컴포넌트는 필요한 필드만 골라 쓴다.
 */
export function toUpcomingView(event: CalEvent, todayIso: string): UpcomingView {
  const eventDate = toLocalDate(event.date);
  const daysLeft = Math.round(
    (eventDate.getTime() - toLocalDate(todayIso).getTime()) / 86_400_000,
  );
  const span = event.span ?? 1;

  return {
    dateLabel: event.date.slice(5).replace('-', '.'),
    weekdayLabel: WEEKDAY_KR[eventDate.getDay()] ?? '',
    dday: daysLeft === 0 ? 'D-DAY' : `D-${daysLeft}`,
    title: event.title,
    placeLabel: event.club ? `${event.place} · ${event.club}` : event.place,
    periodLabel:
      span >= 2 ? `${shortDate(event.date)} ~ ${shortDate(addDaysIso(event.date, span - 1))}` : null,
    kindLabel: KIND_LABEL[event.kind],
    timeLabel: event.time,
    accent: ACCENT[event.accent],
  };
}
