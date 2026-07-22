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

import NewRecruitmentPage from '@/app/manage/clubs/[clubId]/recruitments/new/page';

const CLUB_ID = 1;
const SOURCE_ID = 9;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function sourceRecruitmentHandler() {
  return http.get(`*/recruitments/${SOURCE_ID}`, () =>
    HttpResponse.json({
      ok: true,
      message: null,
      data: {
        id: SOURCE_ID, clubId: CLUB_ID, clubName: '두잉', title: '9기 신입 모집',
        startDate: '2025-09-10', endDate: '2025-09-24', capacity: 18,
        status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false,
        applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER',
        content: '기존 안내문', questions: [],
        questionItems: [
          { id: 'q1', text: '지원 동기를 알려주세요', type: 'TEXT', required: true, choices: [] },
        ],
        interviewStartDate: null, interviewEndDate: null, showApplicantCount: false, applicantCount: null,
      },
    }),
  );
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage(searchParams: { cloneFrom?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 의 use(thenable) 가 재진입 없이 동기적으로 값을 꺼내가도록 status/value 가 미리
  // 태깅된 thenable 을 전달한다 (상세·목록 페이지 테스트와 동일 패턴). 일반 Promise.resolve 를
  // 넘기면 use 가 한 번 suspend 한 뒤 microtask 가 act 경계를 벗어나 영구 loading 으로 막힌다.
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  const searchParamsThenable = Object.assign(Promise.resolve(searchParams), {
    status: 'fulfilled' as const,
    value: searchParams,
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <NewRecruitmentPage params={params} searchParams={searchParamsThenable} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('NewRecruitmentPage — 양식 복제', () => {
  it('cloneFrom 쿼리가 없으면 평소처럼 빈 폼을 연다', () => {
    renderPage({});
    expect(screen.getByText('신규 모집 작성')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveValue('');
  });

  it('cloneFrom이 있으면 원본을 불러와 제목·질문을 시드하고 안내 배너를 보여준다', async () => {
    server.use(sourceRecruitmentHandler());
    renderPage({ cloneFrom: String(SOURCE_ID) });

    expect(await screen.findByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveValue('9기 신입 모집');
    expect(screen.getByText(/원본 모집은 변경되지 않으며/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('지원 동기를 알려주세요')).toBeInTheDocument();
  });
});
