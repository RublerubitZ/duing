import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApiClient } from '@duing/api';
import type {
  AdminClubSummary,
  AdminFacilityBookingSummary,
  AdminFederationInquirySummary,
  AdminPromotionRequestSummary,
  AdminRecruitmentListItem,
  AdminReportSummary,
  AdminSuccessionSummary,
  BookingStatus,
  FederationInquiryStatus,
  RecruitmentStatus,
} from '@duing/types';
import { adminQueryKeys } from '../src/adminQueryKeys';
import { useAdminTriageQueue } from '../src/adminTriage';
import { ApiClientProvider } from '../src/api-context';
import { federationInquiryQueryKeys } from '../src/federationInquiryQueryKeys';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const newQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

const ok = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });
const fail = () => HttpResponse.json({ ok: false, message: '서버 오류', data: null }, { status: 500 });
const pageOf = <Row,>(content: Row[], totalElements = content.length, page = 0) => ({
  content,
  page,
  size: 100,
  totalElements,
  totalPages: Math.max(1, Math.ceil(totalElements / 100)),
  hasNext: false,
});
// 실행 시각 기준 n시간 전 — 168시간 경계에서 먼 값만 쓴다(경계는 순수 함수 테스트가 고정 시각으로 본다).
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const statusParam = (request: Request) => new URL(request.url).searchParams.get('status');
const pageParam = (request: Request) => Number(new URL(request.url).searchParams.get('page'));

const report = (id: number, createdAt: string): AdminReportSummary => ({
  id, targetType: 'CLUB', targetId: 7, targetLabel: '코드브루', reasonCode: 'SPAM', status: 'PENDING', createdAt,
});
const inquiry = (id: number, status: FederationInquiryStatus, createdAt: string): AdminFederationInquirySummary => ({
  id, title: '동아리방 사용 문의', status, authorName: '김두잉', authorStudentId: '20260001', createdAt, answeredAt: null,
});
const booking = (bookingId: number, status: BookingStatus, createdAt: string): AdminFacilityBookingSummary => ({
  bookingId, clubId: 7, clubName: '코드브루', facilityId: 1, roomName: '학생회관 B103', date: '2026-11-04',
  startTime: '18:00:00', endTime: '20:00:00', status, purpose: '정기 모임', createdAt, conflictSuspected: false,
  partiallyMatched: false,
});
const recruitment = (recruitmentId: number, status: RecruitmentStatus, oldestPendingSubmittedAt: string): AdminRecruitmentListItem => ({
  recruitmentId, clubId: 7, clubName: '코드브루', title: '2026 2학기 신입 모집', applicationMode: 'SELF', status,
  displayStatus: status, applicantCount: 4, startDate: '2026-10-01', endDate: '2026-11-30', closedAt: null,
  updatedAt: '2026-10-20T00:00:00Z', pendingApplicationCount: 2, oldestPendingSubmittedAt, operatorsLastActiveAt: null,
});
const promotion = (id: number, createdAt: string): AdminPromotionRequestSummary => ({
  id, club: { id: 7, name: '코드브루' }, requester: { id: 3, name: '이회장' }, title: '정기 공연 홍보', status: 'PENDING', createdAt,
});
const succession = (id: number, createdAt: string): AdminSuccessionSummary => ({
  id, clubId: 7, clubName: '코드브루', requester: { id: 3, name: '이회장' }, status: 'PENDING', createdAt,
});

let requestUrls: URL[] = [];
const requestsTo = (pathSuffix: string) =>
  requestUrls
    .filter((url) => url.pathname.endsWith(pathSuffix))
    .map((url) => {
      // hooks tsconfig 에 DOM.Iterable 이 없어 URLSearchParams 를 펼칠 수 없다 — forEach 로 모은다.
      const params: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      return params;
    });
const itemKeys = (items: { area: string; id: number }[]) => items.map((item) => `${item.area}:${item.id}`);

const server = setupServer();
server.events.on('request:start', ({ request }) => {
  requestUrls.push(new URL(request.url));
});
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  requestUrls = [];
  // 영역마다 빈 목록이 기본 — 각 테스트가 필요한 영역만 server.use 로 덮는다.
  server.use(
    http.get('*/admin/reports', () => ok(pageOf([]))),
    http.get('*/admin/federation/inquiries', () => ok(pageOf([]))),
    http.get('*/admin/facility-bookings', () => ok(pageOf([]))),
    http.get('*/admin/recruitments', () => ok([])),
    http.get('*/admin/promotion-requests', () => ok(pageOf([]))),
    http.get('*/admin/leader-succession-requests', () => ok(pageOf([]))),
    http.get('*/admin/clubs', () => ok(pageOf([]))),
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useAdminTriageQueue', () => {
  it('영역별 대기 목록을 받아 오래 기다린 순으로 합치고, 각 도메인 키에 캐시를 채운다', async () => {
    const pendingBookingAt = hoursAgo(80);
    server.use(
      http.get('*/admin/reports', () => ok(pageOf([report(1, hoursAgo(50)), report(2, hoursAgo(2))]))),
      http.get('*/admin/federation/inquiries', ({ request }) =>
        ok(pageOf(statusParam(request) === 'RECEIVED' ? [inquiry(11, 'RECEIVED', hoursAgo(30))] : [inquiry(12, 'IN_PROGRESS', hoursAgo(100))])),
      ),
      http.get('*/admin/facility-bookings', ({ request }) =>
        ok(pageOf(statusParam(request) === 'PENDING' ? [booking(21, 'PENDING', pendingBookingAt)] : [booking(22, 'CONFLICT', hoursAgo(10))])),
      ),
      http.get('*/admin/recruitments', () =>
        ok([recruitment(31, 'OPEN', hoursAgo(200)), recruitment(32, 'OPEN', hoursAgo(24)), recruitment(33, 'CLOSED', hoursAgo(300))]),
      ),
      http.get('*/admin/promotion-requests', () => ok(pageOf([promotion(41, hoursAgo(5))]))),
      http.get('*/admin/leader-succession-requests', () => ok(pageOf([succession(51, hoursAgo(60))]))),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(itemKeys(result.current.items)).toEqual([
      'RECRUITMENT:31', 'INQUIRY:12', 'FACILITY:21', 'SUCCESSION:51', 'REPORT:1', 'INQUIRY:11', 'FACILITY:22', 'PROMOTION:41', 'REPORT:2',
    ]);
    expect(result.current.areas.REPORT).toMatchObject({ status: 'ready', rowCount: 2 });
    expect(result.current.areas.RECRUITMENT).toMatchObject({ status: 'ready', rowCount: 1 });
    // 칸 보조 줄의 출처 — 시설은 검토 대기·충돌 두 목록 중 더 이른 쪽
    expect(result.current.areas.FACILITY).toEqual({ status: 'ready', rowCount: 2, oldestWaitingSince: pendingBookingAt });
    expect(result.current.inquiryTotals).toEqual({ received: 1, inProgress: 1 });

    expect(requestsTo('/admin/reports')).toEqual([{ status: 'PENDING', page: '0', size: '100' }]);
    expect(requestsTo('/admin/federation/inquiries')).toEqual(
      expect.arrayContaining([{ status: 'RECEIVED', page: '0', size: '100' }, { status: 'IN_PROGRESS', page: '0', size: '100' }]),
    );
    // 검토 대기는 서버가 오래된 순으로 주므로 대기열 상한(10)만 받는다.
    expect(requestsTo('/admin/facility-bookings')).toEqual(
      expect.arrayContaining([{ status: 'PENDING', page: '0', size: '10' }, { status: 'CONFLICT', page: '0', size: '100' }]),
    );
    expect(requestsTo('/admin/recruitments')).toEqual([{ status: 'OPEN', sort: 'STALE' }]);
    expect(requestsTo('/admin/promotion-requests')).toEqual([{ status: 'PENDING', page: '0', size: '100' }]);
    expect(requestsTo('/admin/leader-succession-requests')).toEqual([{ status: 'PENDING', page: '0', size: '100' }]);

    expect(queryClient.getQueryData(adminQueryKeys.reportsList({ status: 'PENDING', page: 0, size: 100 }))).toBeDefined();
    expect(queryClient.getQueryData(federationInquiryQueryKeys.adminList({ status: 'RECEIVED', page: 0, size: 100 }))).toBeDefined();
    expect(queryClient.getQueryData(adminQueryKeys.facilityBookingQueue({ status: 'PENDING', page: 0, size: 10 }))).toBeDefined();
    expect(queryClient.getQueryData(adminQueryKeys.recruitmentsList({ status: 'OPEN', sort: 'STALE' }))).toBeDefined();
  });

  it('받는 동안에는 로딩이고 영역 상태도 로딩이다', async () => {
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(newQueryClient()) });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.areas.REPORT.status).toBe('loading');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it('100건이 넘는 최신순 목록은 가장 오래된 건이 든 끝 페이지까지 받는다', async () => {
    const reportsByPage: Record<number, AdminReportSummary[]> = {
      0: [report(1, hoursAgo(1))],
      1: [report(2, hoursAgo(300))],
      2: [report(3, hoursAgo(400))],
    };
    server.use(http.get('*/admin/reports', ({ request }) => ok(pageOf(reportsByPage[pageParam(request)] ?? [], 205, pageParam(request)))));
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 205건 → 끝 페이지(2)에 5건뿐이라 바로 앞 페이지(1)도 받는다.
    expect(requestsTo('/admin/reports').map((params) => params.page).sort()).toEqual(['0', '1', '2']);
    expect(itemKeys(result.current.items)).toEqual(['REPORT:3', 'REPORT:2', 'REPORT:1']);
    expect(result.current.areas.REPORT.oldestWaitingSince).toBe(reportsByPage[2]?.[0]?.createdAt);
  });

  it('끝 페이지가 실패하면 그 영역 행을 모두 빼고 영역을 실패로 둔다', async () => {
    server.use(
      http.get('*/admin/reports', ({ request }) => (pageParam(request) === 0 ? ok(pageOf([report(1, hoursAgo(1))], 150)) : fail())),
      http.get('*/admin/promotion-requests', () => ok(pageOf([promotion(41, hoursAgo(5))]))),
    );
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.areas.REPORT.status).toBe('error');
    expect(itemKeys(result.current.items)).toEqual(['PROMOTION:41']);
    expect(result.current.isError).toBe(true);
  });

  it('상태별 하위 목록 중 하나만 실패하면 성공한 쪽 행은 남긴다', async () => {
    server.use(
      http.get('*/admin/federation/inquiries', ({ request }) =>
        statusParam(request) === 'RECEIVED' ? ok(pageOf([inquiry(11, 'RECEIVED', hoursAgo(30))])) : fail(),
      ),
    );
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(itemKeys(result.current.items)).toEqual(['INQUIRY:11']);
    expect(result.current.areas.INQUIRY).toMatchObject({ status: 'error', rowCount: 1 });
    expect(result.current.inquiryTotals).toEqual({ received: 1, inProgress: undefined });
  });

  it('하위 목록 하나의 끝 페이지가 실패하면 같은 영역의 다른 하위 목록 행도 뺀다(스펙 §5.1 (c))', async () => {
    server.use(
      http.get('*/admin/federation/inquiries', ({ request }) => {
        if (statusParam(request) === 'IN_PROGRESS') return ok(pageOf([inquiry(12, 'IN_PROGRESS', hoursAgo(100))]));
        return pageParam(request) === 0 ? ok(pageOf([inquiry(11, 'RECEIVED', hoursAgo(1))], 150)) : fail();
      }),
      http.get('*/admin/promotion-requests', () => ok(pageOf([promotion(41, hoursAgo(5))]))),
    );
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(itemKeys(result.current.items)).toEqual(['PROMOTION:41']);
    expect(result.current.areas.INQUIRY).toMatchObject({ status: 'error', rowCount: 0 });
    // 첫 페이지는 받았으니 칸 링크 판정용 전체 건수는 남는다.
    expect(result.current.inquiryTotals).toEqual({ received: 150, inProgress: 1 });
  });

  it('처리로 100건 아래가 되면 예전 끝 페이지 행이 남지 않는다', async () => {
    let reportTotal = 150;
    server.use(
      http.get('*/admin/reports', ({ request }) =>
        pageParam(request) === 0
          ? ok(pageOf([report(1, hoursAgo(1))], reportTotal))
          : ok(pageOf([report(2, hoursAgo(300))], reportTotal, pageParam(request))),
      ),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(itemKeys(result.current.items)).toEqual(['REPORT:2', 'REPORT:1']));

    reportTotal = 1;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.reportsAll });
    });

    await waitFor(() => expect(itemKeys(result.current.items)).toEqual(['REPORT:1']));
    expect(result.current.areas.REPORT.rowCount).toBe(1);
  });

  it('재조회가 실패해도 받은 목록은 그대로 두고 실패로 보지 않는다', async () => {
    server.use(http.get('*/admin/reports', () => ok(pageOf([report(1, hoursAgo(1))]))));
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(itemKeys(result.current.items)).toEqual(['REPORT:1']));

    server.use(http.get('*/admin/reports', () => fail()));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.reportsAll });
    });
    await waitFor(() =>
      expect(queryClient.getQueryState(adminQueryKeys.reportsList({ status: 'PENDING', page: 0, size: 100 }))?.status).toBe('error'),
    );

    expect(result.current.areas.REPORT.status).toBe('ready');
    expect(itemKeys(result.current.items)).toEqual(['REPORT:1']);
    expect(result.current.isError).toBe(false);
  });

  it('끝 페이지 재조회가 실패해도 받은 끝 페이지 행을 그대로 둔다', async () => {
    let tailPageFails = false;
    server.use(
      http.get('*/admin/reports', ({ request }) => {
        if (pageParam(request) === 0) return ok(pageOf([report(1, hoursAgo(1))], 150));
        return tailPageFails ? fail() : ok(pageOf([report(2, hoursAgo(300))], 150, pageParam(request)));
      }),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(queryClient) });
    await waitFor(() => expect(itemKeys(result.current.items)).toEqual(['REPORT:2', 'REPORT:1']));

    tailPageFails = true;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.reportsAll });
    });
    await waitFor(() =>
      expect(queryClient.getQueryState(adminQueryKeys.reportsList({ status: 'PENDING', page: 1, size: 100 }))?.status).toBe('error'),
    );

    // tailFailed 도 data 기준이다 — 받아 둔 끝 페이지가 있으면 오래된 순이 그대로 맞다.
    expect(result.current.areas.REPORT.status).toBe('ready');
    expect(itemKeys(result.current.items)).toEqual(['REPORT:2', 'REPORT:1']);
    expect(result.current.isError).toBe(false);
  });
});

const pendingClub = (id: number, pendingSince: string | null | undefined): AdminClubSummary => ({
  id, name: `동아리 ${id}`, category: 'ACADEMIC', division: null, college: null, logoUrl: null,
  status: 'PENDING_APPROVAL', tags: [], leaderId: null, leaderName: null, leaderStudentId: null,
  centralClub: false, facilitySecuredTimeTarget: false, rejectionReason: null, statusChangedAt: null,
  statusChangedByName: null, ...(pendingSince === undefined ? {} : { pendingSince }),
});

describe('useAdminTriageQueue — 동아리 승인', () => {
  it('승인 대기 동아리를 대기 시작 순으로 대기열에 섞고, 승인 대기 목록을 한 번 받는다', async () => {
    const oldestClubAt = hoursAgo(200);
    server.use(
      http.get('*/admin/clubs', () => ok(pageOf([pendingClub(61, hoursAgo(20)), pendingClub(62, oldestClubAt)]))),
      http.get('*/admin/reports', () => ok(pageOf([report(1, hoursAgo(50))]))),
    );
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(itemKeys(result.current.items)).toEqual(['CLUB_APPROVAL:62', 'REPORT:1', 'CLUB_APPROVAL:61']);
    expect(result.current.areas.CLUB_APPROVAL).toEqual({ status: 'ready', rowCount: 2, oldestWaitingSince: oldestClubAt });
    expect(result.current.clubApprovalTimeUnknown).toBe(false);
    expect(requestsTo('/admin/clubs')).toEqual([{ status: 'PENDING_APPROVAL', page: '0', size: '100' }]);
    expect(queryClient.getQueryData(adminQueryKeys.clubsList({ status: 'PENDING_APPROVAL', page: 0, size: 100 }))).toBeDefined();
  });

  it('응답에 승인 대기 시작 시각 필드가 없으면(옛 백엔드) 동아리 항목을 넣지 않고 시각 모름으로 둔다', async () => {
    server.use(http.get('*/admin/clubs', () => ok(pageOf([pendingClub(61, undefined)]))));
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.clubApprovalTimeUnknown).toBe(true);
    expect(itemKeys(result.current.items)).toEqual([]);
    expect(result.current.areas.CLUB_APPROVAL).toMatchObject({ status: 'ready', rowCount: 0, oldestWaitingSince: null });
  });

  it('승인 대기가 한 페이지(100곳)를 넘으면 오래된 건이 빠질 수 있어 동아리 항목을 버리되 실패로 보지 않는다', async () => {
    server.use(http.get('*/admin/clubs', () => ok(pageOf([pendingClub(61, hoursAgo(20))], 101))));
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(itemKeys(result.current.items)).toEqual([]);
    expect(result.current.areas.CLUB_APPROVAL).toMatchObject({ status: 'ready', rowCount: 0, oldestWaitingSince: null });
    expect(result.current.isError).toBe(false);
    expect(result.current.clubApprovalTimeUnknown).toBe(false);
  });

  it('승인 대기가 정확히 한 페이지(100곳)면 상한 안이라 동아리 행을 그대로 넣는다', async () => {
    server.use(http.get('*/admin/clubs', () => ok(pageOf([pendingClub(61, hoursAgo(20))], 100))));
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(itemKeys(result.current.items)).toEqual(['CLUB_APPROVAL:61']);
    expect(result.current.areas.CLUB_APPROVAL).toMatchObject({ status: 'ready', rowCount: 1 });
  });

  it('승인 대기 목록을 받지 못하면 동아리 영역만 실패로 두고 다른 행은 남긴다', async () => {
    server.use(
      http.get('*/admin/clubs', () => fail()),
      http.get('*/admin/reports', () => ok(pageOf([report(1, hoursAgo(50))]))),
    );
    const { result } = renderHook(() => useAdminTriageQueue(), { wrapper: makeWrapper(newQueryClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.areas.CLUB_APPROVAL).toMatchObject({ status: 'error', rowCount: 0 });
    expect(itemKeys(result.current.items)).toEqual(['REPORT:1']);
    expect(result.current.isError).toBe(true);
    expect(result.current.clubApprovalTimeUnknown).toBe(false);
  });
});
