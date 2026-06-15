import type {
  CalEvent,
  ClubEventCard,
  GlobalEventCard,
  MyClubSummary,
  RecruitmentSummary,
} from '@duing/types';
import { formatRange, spanDays } from './monthRange';

export function toCalEvent_global(item: GlobalEventCard): CalEvent {
  return {
    id: `g-${item.id}`,
    sourceType: 'global',
    sourceId: item.id,
    kind: 'system',
    accent: 'warm',
    date: item.startAt.slice(0, 10),
    title: item.title,
    time: formatRange(item.startAt, item.endAt),
    place: item.location ?? '',
    club: null,
    span: spanDays(item.startAt, item.endAt),
  };
}

export function toCalEvent_recruitment(item: RecruitmentSummary): CalEvent | null {
  if (item.endDate === null) return null; // 상시모집 — 캘린더 표시 대상 아님
  return {
    id: `r-${item.id}`,
    sourceType: 'recruitment',
    sourceId: item.id,
    kind: 'deadline',
    accent: 'coral',
    date: item.endDate,
    title: `${item.clubName} 모집 마감`,
    time: '23:59',
    place: '지원폼',
    club: item.clubName,
  };
}

export function toCalEvent_clubEvent(item: ClubEventCard, club: MyClubSummary): CalEvent {
  return {
    id: `c-${item.id}`,
    sourceType: 'clubEvent',
    sourceId: item.id,
    sourceClubId: club.clubId,
    kind: 'event',
    accent: 'sage',
    date: item.startAt.slice(0, 10),
    title: item.title,
    time: formatRange(item.startAt, item.endAt),
    place: item.location ?? '',
    club: club.clubName,
  };
}

// 참고: Recruitment API 는 month 기준이며, 백엔드는 해당 월과 기간이 겹치는 모집을 모두 반환.
// May 호출이 endDate=June 인 모집을 포함할 수 있고 mapper 가 찍은 date 가 viewMonth 와 다를 수 있음.
// CalendarPage 그리드는 event.date 의 prefix 로 필터링하므로 자동 드랍 — 정상 동작.
