import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type {
  CalEvent,
  ClubEventCard,
  GlobalEventCard,
  MyClubSummary,
  RecruitmentSummary,
} from '@duing/types';

import { useApiClient } from './api-context';
import { clubEventKeys } from './clubEventQueryKeys';
import { useMyClubsQuery } from './clubs';
import { useGlobalEventListQuery } from './globalEvents';
import { useRecruitmentCalendarQuery } from './recruitments';

export type CalendarMonthOptions = {
  from: string;
  to: string;
  /**
   * 비로그인 시 false 로 호출 — myClubs / clubEvents skip.
   * 401 을 isError 로 잡지 않게 하기 위함.
   */
  isAuthenticated: boolean;
  /** mapper 3 개를 호출자에서 주입 — packages/hooks 가 apps/web 의 _lib 를 import 하지 않도록. */
  mappers: {
    toGlobal: (item: GlobalEventCard) => CalEvent;
    toRecruitment: (item: RecruitmentSummary) => CalEvent | null;
    toClubEvent: (item: ClubEventCard, club: MyClubSummary) => CalEvent;
  };
};

export type CalendarMonthResult = {
  events: CalEvent[];
  isLoading: boolean;
  isError: boolean;
  perDomain: {
    globalEventsError: boolean;
    recruitmentsError: boolean;
    clubEventsError: boolean;
  };
};

/**
 * "YYYY-MM-DD" + N days → "YYYY-MM-DD".
 * 월/년 경계 안전. UTC midnight 으로 파싱해 timezone 영향 없음.
 *
 * Upcoming 목록의 다일 이벤트 기간 표시 (`startDate + (span - 1)`) 등 호출자에서도 활용.
 */
export function addDaysIso(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function useCalendarMonthQuery(
  yearMonth: string,
  options: CalendarMonthOptions,
): CalendarMonthResult {
  const client = useApiClient();
  const { from, to, isAuthenticated, mappers } = options;

  const globalEvents = useGlobalEventListQuery({ from, to });
  const recruitments = useRecruitmentCalendarQuery(yearMonth);
  const myClubsQuery = useMyClubsQuery({ enabled: isAuthenticated });

  const myClubs = isAuthenticated ? (myClubsQuery.data ?? []) : [];

  // queryFn 안에서 club 을 클로저로 캡처 → data 는 CalEvent[].
  // 이 패턴으로 index 정렬 의존성 제거 + myClubs 순서가 바뀌어도 안전.
  const clubEventQueries = useQueries({
    queries: myClubs.map((club) => ({
      queryKey: clubEventKeys.list(club.clubId, { from, to }),
      queryFn: async (): Promise<CalEvent[]> => {
        const items = await client.clubEvents.list(club.clubId, { from, to });
        return items.map((item) => mappers.toClubEvent(item, club));
      },
      staleTime: 30 * 1000,
      enabled: isAuthenticated,
    })),
  });

  const events = useMemo<CalEvent[]>(() => {
    const merged: CalEvent[] = [];
    if (globalEvents.data) {
      // 다일 GlobalEvent (예: 박람회 6/9~6/15) 는 시작일~종료일 사이 모든 셀에 노출되어야 한다.
      // mapper 는 단일 CalEvent 를 반환하므로 여기서 day 단위로 fan-out.
      // span 은 첫 날에만 set — 그리드가 multi-day pill 을 그릴 때 활용 (선택 사항).
      // CalendarPage 의 그리드는 event.date 키로 lookup 하므로 각 셀에 매핑되어야 함.
      for (const item of globalEvents.data) {
        const baseEvent = mappers.toGlobal(item);
        const totalSpan = baseEvent.span ?? 1;
        for (let dayOffset = 0; dayOffset < totalSpan; dayOffset++) {
          merged.push({
            ...baseEvent,
            id: `${baseEvent.id}-d${dayOffset}`,
            date: addDaysIso(baseEvent.date, dayOffset),
            span: dayOffset === 0 ? totalSpan : undefined,
          });
        }
      }
    }
    if (recruitments.data) {
      for (const item of recruitments.data) {
        const mapped = mappers.toRecruitment(item);
        if (mapped) merged.push(mapped);
      }
    }
    for (const query of clubEventQueries) {
      if (query.data) merged.push(...query.data);
    }
    return merged;
  }, [globalEvents.data, recruitments.data, clubEventQueries, mappers]);

  const isLoading =
    globalEvents.isLoading
    || recruitments.isLoading
    || (isAuthenticated && myClubsQuery.isLoading)
    || clubEventQueries.some((query) => query.isLoading);

  const isError =
    globalEvents.isError
    || recruitments.isError
    || (isAuthenticated && myClubsQuery.isError)
    || clubEventQueries.some((query) => query.isError);

  return {
    events,
    isLoading,
    isError,
    perDomain: {
      globalEventsError: globalEvents.isError,
      recruitmentsError: recruitments.isError,
      clubEventsError:
        clubEventQueries.some((query) => query.isError)
        || (isAuthenticated && myClubsQuery.isError),
    },
  };
}
