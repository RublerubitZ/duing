import { act, render, renderHook, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';
import type { RecruitmentDetail, StudentRecruitmentProjection } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { useClubApply } from '@/app/clubs/[clubId]/_lib/useClubApply';
import ApplyPage from '@/app/apply/[recruitmentId]/page';

/**
 * 지원 가능 여부(eligibility)는 지원하기 클릭의 사전 확인과 /apply 진입 가드가 각각 묻는다.
 * 두 지점이 라우트 전환 간격을 두고 같은 판정을 두 번 요청하던 것을 한 번으로 줄였으므로,
 * 이 스위트는 화면이 아니라 "나간 요청 수" 를 단언한다.
 */
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace, back: vi.fn() }),
  // 정적 셸 전환으로 recruitmentId 는 클라이언트가 useParams 로 읽는다 (vi.mock 호이스팅 탓에 리터럴).
  useParams: () => ({ recruitmentId: '42' }),
}));

const RECRUITMENT_ID = 42;
const CLUB_ID = 7;
const QUESTION_ID = '11111111-1111-1111-1111-111111111111';
const BASE = 'http://localhost:8080/api/v1';

const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

/** 이 스위트에서 나간 eligibility 요청 — 중복 제거의 유일한 관측 대상. */
const eligibilityRequests: string[] = [];
const trackRequest = ({ request }: { request: Request }) => {
  const { pathname } = new URL(request.url);
  if (pathname.endsWith('/applications/eligibility')) eligibilityRequests.push(pathname);
};

beforeAll(() => {
  server.listen({
    onUnhandledRequest: (req) => {
      // 지원 폼의 자동저장(debounce PUT) 이 테스트 종료 직전 발화할 수 있어 흘려보낸다.
      if (req.method === 'PUT' && req.url.endsWith('/draft')) return;
      throw new Error(`Unhandled ${req.method} ${req.url}`);
    },
  });
  server.events.on('request:start', trackRequest);
});
afterEach(() => {
  server.resetHandlers();
  mockRouterPush.mockReset();
  mockRouterReplace.mockReset();
  eligibilityRequests.length = 0;
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
});
afterAll(() => {
  server.events.removeListener('request:start', trackRequest);
  server.close();
});

const recruitmentProjection: StudentRecruitmentProjection = {
  id: RECRUITMENT_ID,
  title: '테스트 모집',
  startDate: '2026-01-01',
  endDate: '2099-12-31',
  displayStatus: 'OPEN',
  capacity: 20,
  useInterview: false,
  targetRole: 'MEMBER',
  applicationMode: 'SELF',
  externalFormUrl: null,
  interviewStartDate: null,
  interviewEndDate: null,
  applicantCount: null,
};

const recruitmentDetail: RecruitmentDetail = {
  id: RECRUITMENT_ID,
  clubId: CLUB_ID,
  clubName: '테스트 동아리',
  title: '테스트 모집',
  startDate: '2026-01-01',
  endDate: '2099-12-31',
  capacity: 20,
  status: 'OPEN',
  displayStatus: 'OPEN',
  effectivelyOpen: true,
  applicationMode: 'SELF',
  externalFormUrl: null,
  useInterview: false,
  targetRole: 'MEMBER',
  closedAt: null,
  content: null,
  questions: ['지원 동기는?'],
  questionItems: [
    { id: QUESTION_ID, text: '지원 동기는?', type: 'TEXT', required: true, choices: [] },
  ],
  interviewStartDate: null,
  interviewEndDate: null,
  showApplicantCount: false,
  applicantCount: null,
  interviewAvailabilityDeadline: null,
};

/** 지원 페이지가 거치는 상세·임시저장 요청 — eligibility 만 테스트별로 갈아끼운다. */
function pageHandlers() {
  return [
    http.get(`${BASE}/recruitments/${RECRUITMENT_ID}`, () =>
      HttpResponse.json({ ok: true, data: recruitmentDetail, message: null }),
    ),
    http.get(`${BASE}/recruitments/${RECRUITMENT_ID}/draft`, () =>
      HttpResponse.json({
        ok: true,
        data: { exists: false, answers: [], updatedAt: null },
        message: null,
      }),
    ),
  ];
}

function eligibilityHandler(status = 200, message: string | null = null) {
  return http.get(`${BASE}/recruitments/${RECRUITMENT_ID}/applications/eligibility`, () =>
    HttpResponse.json({ ok: status < 300, data: null, message }, { status }),
  );
}

function makeQueryClient() {
  // 앱 루트와 같이 staleTime 기본값을 둔다 — 훅이 이 기본값을 덮는지까지 함께 검증된다.
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

function renderApplyPage(queryClient: QueryClient) {
  const Wrapper = wrapperFor(queryClient);
  return render(
    <Wrapper>
      <Suspense fallback={<p>loading…</p>}>
        <ApplyPage />
      </Suspense>
    </Wrapper>,
  );
}

/** 지원하기 클릭 — 실제 화면과 같이 인증 상태에서 훅을 통해 누른다. */
function renderApplyButton(queryClient: QueryClient) {
  act(() => useAuthStore.setState({ status: 'authenticated', user: null }));
  return renderHook(() => useClubApply(recruitmentProjection), {
    wrapper: wrapperFor(queryClient),
  });
}

describe('지원 자격 확인 — 클릭 → 지원 페이지 핸드오프', () => {
  it('클릭 후 지원 페이지에 진입해도 자격 확인은 한 번만 나간다', async () => {
    server.use(...pageHandlers(), eligibilityHandler());
    const queryClient = makeQueryClient();

    const clickHook = renderApplyButton(queryClient);
    await act(() => clickHook.result.current.handleApply());

    expect(mockRouterPush).toHaveBeenCalledWith(`/apply/${RECRUITMENT_ID}`);
    expect(eligibilityRequests).toHaveLength(1);

    // 라우트 이동 — 이전 화면이 내려가고 지원 페이지가 같은 QueryClient 위에서 올라온다.
    clickHook.unmount();
    renderApplyPage(queryClient);

    expect(await screen.findByRole('button', { name: '제출' })).toBeInTheDocument();
    expect(eligibilityRequests).toHaveLength(1);
  });

  it('빠른 연속 클릭도 확인 요청을 하나로 합친다', async () => {
    server.use(
      ...pageHandlers(),
      http.get(`${BASE}/recruitments/${RECRUITMENT_ID}/applications/eligibility`, async () => {
        await delay(20);
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const queryClient = makeQueryClient();
    const clickHook = renderApplyButton(queryClient);

    // 첫 클릭의 pending 이 화면에 반영되기 전에 두 번째가 들어오는 상황.
    await act(async () => {
      await Promise.all([
        clickHook.result.current.handleApply(),
        clickHook.result.current.handleApply(),
      ]);
    });

    expect(eligibilityRequests).toHaveLength(1);
    expect(mockRouterPush).toHaveBeenCalledWith(`/apply/${RECRUITMENT_ID}`);
  });

  it.each([
    [409, '이미 지원한 모집 공고입니다.'],
    [403, '지원 대상이 아닙니다.'],
  ])('부적격(%i) 판정은 캐시로 재사용하지 않고 진입 시 다시 확인한다', async (status, message) => {
    server.use(...pageHandlers(), eligibilityHandler(status, message));
    const queryClient = makeQueryClient();

    const clickHook = renderApplyButton(queryClient);
    await act(() => clickHook.result.current.handleApply());

    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(eligibilityRequests).toHaveLength(1);

    // 사유를 알고도 딥링크로 들어오면, 실패는 캐시가 없는 것과 같아 다시 확인한다.
    clickHook.unmount();
    renderApplyPage(queryClient);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument();
    expect(eligibilityRequests).toHaveLength(2);
  });
});

describe('지원 자격 확인 — 지원 페이지 단독 진입', () => {
  it('딥링크·새로고침 진입은 자격 확인을 한 번 보낸다', async () => {
    server.use(...pageHandlers(), eligibilityHandler());

    // 새로고침은 QueryClient 가 새로 만들어지는 하드 로드다 — 캐시 없이 한 번 확인한다.
    renderApplyPage(makeQueryClient());

    expect(await screen.findByRole('button', { name: '제출' })).toBeInTheDocument();
    expect(eligibilityRequests).toHaveLength(1);
  });

  it('이탈 후 재진입은 직전 판정을 물려받지 않고 다시 확인한다', async () => {
    server.use(...pageHandlers(), eligibilityHandler());
    // 루트 QueryClient 는 SPA 네비게이션 내내 살아 있다 — 뒤로가기·재진입 재현.
    const queryClient = makeQueryClient();

    const firstVisit = renderApplyPage(queryClient);
    expect(await screen.findByRole('button', { name: '제출' })).toBeInTheDocument();
    firstVisit.unmount();

    // gcTime 만료는 setTimeout 으로 스케줄되므로 매크로태스크 한 틱을 흘려보낸다.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    renderApplyPage(queryClient);

    expect(await screen.findByRole('button', { name: '제출' })).toBeInTheDocument();
    expect(eligibilityRequests).toHaveLength(2);
  });
});
