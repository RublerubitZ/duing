import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

// #913 — 검색창 안내가 "이름·학번·학과로 검색" 이라 입력값이 곧 학생 개인정보다.
// 주소에 실리면 방문 기록·referrer·액세스 로그·분석 도구로 함께 새어나가므로 화면 상태로만 둔다.
// 반대로 상태·단과대·기간은 공유 가능해야 하므로 주소에 그대로 남아야 한다.

const mockReplace = vi.fn();
const routerMock = { push: vi.fn(), replace: mockReplace, back: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => routerMock,
}));
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => routerMock,
}));

import ApplicantsPage from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/page';
import { ApplicantDetailPage } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantDetailPage';
import { ApplicantSearchProvider } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_lib/applicantSearch';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;
const APPLICATION_ID = 100;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

/** 서버로 나간 주소 — 검색어가 API 에는 도달하고 브라우저 주소에는 남지 않는지 확인하는 근거. */
let requestedUrls: string[] = [];
const record = (url: string) => {
  requestedUrls.push(url);
};

const recruitmentHandler = http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
  json({
    id: RECRUITMENT_ID,
    clubId: CLUB_ID,
    clubName: '테스트 동아리',
    title: '테스트 모집',
    startDate: '2026-03-02',
    endDate: '2026-03-16',
    capacity: 10,
    status: 'OPEN',
    displayStatus: 'OPEN',
    effectivelyOpen: true,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview: false,
    targetRole: 'MEMBER',
    closedAt: null,
    content: null,
    questions: [],
    questionItems: [],
    interviewStartDate: null,
    interviewEndDate: null,
    showApplicantCount: false,
    applicantCount: null,
  }),
);

const applicantsHandler = http.get(
  `*/leader/recruitments/${RECRUITMENT_ID}/applications`,
  ({ request }) => {
    record(request.url);
    return json([
      {
        applicationId: APPLICATION_ID,
        userId: 5,
        userName: '홍길동',
        studentId: '20200001',
        college: 'IT_ENGINEERING',
        major: '컴퓨터공학과',
        grade: 'JUNIOR',
        answers: [],
        status: 'SUBMITTED',
        submittedAt: '2026-03-10T10:00:00',
        interviewStartAt: null,
        myScore: null,
      },
    ]);
  },
);

const neighborsHandler = http.get(
  `*/leader/recruitments/${RECRUITMENT_ID}/applications/${APPLICATION_ID}/neighbors`,
  ({ request }) => {
    record(request.url);
    return json({ prevApplicationId: null, nextApplicationId: null });
  },
);

const applicantDetailHandler = http.get(`*/leader/applications/${APPLICATION_ID}`, () =>
  json({
    applicationId: APPLICATION_ID,
    recruitmentId: RECRUITMENT_ID,
    recruitmentTitle: '테스트 모집',
    clubId: CLUB_ID,
    clubName: '테스트 동아리',
    applicant: {
      userId: 5,
      name: '홍길동',
      studentId: '20200001',
      college: 'IT_ENGINEERING',
      major: '컴퓨터공학과',
      grade: 'JUNIOR',
      phone: '010-1234-5678',
    },
    answers: [],
    status: 'SUBMITTED',
    interview: null,
    submittedAt: '2026-03-10T10:00:00',
    myEvaluation: null,
    otherEvaluations: [],
    statusHistory: [],
    interviewAvailabilities: [],
    assignedSlot: null,
    interviewRound: null,
  }),
);

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  requestedUrls = [];
  mockReplace.mockClear();
});
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
  render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

/** 검색어가 붙어 나간 목록·이웃 요청이 하나라도 있는지. 디바운스(300ms) 뒤에 도착한다. */
function requestsCarrying(term: string): string[] {
  const encoded = encodeURIComponent(term);
  return requestedUrls.filter((url) => url.includes(`q=${encoded}`));
}

async function typeSearchTerm(term: string) {
  const searchInput = await screen.findByLabelText('지원자 검색');
  await userEvent.type(searchInput, term);
}

describe('지원자 관리 검색어 — 주소에 싣지 않는다 (#913)', () => {
  it('검색어는 목록 요청에만 실리고 주소 갱신에는 실리지 않는다', async () => {
    server.use(recruitmentHandler, applicantsHandler);

    renderWithProviders(<ApplicantsPage params={taggedParams()} />);
    expect(await screen.findAllByText('홍길동')).not.toHaveLength(0);

    await typeSearchTerm('홍길동');

    // 서버 검색은 그대로 동작해야 한다 — 주소에서 뺀 것이지 기능을 뺀 것이 아니다.
    await waitFor(() => expect(requestsCarrying('홍길동')).not.toHaveLength(0), {
      timeout: 3000,
    });
    // 그 사이 일어난 어떤 주소 갱신에도 검색어가 없어야 한다.
    expect(mockReplace).toHaveBeenCalled();
    mockReplace.mock.calls.forEach(([href]) => {
      expect(String(href)).not.toContain('q=');
      expect(String(href)).not.toContain('홍길동');
    });
  });

  it('상태 필터는 검색어와 함께 걸려도 주소에 남는다', async () => {
    server.use(recruitmentHandler, applicantsHandler);

    renderWithProviders(<ApplicantsPage params={taggedParams()} />);
    expect(await screen.findAllByText('홍길동')).not.toHaveLength(0);

    await typeSearchTerm('홍길동');
    await waitFor(() => expect(requestsCarrying('홍길동')).not.toHaveLength(0), {
      timeout: 3000,
    });

    await userEvent.click(screen.getByRole('button', { name: '보류 0명' }));

    const lastHref = String(mockReplace.mock.calls.at(-1)?.[0]);
    expect(lastHref).toContain('status=ON_HOLD');
    expect(lastHref).not.toContain('q=');
  });

  // 검색어를 주소에서 빼면 상세가 그것을 읽을 자리가 없어진다 — 세그먼트 상태가 그 자리를 대신해
  // 이웃(이전/다음) 계산이 검색 결과 안에서 유지되는지 확인한다.
  it('검색어가 상세의 이전/다음 계산으로 이어진다', async () => {
    server.use(
      recruitmentHandler,
      applicantsHandler,
      applicantDetailHandler,
      neighborsHandler,
    );

    renderWithProviders(
      <ApplicantSearchProvider>
        <ApplicantsPage params={taggedParams()} />
        <ApplicantDetailPage
          clubId={CLUB_ID}
          recruitmentId={RECRUITMENT_ID}
          applicationId={APPLICATION_ID}
        />
      </ApplicantSearchProvider>,
    );
    // 상세가 붙어 이웃 요청이 먼저 한 번 나간 뒤에 검색을 건다.
    await waitFor(() =>
      expect(requestedUrls.filter((url) => url.includes('/neighbors'))).not.toHaveLength(0),
    );

    await typeSearchTerm('홍길동');

    await waitFor(
      () =>
        expect(
          requestsCarrying('홍길동').filter((url) => url.includes('/neighbors')),
        ).not.toHaveLength(0),
      { timeout: 3000 },
    );
  });
});
