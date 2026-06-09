import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import RecruitmentDetailPage from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page';

// 운영진 모집 상세 페이지 — useInterview 토글에 따른 "면접 관리" 링크 노출 검증.
// 다른 페이지 테스트와 동일하게 MSW + ApiClient 조합.

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;
const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function mockRecruitmentDetail(useInterview: boolean) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
    HttpResponse.json({
      ok: true,
      data: {
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
        applicationMode: 'SELF',
        externalFormUrl: null,
        useInterview,
        targetRole: 'MEMBER',
        content: null,
        questions: [],
        interviewStartDate: null,
        interviewEndDate: null,
        showApplicantCount: false,
        applicantCount: null,
      },
      message: null,
    }),
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }

  // React 19 의 use(thenable) 가 정상 fulfilled 상태로 재진입 없이 동기적으로 값을 꺼내가도록
  // status/value 가 미리 태깅된 thenable 을 전달한다 (server-rendered params 와 동일 모양).
  // 일반 Promise.resolve 를 넘기면 use 가 한 번 suspend 한 뒤 microtask 가 act 경계를 벗어나
  // jsdom + vitest 환경에서 영구 loading 으로 막힌다.
  const paramsValue = {
    clubId: String(CLUB_ID),
    recruitmentId: String(RECRUITMENT_ID),
  };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });

  return render(
    <Wrapper>
      <Suspense fallback={<p>loading…</p>}>
        <RecruitmentDetailPage params={params} />
      </Suspense>
    </Wrapper>,
  );
}

describe('RecruitmentDetailPage — 면접 관리 진입 링크 (Issue 1)', () => {
  it('useInterview=true 면 "면접 관리" 링크가 노출된다', async () => {
    server.use(mockRecruitmentDetail(true));

    renderPage();

    const link = await screen.findByRole('link', { name: '면접 관리' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/interview`,
    );
  });

  it('useInterview=false 면 "면접 관리" 링크가 노출되지 않는다', async () => {
    server.use(mockRecruitmentDetail(false));

    renderPage();

    // 다른 액션 버튼이 먼저 떠야 페이지 로딩이 끝났음을 알 수 있다.
    await screen.findByRole('link', { name: '지원자 관리' });
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: '면접 관리' })).not.toBeInTheDocument(),
    );
  });
});
