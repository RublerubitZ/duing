import type {
  CalEvent,
  ClubEventCard,
  GlobalEventCard,
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
  // 강제 마감돼 종료일이 아직 미래인 모집도 달력에는 그대로 남는다 — "모집 일정 달력"이라
  // 지난 일정이 사라지면 달력이 아니게 된다. 대신 회색으로 눕히고 지원 동선에서 뺀다.
  // 판정은 표기 축(displayStatus)이다 — 학생 화면이라 기간이 끝났으면 지원할 수 없는 게 맞다.
  const closed = item.displayStatus === 'CLOSED';
  return {
    id: `r-${item.id}`,
    sourceType: 'recruitment',
    sourceId: item.id,
    sourceClubId: item.clubId,
    sourceClosed: closed,
    kind: 'deadline',
    accent: closed ? 'muted' : 'coral',
    date: item.endDate,
    title: `${item.clubName} 모집 마감${closed ? ' (종료)' : ''}`,
    time: '23:59',
    place: '지원폼',
    club: item.clubName,
  };
}

// club 은 출처 표시에 쓰는 두 필드만 받는다 — 내 동아리 요약(MyClubSummary)과 총동연 집계 응답
// 양쪽이 그대로 만족한다. 넓게 받으면 총동연 경로에서 쓰지도 않는 로고·역할·가입일을 날조해야 한다.
export function toCalEvent_clubEvent(
  item: ClubEventCard,
  club: { clubId: number; clubName: string },
): CalEvent {
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
