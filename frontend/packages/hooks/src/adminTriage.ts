import { useQueries, useQuery, type QueryKey } from '@tanstack/react-query';
import type {
  AdminBookingQueueParams,
  AdminFederationInquirySummary,
  AdminPromotionRequestSearchParams,
  AdminRecruitmentSearchParams,
  AdminReportSearchParams,
  AdminSuccessionSearchParams,
  AdminTriageAreaState,
  AdminTriageItem,
  AdminTriageQueue,
  FederationInquiryStatus,
  PageResponse,
} from '@duing/types';
import { adminQueryKeys } from './adminQueryKeys';
import {
  ADMIN_TRIAGE_PAGE_SIZE,
  ADMIN_TRIAGE_QUEUE_LIMIT,
  facilityTriageItem,
  inquiryTriageItem,
  mergeTriageQueue,
  oldestTailPages,
  oldestWaitingSince,
  promotionTriageItem,
  reportTriageItem,
  staleRecruitmentTriageItems,
  successionTriageItem,
} from './adminTriageSelectors';
import { useApiClient } from './api-context';
import { DASHBOARD_QUERY_OPTIONS } from './dashboard';
import { federationInquiryQueryKeys } from './federationInquiryQueryKeys';

type ListStatus = AdminTriageAreaState['status'];
// tailFailed — 최신순 목록의 끝 페이지가 실패해 이 목록에 최근 100건만 남은 상태. 영역 전체 행을 버리는 근거다(스펙 §5.1 (c)).
type SubList = { status: ListStatus; items: AdminTriageItem[]; totalElements: number | undefined; tailFailed: boolean };
type PageQuery<Row> = { queryKey: QueryKey; queryFn: () => Promise<PageResponse<Row>> };

// 검토 대기는 서버가 오래된 순(createdAt asc)으로 주므로 대기열 상한만큼이면 충분하다.
const PENDING_BOOKING_PARAMS: AdminBookingQueueParams = { status: 'PENDING', page: 0, size: ADMIN_TRIAGE_QUEUE_LIMIT };
// 목록 화면의 "진행 중 · 오래 방치된 순"과 같은 키 — 영역 칸으로 연 목록과 캐시를 공유한다.
const STALE_RECRUITMENT_PARAMS: AdminRecruitmentSearchParams = { status: 'OPEN', sort: 'STALE' };

// data 유무가 기준이다 — 재조회가 실패해도 받은 목록은 그대로 쓴다(사이드바 배지와 같은 기준).
const queryStatus = (query: { data: unknown; isError: boolean }): ListStatus =>
  query.data !== undefined ? 'ready' : query.isError ? 'error' : 'loading';

const combineStatus = (statuses: ListStatus[]): ListStatus =>
  statuses.includes('loading') ? 'loading' : statuses.includes('error') ? 'error' : 'ready';

/**
 * 최신순 목록(서버 정렬 고정) — 첫 페이지로 전체 건수를 보고, 100건이 넘으면 가장 오래된 10건이 든 끝 페이지(들)를 더 받는다.
 * 지금 첫 페이지가 가리키는 끝 페이지만 관찰하므로, 처리로 100건 아래가 되면 예전 끝 페이지 캐시가 결과에 섞이지 않는다.
 */
function useOldestFirstPages<Row>(pageQuery: (page: number) => PageQuery<Row>, toItem: (row: Row) => AdminTriageItem): SubList {
  const firstPageQuery = useQuery({ ...pageQuery(0), ...DASHBOARD_QUERY_OPTIONS });
  const firstPage = firstPageQuery.data;
  const tailPages = firstPage ? oldestTailPages(firstPage.totalElements, firstPage.totalPages, firstPage.size) : [];
  const tailPageQueries = useQueries({
    queries: tailPages.map((page) => ({ ...pageQuery(page), ...DASHBOARD_QUERY_OPTIONS })),
  });
  const status = combineStatus([queryStatus(firstPageQuery), ...tailPageQueries.map(queryStatus)]);
  const totalElements = firstPage?.totalElements;
  const tailFailed = tailPageQueries.some((query) => queryStatus(query) === 'error');
  // 끝 페이지가 하나라도 없으면 최근 100건만 남는다 — 오래된 순인 것처럼 섞이지 않게 이 목록 전체를 버린다.
  if (status !== 'ready' || firstPage === undefined) return { status, items: [], totalElements, tailFailed };
  const rows = [firstPage.content, ...tailPageQueries.map((query) => query.data?.content ?? [])].flat();
  return { status, items: rows.map(toItem), totalElements, tailFailed };
}

const singleSubList = <Data>(
  query: { data: Data | undefined; isError: boolean },
  toItems: (data: Data) => AdminTriageItem[],
): SubList => ({
  status: queryStatus(query),
  items: query.data !== undefined ? toItems(query.data) : [],
  totalElements: undefined,
  tailFailed: false,
});

// 하위 목록 하나가 통째로 실패하면 성공한 쪽 행은 남긴다 — 그 상태 안에서는 정말 오래된 순이다.
// 끝 페이지만 실패한 하위 목록이 있으면 그 영역의 오래된 건을 알 수 없으니 영역 행을 모두 뺀다(스펙 §5.1 (c)).
const areaOf = (subLists: SubList[]): { state: AdminTriageAreaState; items: AdminTriageItem[] } => {
  const items = subLists.some((subList) => subList.tailFailed) ? [] : subLists.flatMap((subList) => subList.items);
  return {
    state: {
      status: combineStatus(subLists.map((subList) => subList.status)),
      rowCount: items.length,
      oldestWaitingSince: oldestWaitingSince(items),
    },
    items,
  };
};

/**
 * 총동연 홈 처리 대기열 — 영역별 대기 목록을 받아 오래 기다린 순 상위 10건으로 합친다.
 * 영역 칸·대기열 카드가 각각 부르지만 쿼리 키가 같아 요청은 한 번이다. 키는 각 도메인 키 팩토리라 처리 뮤테이션의 무효화가 그대로 닿는다.
 */
export function useAdminTriageQueue(): AdminTriageQueue {
  const client = useApiClient();

  const reports = useOldestFirstPages((page) => {
    const params: AdminReportSearchParams = { status: 'PENDING', page, size: ADMIN_TRIAGE_PAGE_SIZE };
    return { queryKey: adminQueryKeys.reportsList(params), queryFn: () => client.admin.reports.list(params) };
  }, reportTriageItem);

  const inquiryPages =
    (status: FederationInquiryStatus) =>
    (page: number): PageQuery<AdminFederationInquirySummary> => {
      const params = { status, page, size: ADMIN_TRIAGE_PAGE_SIZE };
      return {
        queryKey: federationInquiryQueryKeys.adminList(params),
        queryFn: () => client.admin.federationInquiries.list(params),
      };
    };
  const receivedInquiries = useOldestFirstPages(inquiryPages('RECEIVED'), inquiryTriageItem);
  const inProgressInquiries = useOldestFirstPages(inquiryPages('IN_PROGRESS'), inquiryTriageItem);

  const pendingBookingsQuery = useQuery({
    queryKey: adminQueryKeys.facilityBookingQueue(PENDING_BOOKING_PARAMS),
    queryFn: () => client.admin.facilityBookings.queue(PENDING_BOOKING_PARAMS),
    ...DASHBOARD_QUERY_OPTIONS,
  });
  const conflictBookings = useOldestFirstPages((page) => {
    const params: AdminBookingQueueParams = { status: 'CONFLICT', page, size: ADMIN_TRIAGE_PAGE_SIZE };
    return { queryKey: adminQueryKeys.facilityBookingQueue(params), queryFn: () => client.admin.facilityBookings.queue(params) };
  }, facilityTriageItem);

  const recruitmentsQuery = useQuery({
    queryKey: adminQueryKeys.recruitmentsList(STALE_RECRUITMENT_PARAMS),
    queryFn: () => client.admin.recruitments.list(STALE_RECRUITMENT_PARAMS),
    ...DASHBOARD_QUERY_OPTIONS,
  });

  const promotions = useOldestFirstPages((page) => {
    const params: AdminPromotionRequestSearchParams = { status: 'PENDING', page, size: ADMIN_TRIAGE_PAGE_SIZE };
    return { queryKey: adminQueryKeys.promotionRequestsList(params), queryFn: () => client.admin.promotionRequests.list(params) };
  }, promotionTriageItem);

  const successions = useOldestFirstPages((page) => {
    const params: AdminSuccessionSearchParams = { status: 'PENDING', page, size: ADMIN_TRIAGE_PAGE_SIZE };
    return { queryKey: adminQueryKeys.leaderSuccessionList(params), queryFn: () => client.admin.leaderSuccession.list(params) };
  }, successionTriageItem);

  // 렌더 시점의 지금 — 열어 둔 화면에서도 168시간 경계가 흘러간다(고정 memo 금지).
  const now = new Date();
  const report = areaOf([reports]);
  const inquiry = areaOf([receivedInquiries, inProgressInquiries]);
  const facility = areaOf([
    singleSubList(pendingBookingsQuery, (bookingPage) => bookingPage.content.map(facilityTriageItem)),
    conflictBookings,
  ]);
  const recruitment = areaOf([
    singleSubList(recruitmentsQuery, (recruitments) => staleRecruitmentTriageItems(recruitments, now)),
  ]);
  const promotion = areaOf([promotions]);
  const succession = areaOf([successions]);
  const areaList = [report, inquiry, facility, recruitment, promotion, succession];

  return {
    items: mergeTriageQueue(areaList.flatMap((area) => area.items)),
    areas: {
      REPORT: report.state,
      INQUIRY: inquiry.state,
      FACILITY: facility.state,
      RECRUITMENT: recruitment.state,
      PROMOTION: promotion.state,
      SUCCESSION: succession.state,
    },
    inquiryTotals: { received: receivedInquiries.totalElements, inProgress: inProgressInquiries.totalElements },
    isLoading: areaList.some((area) => area.state.status === 'loading'),
    isError: areaList.some((area) => area.state.status === 'error'),
  };
}
