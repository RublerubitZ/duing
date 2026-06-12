import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import type {
  ActionItem,
  ApplicantStatusTotals,
  ClubEventCard,
  InterviewRoundDetail,
  InterviewRoundSummary,
  RecruitmentSummary,
  StatsSummary,
  TodayScheduleItem,
} from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';
import { recruitmentQueryKeys } from './recruitmentQueryKeys';
import { interviewRoundKeys } from './interviewRoundQueryKeys';
import { dashboardQueryKeys } from './dashboardQueryKeys';
import { isTodayKst, todayKstDateString } from './dashboardDate';
import {
  ACTION_ITEM_PREVIEW_COUNT,
  aggregateApplicantTotals,
  buildActionItems,
  sortActionItems,
  sortTodaySchedule,
  type RecruitmentDashboardInput,
} from './dashboardSelectors';

export const DASHBOARD_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 300_000 } as const;

function isActive(recruitment: RecruitmentSummary): boolean {
  return recruitment.displayStatus !== 'CLOSED';
}

/** 카드2: CLOSED 제외 진행 중 모집 */
export function useActiveRecruitments(clubId: number | undefined) {
  const client = useApiClient();
  const query = useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.recruitments(clubId) : ['clubs', undefined, 'recruitments'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubs.recruitmentsByClub(clubId);
    },
    enabled: clubId !== undefined,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const data = useMemo(() => query.data?.filter(isActive), [query.data]);
  return { ...query, data };
}

/** 카드3: 진행 중 모집들의 단계별 지원자 통계 합산 */
export function useApplicantSummary(clubId: number | undefined): {
  totals: ApplicantStatusTotals;
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const recruitments = useActiveRecruitments(clubId);
  const ids = recruitments.data?.map((r) => r.id) ?? [];

  const statsQueries = useQueries({
    queries: ids.map((recruitmentId) => ({
      queryKey: recruitmentQueryKeys.statsSummary(recruitmentId),
      queryFn: () => client.stats.summary(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const totals = useMemo(
    () => aggregateApplicantTotals(statsQueries.map((q) => q.data as StatsSummary | undefined)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statsQueries],
  );

  return {
    totals,
    isLoading: recruitments.isLoading || statsQueries.some((q) => q.isLoading),
    isError: recruitments.isError || statsQueries.some((q) => q.isError),
  };
}

/** 카드1: 처리 필요 업무 — 총 건수 + 정렬된 상위 미리보기 */
export function useClubActionItems(clubId: number | undefined): {
  items: ActionItem[];
  preview: ActionItem[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const recruitments = useActiveRecruitments(clubId);
  const list = recruitments.data ?? [];
  const ids = list.map((r) => r.id);

  const statsQueries = useQueries({
    queries: ids.map((recruitmentId) => ({
      queryKey: recruitmentQueryKeys.statsSummary(recruitmentId),
      queryFn: () => client.stats.summary(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const roundsQueries = useQueries({
    queries: ids.map((recruitmentId) => ({
      queryKey: interviewRoundKeys.list(recruitmentId),
      queryFn: () => client.interviewRounds.list(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const items = useMemo(() => {
    const inputs: RecruitmentDashboardInput[] = list.map((recruitment, index) => ({
      recruitment,
      stats: statsQueries[index]?.data as StatsSummary | undefined,
      rounds: roundsQueries[index]?.data as InterviewRoundSummary[] | undefined,
    }));
    return sortActionItems(buildActionItems(inputs, new Date()));
  }, [list, statsQueries, roundsQueries]);

  return {
    items,
    preview: items.slice(0, ACTION_ITEM_PREVIEW_COUNT),
    totalCount: items.length,
    isLoading: recruitments.isLoading || statsQueries.some((q) => q.isLoading) || roundsQueries.some((q) => q.isLoading),
    isError: recruitments.isError || statsQueries.some((q) => q.isError) || roundsQueries.some((q) => q.isError),
  };
}

/** 카드4: 오늘 일정 — 오늘 면접 슬롯 + 오늘 클럽 이벤트 */
export function useTodaySchedule(clubId: number | undefined): {
  items: TodayScheduleItem[];
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const now = new Date();
  const today = todayKstDateString(now);

  const recruitments = useActiveRecruitments(clubId);
  const recruitmentIds = (recruitments.data ?? []).map((r) => r.id);

  const roundsQueries = useQueries({
    queries: recruitmentIds.map((recruitmentId) => ({
      queryKey: interviewRoundKeys.list(recruitmentId),
      queryFn: () => client.interviewRounds.list(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const scheduledRoundIds = useMemo(() => {
    const ids: number[] = [];
    for (const query of roundsQueries) {
      for (const round of (query.data as InterviewRoundSummary[] | undefined) ?? []) {
        if (round.status === 'SCHEDULED') ids.push(round.roundId);
      }
    }
    return ids;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundsQueries]);

  const detailQueries = useQueries({
    queries: scheduledRoundIds.map((roundId) => ({
      queryKey: interviewRoundKeys.detail(roundId),
      queryFn: () => client.interviewRounds.detail(roundId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
  });

  const eventsQuery = useQuery({
    queryKey: clubId !== undefined ? dashboardQueryKeys.todayEvents(clubId, today) : ['dashboard', undefined, 'today-events'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubEvents.list(clubId, { from: today, to: today });
    },
    enabled: clubId !== undefined,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  // SCHEDULED 라운드 상세에서 오늘·배정된 슬롯 → 면접 아이템 매핑을 위해
  // 라운드 메타(recruitmentId)가 필요하므로 round→recruitment 매핑을 만든다.
  const roundMeta = useMemo(() => {
    const map = new Map<number, { recruitmentId: number; title: string }>();
    recruitmentIds.forEach((recruitmentId, index) => {
      for (const round of (roundsQueries[index]?.data as InterviewRoundSummary[] | undefined) ?? []) {
        map.set(round.roundId, { recruitmentId, title: round.title });
      }
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruitmentIds, roundsQueries]);

  const items = useMemo(() => {
    const interviewItems: TodayScheduleItem[] = [];
    for (const query of detailQueries) {
      const detail = query.data as InterviewRoundDetail | undefined;
      if (!detail) continue;
      const meta = roundMeta.get(detail.roundId);
      for (const slot of detail.slots) {
        if (slot.assignedCount > 0 && isTodayKst(slot.startTime, now)) {
          interviewItems.push({
            kind: 'INTERVIEW',
            title: detail.title,
            startAt: slot.startTime,
            endAt: slot.endTime,
            location: detail.location,
            recruitmentId: meta?.recruitmentId,
            roundId: detail.roundId,
          });
        }
      }
    }

    const eventItems: TodayScheduleItem[] = ((eventsQuery.data as ClubEventCard[] | undefined) ?? [])
      .filter((event) => isTodayKst(event.startAt, now))
      .map((event) => ({
        kind: 'EVENT',
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        location: event.location,
        eventId: event.id,
      }));

    return sortTodaySchedule([...interviewItems, ...eventItems]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQueries, eventsQuery.data, roundMeta]);

  return {
    items,
    isLoading: recruitments.isLoading || roundsQueries.some((q) => q.isLoading) || detailQueries.some((q) => q.isLoading) || eventsQuery.isLoading,
    isError: recruitments.isError || roundsQueries.some((q) => q.isError) || detailQueries.some((q) => q.isError) || eventsQuery.isError,
  };
}

/** 카드5: 공지·일정 카운트(딥링크 카드용) */
export function useClubFeedCounts(clubId: number | undefined): {
  noticeCount: number;
  eventCount: number;
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const enabled = clubId !== undefined;

  const noticesQuery = useQuery({
    queryKey: enabled ? dashboardQueryKeys.feedCounts(clubId) : ['dashboard', undefined, 'feed-counts'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubNotices.listForClub(clubId, { page: 0, size: 1 });
    },
    enabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const eventsQuery = useQuery({
    queryKey: enabled ? [...dashboardQueryKeys.all, clubId, 'event-count'] : ['dashboard', undefined, 'event-count'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubEvents.list(clubId);
    },
    enabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  return {
    noticeCount: noticesQuery.data?.totalElements ?? 0,
    eventCount: eventsQuery.data?.length ?? 0,
    isLoading: noticesQuery.isLoading || eventsQuery.isLoading,
    isError: noticesQuery.isError || eventsQuery.isError,
  };
}
