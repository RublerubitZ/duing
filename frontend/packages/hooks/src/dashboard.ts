import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import type {
  ActionItem,
  ApplicantStatusTotals,
  InterviewRoundSummary,
  RecruitmentSummary,
  TodayScheduleItem,
} from '@duing/types';
import { useApiClient } from './api-context';
import { clubQueryKeys } from './clubQueryKeys';
import { statsQueryKeys } from './statsQueryKeys';
import { interviewRoundKeys } from './interviewRoundQueryKeys';
import { clubNoticeKeys } from './clubMembershipQueryKeys';
import { clubEventKeys } from './clubEventQueryKeys';
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

// 판정은 raw status — 마감일이 지났어도 수동 마감 전이면 백엔드는 모집을 OPEN(심사 진행 중)으로 다루고,
// 그 구간에 미결 지원자가 남아 있다. displayStatus 로 판정하면 이 필터를 공유하는 진행 중 모집 카드·
// 지원자 요약·처리 필요 업무가 모두 그 모집을 통째로 빼버려 "처리 필요 0건"이 표시된다.
function isActive(recruitment: RecruitmentSummary): boolean {
  return recruitment.status !== 'CLOSED';
}

/** 카드2: 마감(raw CLOSED) 제외 진행 중 모집 */
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
      queryKey: statsQueryKeys.summary(recruitmentId),
      queryFn: () => client.stats.summary(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
    combine: (results) => ({
      totals: aggregateApplicantTotals(results.map((q) => q.data)),
      someLoading: results.some((q) => q.isLoading),
      someError: results.some((q) => q.isError),
      length: results.length,
    }),
  });

  return {
    totals: statsQueries.totals,
    isLoading: recruitments.isLoading || (ids.length > 0 && statsQueries.length === 0) || statsQueries.someLoading,
    isError: recruitments.isError || statsQueries.someError,
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
  // 면접 라운드 API는 useInterview=false 모집에서 InterviewNotUsed를 던지므로,
  // 라운드 fan-out은 면접 사용 모집으로만 제한한다.
  const interviewRecruitmentIds = list.filter((r) => r.useInterview).map((r) => r.id);

  const statsQueries = useQueries({
    queries: ids.map((recruitmentId) => ({
      queryKey: statsQueryKeys.summary(recruitmentId),
      queryFn: () => client.stats.summary(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
    combine: (results) => ({
      data: results.map((q) => q.data),
      someLoading: results.some((q) => q.isLoading),
      someError: results.some((q) => q.isError),
      length: results.length,
    }),
  });

  // 필터된 부분집합이므로 positional index가 아니라 recruitmentId로 키잉한다.
  const roundsQueries = useQueries({
    queries: interviewRecruitmentIds.map((recruitmentId) => ({
      queryKey: interviewRoundKeys.list(recruitmentId),
      queryFn: () => client.interviewRounds.list(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
    combine: (results) => {
      const roundsByRecruitmentId = new Map<number, InterviewRoundSummary[]>();
      results.forEach((result, index) => {
        const recruitmentId = interviewRecruitmentIds[index];
        if (recruitmentId === undefined) return;
        if (result.data) roundsByRecruitmentId.set(recruitmentId, result.data);
      });
      return {
        roundsByRecruitmentId,
        someLoading: results.some((q) => q.isLoading),
        someError: results.some((q) => q.isError),
        length: results.length,
      };
    },
  });

  // 면접 대기열 fan-out — 라운드 화면의 useInterviewRoundCandidatesQuery(includeUndecided=false)와
  // 쿼리키 모양을 동일하게 맞춰 캐시를 공유하고, 라운드 생성/취소/제외/확정 mutation의
  // candidates(recruitmentId) prefix invalidation이 여기에도 닿게 한다.
  const candidatesQueries = useQueries({
    queries: interviewRecruitmentIds.map((recruitmentId) => ({
      queryKey: interviewRoundKeys.candidates(recruitmentId, false),
      queryFn: () => client.interviewRounds.candidates(recruitmentId, false),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
    combine: (results) => {
      const candidateCountByRecruitmentId = new Map<number, number>();
      results.forEach((result, index) => {
        const recruitmentId = interviewRecruitmentIds[index];
        if (recruitmentId === undefined) return;
        if (result.data) candidateCountByRecruitmentId.set(recruitmentId, result.data.length);
      });
      return {
        candidateCountByRecruitmentId,
        someLoading: results.some((q) => q.isLoading),
        someError: results.some((q) => q.isError),
        length: results.length,
      };
    },
  });

  const roundsByRecruitmentId = roundsQueries.roundsByRecruitmentId;
  const candidateCountByRecruitmentId = candidatesQueries.candidateCountByRecruitmentId;
  const items = useMemo(() => {
    const inputs: RecruitmentDashboardInput[] = list.map((recruitment, index) => ({
      recruitment,
      stats: statsQueries.data[index],
      rounds: roundsByRecruitmentId.get(recruitment.id),
      candidateCount: candidateCountByRecruitmentId.get(recruitment.id),
    }));
    return sortActionItems(buildActionItems(inputs, new Date()));
  }, [list, statsQueries.data, roundsByRecruitmentId, candidateCountByRecruitmentId]);

  return {
    items,
    preview: items.slice(0, ACTION_ITEM_PREVIEW_COUNT),
    totalCount: items.length,
    isLoading:
      recruitments.isLoading ||
      (ids.length > 0 && statsQueries.length === 0) ||
      statsQueries.someLoading ||
      (interviewRecruitmentIds.length > 0 && roundsQueries.length === 0) ||
      roundsQueries.someLoading ||
      (interviewRecruitmentIds.length > 0 && candidatesQueries.length === 0) ||
      candidatesQueries.someLoading,
    isError:
      recruitments.isError ||
      statsQueries.someError ||
      roundsQueries.someError ||
      candidatesQueries.someError,
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
  // 면접 라운드 API는 useInterview=false 모집에서 InterviewNotUsed를 던지므로,
  // 라운드 fan-out은 면접 사용 모집으로만 제한한다. (SCHEDULED 라운드도 면접 모집에만 존재)
  const interviewRecruitmentIds = (recruitments.data ?? []).filter((r) => r.useInterview).map((r) => r.id);

  // combine으로 SCHEDULED 라운드 ID와 round→recruitment 메타를 직접 추출한다.
  const roundsResult = useQueries({
    queries: interviewRecruitmentIds.map((recruitmentId) => ({
      queryKey: interviewRoundKeys.list(recruitmentId),
      queryFn: () => client.interviewRounds.list(recruitmentId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
    combine: (results) => {
      const scheduledRoundIds: number[] = [];
      const roundMeta = new Map<number, { recruitmentId: number; title: string }>();
      results.forEach((result, index) => {
        const rounds: InterviewRoundSummary[] = result.data ?? [];
        const recruitmentId = interviewRecruitmentIds[index];
        if (recruitmentId === undefined) return;
        for (const round of rounds) {
          roundMeta.set(round.roundId, { recruitmentId, title: round.title });
          if (round.status === 'SCHEDULED') scheduledRoundIds.push(round.roundId);
        }
      });
      return {
        scheduledRoundIds,
        roundMeta,
        someLoading: results.some((q) => q.isLoading),
        someError: results.some((q) => q.isError),
        length: results.length,
      };
    },
  });

  const detailQueries = useQueries({
    queries: roundsResult.scheduledRoundIds.map((roundId) => ({
      queryKey: interviewRoundKeys.detail(roundId),
      queryFn: () => client.interviewRounds.detail(roundId),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
    combine: (results) => ({
      details: results.map((q) => q.data),
      someLoading: results.some((q) => q.isLoading),
      someError: results.some((q) => q.isError),
      length: results.length,
    }),
  });

  const eventsQuery = useQuery({
    queryKey: clubId !== undefined ? clubEventKeys.list(clubId, { from: today, to: today }) : ['club', 'events', undefined, 'list', { from: today, to: today }],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubEvents.list(clubId, { from: today, to: today });
    },
    enabled: clubId !== undefined,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const roundMeta = roundsResult.roundMeta;
  const details = detailQueries.details;
  const eventsData = eventsQuery.data;

  const items = useMemo(() => {
    const interviewItems: TodayScheduleItem[] = [];
    for (const detail of details) {
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
            slotId: slot.slotId,
          });
        }
      }
    }

    const eventItems: TodayScheduleItem[] = (eventsData ?? [])
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
  }, [details, eventsData, roundMeta, now]);

  return {
    items,
    isLoading:
      recruitments.isLoading ||
      (interviewRecruitmentIds.length > 0 && roundsResult.length === 0) ||
      roundsResult.someLoading ||
      (roundsResult.scheduledRoundIds.length > 0 && detailQueries.length === 0) ||
      detailQueries.someLoading ||
      eventsQuery.isLoading,
    isError: recruitments.isError || roundsResult.someError || detailQueries.someError || eventsQuery.isError,
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
    queryKey: enabled ? clubNoticeKeys.list(clubId, 0, 1) : ['club', 'notices', undefined, 'list', { page: 0, size: 1 }],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubNotices.listForClub(clubId, { page: 0, size: 1 });
    },
    enabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const eventsQuery = useQuery({
    queryKey: enabled ? clubEventKeys.list(clubId, {}) : ['club', 'events', undefined, 'list', {}],
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
