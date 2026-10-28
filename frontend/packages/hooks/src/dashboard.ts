import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import type {
  ActionItem,
  ApplicantStatusTotals,
  DashboardTaskGroup,
  InterviewRoundSummary,
  OperationItem,
  RecruitmentSummary,
  TodayScheduleItem,
} from '@duing/types';
import { useApiClient } from './api-context';
import { bankQueryKeys } from './bankQueryKeys';
import { clubQueryKeys } from './clubQueryKeys';
import { facilityQueryKeys } from './facilityQueryKeys';
import { feeQueryKeys } from './feeQueryKeys';
import { statsQueryKeys } from './statsQueryKeys';
import { interviewRoundKeys } from './interviewRoundQueryKeys';
import { clubNoticeKeys } from './clubMembershipQueryKeys';
import { clubEventKeys } from './clubEventQueryKeys';
import { isTodayKst, todayKstDateString } from './dashboardDate';
import { retryUnlessStatuses } from './retry';
import {
  ACTION_ITEM_PREVIEW_COUNT,
  aggregateApplicantTotals,
  buildActionItems,
  buildClosedRecruitmentItems,
  buildOperationItems,
  groupDashboardTasks,
  sortActionItems,
  sortTodaySchedule,
  type ClosedRecruitmentDashboardInput,
  type RecruitmentDashboardInput,
} from './dashboardSelectors';

export const DASHBOARD_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 300_000 } as const;

// 판정은 raw status — 마감일이 지났어도 수동 마감 전이면 백엔드는 모집을 OPEN(심사 진행 중)으로 다루고,
// 그 구간에 미결 지원자가 남아 있다. displayStatus 로 판정하면 이 필터를 공유하는 진행 중 모집 카드·
// 지원자 요약·처리 필요 업무가 모두 그 모집을 통째로 빼버려 "처리 필요 0건"이 표시된다.
function isActive(recruitment: RecruitmentSummary): boolean {
  return recruitment.status !== 'CLOSED';
}

/** 대시보드 카드들이 공유하는 동아리 모집 목록(마감 포함) — 카드별 필터는 호출부가 건다. */
function useDashboardRecruitments(clubId: number | undefined) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubId !== undefined ? clubQueryKeys.recruitments(clubId) : ['clubs', undefined, 'recruitments'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.clubs.recruitmentsByClub(clubId);
    },
    enabled: clubId !== undefined,
    ...DASHBOARD_QUERY_OPTIONS,
  });
}

/** 카드2: 마감(raw CLOSED) 제외 진행 중 모집 */
export function useActiveRecruitments(clubId: number | undefined) {
  const query = useDashboardRecruitments(clubId);
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
  const recruitments = useDashboardRecruitments(clubId);
  const list = useMemo(() => recruitments.data?.filter(isActive) ?? [], [recruitments.data]);
  // 마감 모집도 남은 지원의 결과 확정은 열려 있어(#892) 미결만 따로 센다. 외부 폼은 지원서가 없어 뺀다.
  const closedSelfList = useMemo(
    () => recruitments.data?.filter((recruitment) => !isActive(recruitment) && recruitment.applicationMode === 'SELF') ?? [],
    [recruitments.data],
  );
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

  // 쿼리키를 지난 모집 표·모집 상세·통계 화면과 공유해 캐시가 일치한다. 마감 모집은 라운드·대기열을 부르지 않는다.
  // shortcut: 마감 모집 수만큼 요청이 는다(2026-10 운영 기준 동아리당 최대 5개), 수십 개로 쌓이면 백엔드 집계로 바꾼다.
  const closedStatsQueries = useQueries({
    queries: closedSelfList.map((recruitment) => ({
      queryKey: statsQueryKeys.summary(recruitment.id),
      queryFn: () => client.stats.summary(recruitment.id),
      ...DASHBOARD_QUERY_OPTIONS,
    })),
    combine: (results) => ({
      data: results.map((result) => result.data),
      someLoading: results.some((result) => result.isLoading),
      someError: results.some((result) => result.isError),
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
    const closedInputs: ClosedRecruitmentDashboardInput[] = closedSelfList.map((recruitment, index) => ({
      recruitment,
      stats: closedStatsQueries.data[index],
    }));
    return sortActionItems([...buildActionItems(inputs, new Date()), ...buildClosedRecruitmentItems(closedInputs)]);
  }, [list, statsQueries.data, roundsByRecruitmentId, candidateCountByRecruitmentId, closedSelfList, closedStatsQueries.data]);

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
      candidatesQueries.someLoading ||
      (closedSelfList.length > 0 && closedStatsQueries.length === 0) ||
      closedStatsQueries.someLoading,
    isError:
      recruitments.isError ||
      statsQueries.someError ||
      roundsQueries.someError ||
      candidatesQueries.someError ||
      closedStatsQueries.someError,
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

// 은행 훅(bank.ts)과 같은 정책 — 자동매칭 미사용 403 은 정상 상태라 재시도하지 않는다.
const retryUnlessBankForbidden = retryUnlessStatuses(403);
const BANK_PENDING_PARAMS = { status: 'PENDING' } as const;

/**
 * 운영 업무(가입 요청·회비 연체·은행 입금 검토·시설 예약 결과) — 홈 업무 큐의 모집 외 출처.
 * 기존 훅은 enabled·staleTime 을 받지 않아 여기서 useQuery 를 직접 쓴다. 키·client 메서드는 각 화면과 같아
 * 캐시를 공유하고, 그 화면들의 mutation 무효화가 홈에도 닿는다.
 */
export function useClubOperationItems(clubId: number | undefined): {
  items: OperationItem[];
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const enabled = clubId !== undefined;

  const joinRequestsQuery = useQuery({
    queryKey: enabled ? clubQueryKeys.joinRequests(clubId, 'PENDING') : ['clubs', undefined, 'join-requests', 'PENDING'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.joinCodes.listRequests(clubId, 'PENDING');
    },
    enabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const feeSummaryQuery = useQuery({
    queryKey: enabled ? feeQueryKeys.summary(clubId, {}) : ['fee', 'summary', undefined, {}],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.leader.fees.summary(clubId, {});
    },
    enabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const bankStatusQuery = useQuery({
    queryKey: enabled ? bankQueryKeys.matchingStatus(clubId) : ['bank', 'matching-status', undefined],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.leader.fees.bank.status(clubId);
    },
    enabled,
    retry: retryUnlessBankForbidden,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  // 미사용 동아리는 목록을 부르지 않는다. 비활성 쿼리의 isLoading 은 false 라 큐가 로딩에 갇히지 않는다(isPending 금지).
  const bankPendingEnabled = enabled && bankStatusQuery.data?.enabled === true;
  const bankPendingQuery = useQuery({
    queryKey: enabled ? bankQueryKeys.transactions(clubId, BANK_PENDING_PARAMS) : ['bank', 'transactions', undefined, BANK_PENDING_PARAMS],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.leader.fees.bank.list(clubId, BANK_PENDING_PARAMS);
    },
    enabled: bankPendingEnabled,
    retry: retryUnlessBankForbidden,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const bookingsQuery = useQuery({
    queryKey: enabled ? facilityQueryKeys.clubBookings(clubId) : ['facilities', 'club-bookings', 'none'],
    queryFn: () => {
      if (clubId === undefined) throw new Error('clubId is required');
      return client.facilityBookings.list(clubId);
    },
    enabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const joinRequests = joinRequestsQuery.data;
  const feeSummary = feeSummaryQuery.data;
  // 게이트와 묶는다 — 상태가 미사용으로 바뀌거나 조회에 실패하면 비활성 쿼리에 남은 옛 캐시를 쓰지 않는다.
  const bankPendingCount = bankPendingEnabled ? bankPendingQuery.data?.totalElements : undefined;
  const bookings = bookingsQuery.data;
  // 자정을 넘기면 다시 계산한다 — 데이터가 그대로여도 지난 거절 예약이 어제 기준으로 남지 않게.
  const todayKst = todayKstDateString(new Date());
  const items = useMemo(
    () => buildOperationItems({ pendingJoinRequests: joinRequests, feeSummary, bankPendingCount, bookings }, new Date()),
    [joinRequests, feeSummary, bankPendingCount, bookings, todayKst],
  );

  return {
    items,
    isLoading:
      joinRequestsQuery.isLoading ||
      feeSummaryQuery.isLoading ||
      bankStatusQuery.isLoading ||
      bankPendingQuery.isLoading ||
      bookingsQuery.isLoading,
    isError:
      joinRequestsQuery.isError ||
      feeSummaryQuery.isError ||
      bankStatusQuery.isError ||
      // 게이트가 닫힌 뒤(관리자가 자동매칭을 끔) 비활성 쿼리에 남은 옛 오류로 "일부 실패"가 머물지 않게.
      (bankPendingEnabled && bankPendingQuery.isError) ||
      bookingsQuery.isError,
  };
}

/** 홈 업무 큐 — 모집 업무 + 운영 업무를 묶음으로. 큐 카드와 머리말이 각각 부르지만 쿼리 키가 같아 요청은 한 번이다. */
export function useDashboardTaskQueue(clubId: number | undefined): {
  groups: DashboardTaskGroup[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
} {
  const actionItems = useClubActionItems(clubId);
  const operationItems = useClubOperationItems(clubId);
  const groups = useMemo(
    () => groupDashboardTasks(actionItems.items, operationItems.items),
    [actionItems.items, operationItems.items],
  );
  return {
    groups,
    totalCount: actionItems.items.length + operationItems.items.length,
    isLoading: actionItems.isLoading || operationItems.isLoading,
    isError: actionItems.isError || operationItems.isError,
  };
}
