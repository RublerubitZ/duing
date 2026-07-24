import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

import RecruitmentsPage from '@/app/manage/clubs/[clubId]/recruitments/page';

const CLUB_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function summaryHandler(
  recruitmentId: number,
  overrides: Partial<{ total: number; underReview: number; interviewPending: number; accepted: number }> = {},
) {
  return http.get(`*/leader/recruitments/${recruitmentId}/stats/summary`, () =>
    HttpResponse.json({
      ok: true,
      message: null,
      data: {
        total: overrides.total ?? 0,
        submitted: overrides.total ?? 0,
        underReview: overrides.underReview ?? 0,
        interviewPending: overrides.interviewPending ?? 0,
        accepted: overrides.accepted ?? 0,
        rejected: 0,
        capacity: 20,
        ratio: 0,
      },
    }),
  );
}

function recruitmentListHandler(recruitmentRows: unknown[]) {
  return http.get(`*/clubs/${CLUB_ID}/recruitments`, () =>
    HttpResponse.json({ ok: true, message: null, data: recruitmentRows }),
  );
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 의 use(thenable) 가 재진입 없이 동기적으로 값을 꺼내가도록 status/value 가
  // 미리 태깅된 thenable 을 전달한다 (server-rendered params 와 동일 모양, 상세 페이지 테스트와 동일).
  // 일반 Promise.resolve 를 넘기면 use 가 한 번 suspend 한 뒤 microtask 가 act 경계를 벗어나
  // jsdom + vitest 환경에서 영구 loading 으로 막힌다.
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <RecruitmentsPage params={params} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('RecruitmentsPage', () => {
  it('활성 모집이 없으면 헤더 CTA·Empty State CTA가 보이고 KPI Row는 렌더하지 않는다', async () => {
    server.use(
      recruitmentListHandler([
        {
          id: 9, clubId: CLUB_ID, clubName: '두잉', title: '9기 신입 모집',
          startDate: '2025-09-10', endDate: '2025-09-24', capacity: 18,
          status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false,
          applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER',
        },
      ]),
      summaryHandler(9, { total: 41, accepted: 18 }),
    );
    renderPage();

    expect(await screen.findByText('진행 중인 모집이 없어요')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /새 모집 만들기/ })).toHaveLength(2);
    expect(screen.queryByText('검토 대기')).not.toBeInTheDocument();
    // PastRecruitmentsTable 은 데스크탑 표·모바일 카드를 둘 다 렌더(CSS 로만 토글)하므로
    // jsdom 에선 제목이 2회 등장한다 — 존재 여부만 확인.
    expect((await screen.findAllByText('9기 신입 모집')).length).toBeGreaterThan(0);
  });

  it('활성 모집이 있으면 헤더 CTA를 숨기고 KPI Row와 현재 모집 카드를 렌더한다', async () => {
    server.use(
      recruitmentListHandler([
        {
          id: 10, clubId: CLUB_ID, clubName: '두잉', title: '10기 신입 모집',
          startDate: '2026-09-15', endDate: '2026-09-27', capacity: 20,
          status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
          applicationMode: 'SELF', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER',
        },
      ]),
      summaryHandler(10, { total: 34, underReview: 12, interviewPending: 8, accepted: 2 }),
    );
    renderPage();

    expect(await screen.findByRole('link', { name: '10기 신입 모집' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /새 모집 만들기/ })).not.toBeInTheDocument();
    expect(screen.getByText('검토 대기')).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '지원자 관리' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '면접 관리' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '통계' })).toBeInTheDocument();
  });
});
