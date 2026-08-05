import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { RecruitmentDisplayStatus, RecruitmentStatus } from '@duing/types';

// 수정 가드는 raw status 기준이다(#894) — 마감일이 지났어도 수동 마감 전이면 백엔드가 수정을 허용하므로
// displayStatus 로 막으면 기간 종료 직후 오탈자 하나 못 고친다. 그 게이트만 고정한다.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

import EditRecruitmentPage from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/edit/page';

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function recruitmentDetailHandler(
  status: RecruitmentStatus,
  displayStatus: RecruitmentDisplayStatus,
) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
    HttpResponse.json({
      ok: true,
      message: null,
      data: {
        id: RECRUITMENT_ID, clubId: CLUB_ID, clubName: '두잉', title: '11기 신입 모집',
        startDate: '2025-03-01', endDate: '2025-03-14', capacity: 20,
        status, displayStatus, effectivelyOpen: false,
        applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER',
        content: null, questions: [], questionItems: [],
        interviewStartDate: null, interviewEndDate: null, showApplicantCount: false, applicantCount: null,
      },
    }),
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
  // React 19 의 use(thenable) 가 재진입 없이 값을 꺼내가도록 status/value 가 태깅된 thenable 을 넘긴다
  // (다른 모집 페이지 테스트와 동일 패턴 — 일반 Promise 는 영구 loading 으로 막힌다).
  const paramsValue = { clubId: String(CLUB_ID), recruitmentId: String(RECRUITMENT_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });

  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <EditRecruitmentPage params={params} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('EditRecruitmentPage — 수정 가드', () => {
  it('마감일이 지난 OPEN 모집(만료-OPEN)은 그대로 수정할 수 있다', async () => {
    server.use(recruitmentDetailHandler('OPEN', 'CLOSED'));
    renderPage();

    expect(await screen.findByPlaceholderText('모집 공고 제목을 입력하세요')).toHaveValue('11기 신입 모집');
    // 저장 버튼은 헤더와 폼 하단 두 곳에 있다.
    expect(screen.getAllByRole('button', { name: '수정 저장' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('마감된 모집은 수정할 수 없습니다.')).not.toBeInTheDocument();
  });

  it('실제로 마감(raw CLOSED)된 모집은 수정 폼 대신 차단 안내를 보여준다', async () => {
    server.use(recruitmentDetailHandler('CLOSED', 'CLOSED'));
    renderPage();

    expect(await screen.findByText('마감된 모집은 수정할 수 없습니다.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: '수정 저장' })).toHaveLength(0);
  });
});
