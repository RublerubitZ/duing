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

import RecruitmentScopeLayout from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/layout';

const CLUB_ID = 1;
const OTHER_CLUB_ID = 25;
const RECRUITMENT_ID = 999;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

// 모집 상세는 공개 API — 남의 동아리 모집이어도 200 으로 내려온다. 그 상황을 그대로 재현한다.
function recruitmentHandler(ownerClubId: number) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
    HttpResponse.json({
      ok: true,
      message: null,
      data: {
        id: RECRUITMENT_ID, clubId: ownerClubId, clubName: '남의 동아리', title: '10기 모집',
        startDate: '2026-09-10', endDate: '2026-09-24', capacity: 18,
        status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
        applicationMode: 'SELF', externalFormUrl: null, useInterview: false, targetRole: 'MEMBER',
        content: '남의 동아리 안내문', questions: [], questionItems: [],
        interviewStartDate: null, interviewEndDate: null,
        showApplicantCount: false, applicantCount: null,
      },
    }),
  );
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 의 use(thenable) 가 동기적으로 값을 꺼내가도록 미리 태깅한다 (recruitment-clone 과 동일 패턴).
  const paramsValue = { clubId: String(CLUB_ID), recruitmentId: String(RECRUITMENT_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <RecruitmentScopeLayout params={params}>
          <p>모집 관리 본문</p>
        </RecruitmentScopeLayout>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

describe('RecruitmentScopeLayout — clubId × recruitmentId 소속 검증', () => {
  it('URL 의 clubId 소속 모집이면 본문을 렌더한다', async () => {
    server.use(recruitmentHandler(CLUB_ID));
    renderLayout();

    expect(await screen.findByText('모집 관리 본문')).toBeInTheDocument();
  });

  it('내 동아리 clubId + 타 동아리 recruitmentId 조합은 403 안내로 차단한다', async () => {
    server.use(recruitmentHandler(OTHER_CLUB_ID));
    renderLayout();

    expect(await screen.findByText('이 동아리의 모집 공고가 아닙니다.')).toBeInTheDocument();
    expect(screen.queryByText('모집 관리 본문')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '모집 관리로 돌아가기' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments',
    );
  });

  it('소속을 확인하기 전(로딩)에는 본문을 미리 렌더하지 않는다', () => {
    server.use(recruitmentHandler(OTHER_CLUB_ID));
    renderLayout();

    expect(screen.queryByText('모집 관리 본문')).not.toBeInTheDocument();
  });
});
