import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { ApplicationMode } from '@duing/types';

// 외부 폼 모집은 지원서·통계를 쓰지 않는다 — 카드·사이드바 동선을 막아도 URL 직접 접근은 남는다.
// 그 경로에서 빈 목록·0 짜리 차트 대신 안내와 되돌아갈 길을 주는지 고정한다(스펙 §5.1).

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import ApplicantsPage from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/page';
import { StatsClient } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/stats/_components/StatsClient';

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;
const DETAIL_PATH = `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}`;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

function recruitmentHandler(applicationMode: ApplicationMode) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
    json({
      id: RECRUITMENT_ID,
      clubId: CLUB_ID,
      clubName: '테스트 동아리',
      title: '테스트 모집',
      startDate: '2099-01-01',
      endDate: '2099-02-01',
      capacity: 10,
      status: 'OPEN',
      displayStatus: 'OPEN',
      effectivelyOpen: true,
      applicationMode,
      externalFormUrl:
        applicationMode === 'EXTERNAL' ? 'https://docs.google.com/forms/d/e/abc/viewform' : null,
      useInterview: false,
      targetRole: 'MEMBER',
      content: null,
      questions: [],
      questionItems: [],
      interviewStartDate: null,
      interviewEndDate: null,
      showApplicantCount: false,
      applicantCount: null,
    }),
  );
}

const statsHandlers = [
  http.get(`*/leader/recruitments/${RECRUITMENT_ID}/stats/summary`, () =>
    json({
      total: 0,
      submitted: 0,
      underReview: 0,
      interviewPending: 0,
      accepted: 0,
      rejected: 0,
      capacity: 10,
      ratio: 0,
    }),
  ),
  http.get(`*/leader/recruitments/${RECRUITMENT_ID}/stats/daily`, () => json([])),
  http.get(`*/leader/recruitments/${RECRUITMENT_ID}/stats/funnel`, () =>
    json({ submitted: 0, underReview: 0, interviewPending: 0, accepted: 0, rejected: 0 }),
  ),
];

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** React 19 use(thenable) 가 동기적으로 값을 꺼내가도록 status/value 를 미리 태깅한다. */
function taggedParams() {
  const paramsValue = { clubId: String(CLUB_ID), recruitmentId: String(RECRUITMENT_ID) };
  return Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
}

function renderWithProviders(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('지원자 페이지 — 외부 폼 모집 직접 접근', () => {
  it('지원자 목록 대신 안내와 모집 상세 이동 링크를 보여준다', async () => {
    server.use(recruitmentHandler('EXTERNAL'));

    renderWithProviders(<ApplicantsPage params={taggedParams()} />);

    expect(await screen.findByText(/외부 폼 모집은 지원자 관리를 사용하지 않아요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /모집 상세로 이동/ })).toHaveAttribute(
      'href',
      DETAIL_PATH,
    );
    expect(screen.queryByText('지원자가 아직 없습니다')).not.toBeInTheDocument();
  });
});

describe('통계 페이지 — 외부 폼 모집 직접 접근', () => {
  it('0 짜리 차트 대신 안내와 모집 상세 이동 링크를 보여준다', async () => {
    server.use(recruitmentHandler('EXTERNAL'), ...statsHandlers);

    renderWithProviders(<StatsClient params={taggedParams()} />);

    expect(
      await screen.findByText('외부 폼 모집은 지원서를 두잉에서 받지 않아 통계를 제공하지 않아요.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /모집 상세로 이동/ })).toHaveAttribute(
      'href',
      DETAIL_PATH,
    );
    expect(screen.queryByText('일자별 지원 추이')).not.toBeInTheDocument();
  });

  it('자체 폼 모집이면 기존 통계 화면을 그대로 보여준다', async () => {
    server.use(recruitmentHandler('SELF'), ...statsHandlers);

    renderWithProviders(<StatsClient params={taggedParams()} />);

    expect(await screen.findByText('일자별 지원 추이')).toBeInTheDocument();
    expect(
      screen.queryByText('외부 폼 모집은 지원서를 두잉에서 받지 않아 통계를 제공하지 않아요.'),
    ).not.toBeInTheDocument();
  });
});
