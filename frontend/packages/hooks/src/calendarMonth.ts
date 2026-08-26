import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type {
  CalEvent,
  ClubEventCard,
  GlobalEventCard,
  RecruitmentSummary,
} from '@duing/types';

import { adminQueryKeys } from './adminQueryKeys';
import { useApiClient } from './api-context';
import { clubEventKeys } from './clubEventQueryKeys';
import { useMyClubsQuery } from './clubs';
import { CALENDAR_STALE_TIME_MS } from './freshness';
import { globalEventKeys } from './globalEventQueryKeys';
import { recruitmentQueryKeys } from './recruitmentQueryKeys';

export type CalendarMonthOptions = {
  /**
   * 비로그인 시 false 로 호출 — myClubs / clubEvents skip.
   * 401 을 isError 로 잡지 않게 하기 위함.
   */
  isAuthenticated: boolean;
  /**
   * 총동연(ADMIN) 이면 동아리별 조회 대신 전 동아리 집계 1건으로 대체한다. 두 경로는 배타 —
   * ADMIN 이 어느 동아리의 멤버이더라도 그 결과는 집계 응답의 부분집합이라 요청만 늘어난다.
   *
   * <p>role 은 호출자가 판정해 주입한다(`isAuthenticated` 와 같은 패턴) — packages/hooks 가
   * auth 에 묶이지 않게 하기 위함이다.
   */
  isAdmin: boolean;
  /** mapper 3 개를 호출자에서 주입 — packages/hooks 가 apps/web 의 _lib 를 import 하지 않도록. */
  mappers: {
    toGlobal: (item: GlobalEventCard) => CalEvent;
    toRecruitment: (item: RecruitmentSummary) => CalEvent | null;
    /** club 은 출처 표시에 필요한 두 필드만 받는다 — 내 동아리 요약과 집계 응답 양쪽이 만족한다. */
    toClubEvent: (item: ClubEventCard, club: { clubId: number; clubName: string }) => CalEvent;
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

/** "YYYY-MM" → 그 달의 1일·말일. UTC 파싱이라 타임존 영향 없음. */
export function monthBounds(yearMonth: string): { from: string; to: string } {
  const first = new Date(`${yearMonth}-01T00:00:00Z`);
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * [fromIso, toIso] 구간이 걸치는 "YYYY-MM" 목록.
 *
 * <p>30일 창은 최대 **3개** 달에 걸친다 — 2월이 28·29일이라 1월 말에는 2월이 통째로 들어간다
 * (2027-01-31 + 30일 = 2027-03-02). "이번 달 + 다음 달" 고정은 그 구간에서 누락을 만든다.
 */
export function monthsInRange(fromIso: string, toIso: string): string[] {
  const lastMonth = toIso.slice(0, 7);
  const months: string[] = [];
  let cursor = `${fromIso.slice(0, 7)}-01`;
  // 창 길이가 30일이라 실제로는 3회 이하지만, 잘못된 입력에서 무한 루프가 나지 않도록 상한을 둔다.
  for (let guard = 0; guard < 24; guard += 1) {
    const month = cursor.slice(0, 7);
    months.push(month);
    if (month >= lastMonth) break;
    const next = new Date(`${cursor}T00:00:00Z`);
    // day 를 1 로 함께 지정 — 31일에서 setUTCMonth 만 쓰면 다음 달을 건너뛴다.
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return months;
}

/**
 * 여러 달을 한 번에 조회해 CalEvent 로 병합한다.
 *
 * <p>월 개수가 가변이라 훅을 반복 호출할 수 없으므로(Hooks 규칙) 목록을 인자로 받아 내부에서
 * useQueries 로 처리한다. 쿼리 키는 월 단위로 유지해 캘린더 그리드 조회와 캐시가 겹치게 한다.
 *
 * <p>반환은 **월별 결과가 아니라 병합된 평탄 배열**이다. 병합에 들어가는 것(mapper 적용, 다일 행사
 * fan-out, 달 경계 중복 제거)은 "월 단위로 쪼개 조회했다"는 전송 사정이지 도메인 규칙이 아니다.
 * 창·필터·정렬·limit 같은 도메인 규칙은 소비처가 갖는다(apps/web 의 buildUpcoming).
 * 정렬은 보장하지 않는다.
 */
export function useCalendarMonthsQuery(
  yearMonths: string[],
  options: CalendarMonthOptions,
): CalendarMonthResult {
  const client = useApiClient();
  const { isAuthenticated, isAdmin, mappers } = options;

  const monthsKey = yearMonths.join(',');
  const ranges = useMemo(
    // 빈 배열이면 ''.split(',') 가 [''] 이 되어 Invalid Date 로 만든 엉터리 범위를 요청하게 된다.
    () =>
      monthsKey === ''
        ? []
        : monthsKey.split(',').map((yearMonth) => ({ yearMonth, ...monthBounds(yearMonth) })),
    [monthsKey],
  );

  // 동아리별 경로를 쓰는 조건 — ADMIN 은 집계 1건으로 대체하므로 내 동아리 목록조차 필요 없다.
  const usesMyClubEvents = isAuthenticated && !isAdmin;
  const myClubsQuery = useMyClubsQuery({ enabled: usesMyClubEvents });
  const myClubs = usesMyClubEvents ? (myClubsQuery.data ?? []) : [];

  // 캘린더 축은 CALENDAR_STALE_TIME_MS(freshness.ts)로 계층화한다 — 마감일·일정은 초 단위로
  // 바뀌지 않고, 관측자가 그리드·Upcoming·단독 훅 여럿이라 같은 키의 staleTime 을 반드시 공유한다.
  const globalEventQueries = useQueries({
    queries: ranges.map((range) => ({
      queryKey: globalEventKeys.publicList({ from: range.from, to: range.to }),
      queryFn: () => client.globalEvents.list({ from: range.from, to: range.to }),
      staleTime: CALENDAR_STALE_TIME_MS,
    })),
  });

  const recruitmentQueries = useQueries({
    queries: ranges.map((range) => ({
      queryKey: recruitmentQueryKeys.calendar(range.yearMonth),
      queryFn: () => client.recruitments.calendar(range.yearMonth),
      staleTime: CALENDAR_STALE_TIME_MS,
    })),
  });

  // queryFn 안에서 club 을 클로저로 캡처 → data 는 CalEvent[].
  // 이 패턴으로 index 정렬 의존성 제거 + myClubs 순서가 바뀌어도 안전.
  const clubEventQueries = useQueries({
    queries: myClubs.flatMap((club) =>
      ranges.map((range) => ({
        queryKey: clubEventKeys.list(club.clubId, { from: range.from, to: range.to }),
        queryFn: async (): Promise<CalEvent[]> => {
          const items = await client.clubEvents.list(club.clubId, {
            from: range.from,
            to: range.to,
          });
          return items.map((item) => mappers.toClubEvent(item, club));
        },
        enabled: usesMyClubEvents,
        staleTime: CALENDAR_STALE_TIME_MS,
      })),
    ),
  });

  // 총동연 경로 — 동아리 수와 무관하게 월당 1건. 동아리별 경로와 배타이므로 둘 중 하나만 쿼리를 만든다.
  const adminClubEventQueries = useQueries({
    queries: (isAdmin ? ranges : []).map((range) => ({
      queryKey: adminQueryKeys.clubEventsList({ from: range.from, to: range.to }),
      queryFn: async (): Promise<CalEvent[]> => {
        const items = await client.admin.clubEvents.list({ from: range.from, to: range.to });
        return items.map((item) =>
          mappers.toClubEvent(item, { clubId: item.clubId, clubName: item.clubName }),
        );
      },
    })),
  });

  // useQueries 반환 배열은 매 렌더 새 참조라 배열 자체를 의존성으로 두면 병합이 매번 다시 돈다.
  // 실제로 결과가 바뀐 시점(dataUpdatedAt)만 신호로 삼되, **무엇을 조회 중인지도 함께** 담는다 —
  // 여러 달을 병렬로 받으면 캐시 타임스탬프가 같은 ms 로 겹칠 수 있고, 그때 월 목록이 빠져 있으면
  // 달을 바꿔도 시그니처가 동일해 이전 달 결과가 그대로 남는다.
  const dataSignature = [
    monthsKey,
    myClubs.map((club) => club.clubId).join(','),
    ...[
      ...globalEventQueries,
      ...recruitmentQueries,
      ...clubEventQueries,
      ...adminClubEventQueries,
    ].map((query) => query.dataUpdatedAt),
  ].join('|');

  const events = useMemo<CalEvent[]>(() => {
    const merged: CalEvent[] = [];
    // 달 경계를 걸친 다일 행사는 두 달 응답에 모두 담긴다. **fan-out 전에** 원본 단위로 먼저 접는다 —
    // 펼친 뒤에 접으면 두 응답의 기간이 다를 때(그 사이 관리자가 수정) 옛 버전이 만든 뒤쪽 날짜가
    // 유령으로 남아 같은 셀에 행사가 두 번 그려진다.
    const globalBaseEvents = new Map<string, CalEvent>();
    for (const query of globalEventQueries) {
      if (!query.data) continue;
      for (const item of query.data) {
        const baseEvent = mappers.toGlobal(item);
        globalBaseEvents.set(baseEvent.id, baseEvent);
      }
    }
    // 다일 GlobalEvent (예: 박람회 6/9~6/15) 는 시작일~종료일 사이 모든 셀에 노출되어야 한다.
    // mapper 는 단일 CalEvent 를 반환하므로 여기서 day 단위로 fan-out.
    // span 은 첫 날에만 set — 그리드가 multi-day pill 을 그릴 때 활용 (선택 사항).
    for (const baseEvent of globalBaseEvents.values()) {
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
    for (const query of recruitmentQueries) {
      if (!query.data) continue;
      for (const item of query.data) {
        const mapped = mappers.toRecruitment(item);
        if (mapped) merged.push(mapped);
      }
    }
    for (const query of [...clubEventQueries, ...adminClubEventQueries]) {
      if (query.data) merged.push(...query.data);
    }
    // 달 경계를 걸친 다일 행사는 두 달의 응답에 모두 담겨 같은 id 가 중복될 수 있다.
    const byId = new Map<string, CalEvent>();
    for (const event of merged) byId.set(event.id, event);
    return Array.from(byId.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 쿼리 배열 대신 내용 시그니처로 비교한다.
  }, [dataSignature, mappers]);

  // 동아리 일정 로딩·오류는 두 경로를 함께 본다 — ADMIN 경로를 빼면 집계를 받는 동안 isLoading 이
  // false 라 "일정이 없어요" 가 떴다가 채워지고, 실패해도 오류 배너가 뜨지 않는다.
  const clubEventsLoading =
    (usesMyClubEvents && myClubsQuery.isLoading)
    || clubEventQueries.some((query) => query.isLoading)
    || adminClubEventQueries.some((query) => query.isLoading);

  const clubEventsError =
    (usesMyClubEvents && myClubsQuery.isError)
    || clubEventQueries.some((query) => query.isError)
    || adminClubEventQueries.some((query) => query.isError);

  const isLoading =
    globalEventQueries.some((query) => query.isLoading)
    || recruitmentQueries.some((query) => query.isLoading)
    || clubEventsLoading;

  const isError =
    globalEventQueries.some((query) => query.isError)
    || recruitmentQueries.some((query) => query.isError)
    || clubEventsError;

  return {
    events,
    isLoading,
    isError,
    perDomain: {
      globalEventsError: globalEventQueries.some((query) => query.isError),
      recruitmentsError: recruitmentQueries.some((query) => query.isError),
      clubEventsError,
    },
  };
}

/**
 * 단일 달 조회 — 기존 호출처(캘린더 그리드) 호환용 래퍼.
 *
 * <p>options.from/to 는 monthBounds(yearMonth) 와 같은 값이라 내부에서 다시 유도한다
 * (쿼리 키가 달라지지 않는다).
 */
export function useCalendarMonthQuery(
  yearMonth: string,
  options: CalendarMonthOptions,
): CalendarMonthResult {
  const yearMonths = useMemo(() => [yearMonth], [yearMonth]);
  return useCalendarMonthsQuery(yearMonths, options);
}
