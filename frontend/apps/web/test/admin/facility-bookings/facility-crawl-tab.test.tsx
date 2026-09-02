import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminCrawlReservationGroup, PageResponse } from '@duing/types';

import { FacilityCrawlTab } from '@/app/admin/facility-bookings/_tabs/FacilityCrawlTab';

/* ── 테스트 데이터 — 동아리별(기본) 보기: 매칭 동아리 + 미매칭 기관이 함께 온다(수정 2) ── */
const CLUB_GROUP: AdminCrawlReservationGroup = {
  groupType: 'CLUB',
  clubId: 7,
  facilitySecuredTimeTarget: true,
  title: '고정관념',
  reservations: [
    {
      reservationId: 1,
      facilityId: 10,
      facilityName: '공연장',
      organizationName: '고정관념',
      reservationDate: '2026-08-28',
      startTime: '10:00',
      endTime: '17:00',
      classification: 'BASIC_SECURED_TIME',
      matchedClubId: 7,
      matchedClubName: '고정관념',
      crawledAt: '2026-08-27T05:00:00Z',
    },
    {
      reservationId: 2,
      facilityId: 10,
      facilityName: '공연장',
      organizationName: '고정관념',
      reservationDate: '2026-08-29',
      startTime: '10:00',
      endTime: '17:00',
      classification: 'BASIC_SECURED_TIME',
      matchedClubId: 7,
      matchedClubName: '고정관념',
      crawledAt: '2026-08-27T05:00:00Z',
    },
  ],
};

const EXTERNAL_GROUP: AdminCrawlReservationGroup = {
  groupType: 'EXTERNAL',
  title: '학생생활상담센터',
  reservations: [
    {
      reservationId: 3,
      facilityId: 10,
      facilityName: '공연장',
      organizationName: '학생생활상담센터',
      reservationDate: '2026-08-28',
      startTime: '17:00',
      endTime: '19:00',
      classification: 'CRAWLED_RESERVATION',
      crawledAt: '2026-08-27T05:00:00Z',
    },
  ],
};

const GROUP_PAGE: PageResponse<AdminCrawlReservationGroup> = {
  content: [CLUB_GROUP, EXTERNAL_GROUP],
  page: 0,
  size: 10,
  totalElements: 2,
  totalPages: 1,
  hasNext: false,
};

const requestedParams: Array<Record<string, string>> = [];

const server = setupServer(
  http.get('*/admin/facility-crawl/reservations', ({ request }) => {
    const url = new URL(request.url);
    requestedParams.push(Object.fromEntries(url.searchParams.entries()));
    return HttpResponse.json({ ok: true, data: GROUP_PAGE, message: null });
  }),
  http.get('*/facilities', () =>
    HttpResponse.json({
      ok: true,
      data: [{ id: 10, roomName: '공연장', location: null }],
      message: null,
    }),
  ),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  requestedParams.length = 0;
});
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>{children}</ApiClientProvider>
      </QueryClientProvider>
    );
  }
  return render(<FacilityCrawlTab />, { wrapper: Providers });
}

describe('FacilityCrawlTab', () => {
  it('동아리별 보기(기본)는 매칭 동아리 그룹과 미매칭 주체 그룹을 함께 렌더한다 — 분류·맥락 접기 포함', async () => {
    renderPage();

    // 매칭 동아리 그룹 — 기본 확보 대상 뱃지 + 연속 2일 맥락 접기(08/28~08/29)
    expect(await screen.findByText('고정관념')).toBeInTheDocument();
    expect(screen.getByText('기본 확보 대상')).toBeInTheDocument();
    expect(screen.getByText('08/28~08/29')).toBeInTheDocument();
    expect(screen.getByText('(2건 연속)')).toBeInTheDocument();
    expect(screen.getAllByText('기본 확보 시간').length).toBeGreaterThan(0);
    // 미매칭 주체(기관)도 누락 없이 별도 그룹으로 표시된다(수정 2)
    expect(screen.getByText('학생생활상담센터')).toBeInTheDocument();
    expect(screen.getByText('매칭 없음')).toBeInTheDocument();
    expect(screen.getByText('크롤 예약')).toBeInTheDocument();
    // 행 crawledAt 은 차등 반영상 "마지막 내용 변경" 시각이다(P2-09) — 수집 시각처럼 읽히는 라벨을 쓰지 않는다.
    // 픽스처 05:00Z = KST 14:00. 맥락(연속 묶음)마다 1회 표기라 2개 이상.
    expect(screen.getAllByText('마지막 변경 08/27 14:00').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^수집 \d/)).not.toBeInTheDocument();
    // 기본 요청 파라미터 — 동아리별(CLUB)·그룹 페이징
    await waitFor(() => expect(requestedParams.length).toBeGreaterThan(0));
    expect(requestedParams[0]?.groupBy).toBe('CLUB');
    expect(requestedParams[0]?.size).toBe('10');
  });

  it('정리 기준 세그먼트를 바꾸면 groupBy 파라미터로 재조회하고 페이지가 0으로 돌아간다', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('고정관념');

    await user.click(screen.getByRole('button', { name: '시설별' }));

    await waitFor(() =>
      expect(requestedParams.some((params) => params.groupBy === 'FACILITY')).toBe(true),
    );
    const facilityRequest = requestedParams.find((params) => params.groupBy === 'FACILITY');
    expect(facilityRequest?.page).toBe('0');
  });

  it('시설별 보기는 행마다 주체를 표시하고, 주체가 다른 같은 시간대는 한 맥락으로 접지 않는다(수정 3)', async () => {
    const FACILITY_GROUP: AdminCrawlReservationGroup = {
      groupType: 'FACILITY',
      facilityId: 10,
      title: '공연장',
      // 서버의 시설별 정렬(일자→시작시각)은 주체를 섞어 내려준다: A 8/28, B 8/28, A 8/29
      reservations: [
        { ...CLUB_GROUP.reservations[0]!, reservationId: 11, organizationName: 'A동아리', reservationDate: '2026-08-28' },
        { ...CLUB_GROUP.reservations[0]!, reservationId: 12, organizationName: 'B기관', reservationDate: '2026-08-28' },
        { ...CLUB_GROUP.reservations[0]!, reservationId: 13, organizationName: 'A동아리', reservationDate: '2026-08-29' },
      ],
    };
    server.use(
      http.get('*/admin/facility-crawl/reservations', ({ request }) => {
        const url = new URL(request.url);
        requestedParams.push(Object.fromEntries(url.searchParams.entries()));
        const page = url.searchParams.get('groupBy') === 'FACILITY' ? { ...GROUP_PAGE, content: [FACILITY_GROUP] } : GROUP_PAGE;
        return HttpResponse.json({ ok: true, data: page, message: null });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('고정관념');

    await user.click(screen.getByRole('button', { name: '시설별' }));

    // B기관 이 A동아리 사이에 끼어도 A 의 8/28·8/29 는 한 맥락(1행), B 는 별도 행 — 주체가 각 행에 보인다
    expect(await screen.findByText('B기관')).toBeInTheDocument();
    expect(screen.getByText('A동아리')).toBeInTheDocument();
    expect(screen.getByText('08/28~08/29')).toBeInTheDocument();
    expect(screen.getByText('(2건 연속)')).toBeInTheDocument();
    expect(screen.getByText('08/28')).toBeInTheDocument();
  });

  it('시설 필터를 고르면 facilityId 파라미터로 재조회한다', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('고정관념');

    await user.selectOptions(screen.getByRole('combobox', { name: /시설/ }), '10');

    await waitFor(() =>
      expect(requestedParams.some((params) => params.facilityId === '10')).toBe(true),
    );
  });
});
