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
  aggregateApplicantTotals,
  buildOperationItems,
  buildRecruitmentActionItems,
  groupDashboardTasks,
  isActiveRecruitment,
  sortActionItems,
  sortTodaySchedule,
} from './dashboardSelectors';

export const DASHBOARD_QUERY_OPTIONS = { staleTime: 60_000, gcTime: 300_000 } as const;

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
  const data = useMemo(() => query.data?.filter(isActiveRecruitment), [query.data]);
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

/** 카드1: 처리 필요 업무 — 정렬된 모집 업무 목록과 총 건수 */
export function useClubActionItems(clubId: number | undefined): {
  items: ActionItem[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const recruitments = useDashboardRecruitments(clubId);
  const list = useMemo(() => recruitments.data?.filter(isActiveRecruitment) ?? [], [recruitments.data]);
  // 마감 모집도 남은 지원의 결과 확정은 열려 있어(#892) 미결만 따로 센다. 외부 폼은 지원서가 없어 뺀다.
  const closedSelfList = useMemo(
    () => recruitments.data?.filter((recruitment) => !isActiveRecruitment(recruitment) && recruitment.applicationMode === 'SELF') ?? [],
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
  // 쿼리키 모양을 동일하게 맞춰 캐시를 공유하고, 라운드 생성/취소/제외/확정·지원 상태 변경(단건·일괄)
  // mutation의 candidates(recruitmentId) prefix invalidation이 여기에도 닿게 한다.
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
  // 자정 뒤 첫 렌더에서 다시 계산한다(타이머 없음) — 데이터가 그대로여도 미처리 일수·면접 응답 기한이 어제 기준으로 남지 않게.
  // shortcut: 열어 둔 채 리렌더가 없으면 어제 기준으로 남는다(미처리 7일 올림·면접 응답 기한), 불만이 나오면 자정 타이머를 단다.
  const todayKst = todayKstDateString(new Date());
  const items = useMemo(() => {
    const now = new Date();
    // 모집마다 단일 입구(buildRecruitmentActionItems)로 만든다 — 모집 상세 카드와 규칙이 갈리지 않게. 진행 중 목록 순서 → 마감 목록 순서.
    const activeItems = list.flatMap((recruitment, index) =>
      buildRecruitmentActionItems(
        {
          recruitment,
          stats: statsQueries.data[index],
          rounds: roundsByRecruitmentId.get(recruitment.id),
          candidateCount: candidateCountByRecruitmentId.get(recruitment.id),
        },
        now,
      ),
    );
    const closedItems = closedSelfList.flatMap((recruitment, index) =>
      buildRecruitmentActionItems(
        { recruitment, stats: closedStatsQueries.data[index], rounds: undefined, candidateCount: undefined },
        now,
      ),
    );
    return sortActionItems([...activeItems, ...closedItems]);
  }, [list, statsQueries.data, roundsByRecruitmentId, candidateCountByRecruitmentId, closedSelfList, closedStatsQueries.data, todayKst]);

  return {
    items,
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

/**
 * 모집 상세 "이 모집에서 할 일" — 이 모집 하나의 통계·라운드·면접 대기열만 받아 홈과 같은 규칙(buildRecruitmentActionItems)으로 묶는다.
 * 쿼리 키·옵션은 홈 fan-out 과 같아 캐시·무효화를 공유한다. 다른 모집의 조회 실패는 이 결과에 닿지 않는다.
 * 자체 폼(SELF) 모집에서만 부른다 — 외부 폼은 호출부(모집 상세)가 카드를 그리지 않는다.
 */
export function useRecruitmentActionItems(recruitment: RecruitmentSummary): {
  groups: DashboardTaskGroup[];
  submittedCount: number | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const client = useApiClient();
  const recruitmentId = recruitment.id;
  // 홈처럼 진행 중 ∧ 면접 사용 모집만 라운드·대기열을 받는다 — 면접 안 쓰는 모집은 라운드 API 가 InterviewNotUsed 를 던진다.
  const interviewEnabled = isActiveRecruitment(recruitment) && recruitment.useInterview;

  const statsQuery = useQuery({
    queryKey: statsQueryKeys.summary(recruitmentId),
    queryFn: () => client.stats.summary(recruitmentId),
    ...DASHBOARD_QUERY_OPTIONS,
  });
  const roundsQuery = useQuery({
    queryKey: interviewRoundKeys.list(recruitmentId),
    queryFn: () => client.interviewRounds.list(recruitmentId),
    enabled: interviewEnabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });
  const candidatesQuery = useQuery({
    queryKey: interviewRoundKeys.candidates(recruitmentId, false),
    queryFn: () => client.interviewRounds.candidates(recruitmentId, false),
    enabled: interviewEnabled,
    ...DASHBOARD_QUERY_OPTIONS,
  });

  // 판정·입력은 켠 쿼리만 본다 — 꺼 둔 쿼리라도 같은 키를 다른 관찰자(이 화면의 면접 단계 칩)가 받으면 그 로딩·오류가 그대로 보인다.
  const stats = statsQuery.data;
  const rounds = interviewEnabled ? roundsQuery.data : undefined;
  const candidateCount = interviewEnabled ? candidatesQuery.data?.length : undefined;
  // 자정 뒤 첫 렌더에서 다시 계산한다 — 홈 useClubActionItems 와 같은 shortcut(자정 타이머 없음).
  const todayKst = todayKstDateString(new Date());
  const groups = useMemo(
    () => groupDashboardTasks(sortActionItems(buildRecruitmentActionItems({ recruitment, stats, rounds, candidateCount }, new Date())), []),
    [recruitment, stats, rounds, candidateCount, todayKst],
  );

  return {
    groups,
    // 다시 받기가 실패해도 옛 값을 쓴다 — 할 일 줄 둘째 줄(같은 통계)과 미리보기 숫자가 맞게.
    submittedCount: stats?.submitted,
    isLoading: statsQuery.isLoading || (interviewEnabled && (roundsQuery.isLoading || candidatesQuery.isLoading)),
    isError: statsQuery.isError || (interviewEnabled && (roundsQuery.isError || candidatesQuery.isError)),
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

// 은행 훅(bank.ts)과 같은 정책 — 비운영진 403 은 재시도해도 결과가 같아 다시 묻지 않는다.
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
  // 게이트와 묶는다 — 자동매칭이 꺼졌거나 상태를 아직 못 받았으면 비활성 쿼리에 남은 옛 캐시를 쓰지 않는다.
  const bankPendingCount = bankPendingEnabled ? bankPendingQuery.data?.totalElements : undefined;
  const bookings = bookingsQuery.data;
  // 자정 뒤 첫 렌더에서 다시 계산한다(타이머 없음) — 데이터가 그대로여도 지난 거절 예약이 어제 기준으로 남지 않게.
  // shortcut: 열어 둔 채 리렌더가 없으면 어제 기준으로 남는다(지난 거절·충돌 예약), 불만이 나오면 자정 타이머를 단다.
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
