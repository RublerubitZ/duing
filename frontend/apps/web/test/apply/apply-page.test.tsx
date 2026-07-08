import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { DraftAnswer, RecruitmentDetail } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace, back: vi.fn() }),
}));

import { ApplyForm } from '@/app/apply/[recruitmentId]/_components/ApplyForm';
import ApplyPage from '@/app/apply/[recruitmentId]/page';

const RECRUITMENT_ID = 42;
// 딥링크 가드 테스트(ApplyPage 전체 렌더)가 recruitment 상세·draft·eligibility 세 요청을 모두
// 거치므로, resetHandlers 이후에도 유지되도록 기본 200 핸들러를 setupServer 초기 목록에 둔다.
// ApplyForm 을 직접 렌더하는 기존 테스트들은 이 핸들러들을 타지 않으므로 영향이 없다.
const server = setupServer(mockRecruitmentDetailHandler(), mockDraftHandler(), mockEligibilityHandler(200));
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() =>
  server.listen({
    onUnhandledRequest: (req) => {
      // 자동저장(useAutosaveDraft) 의 debounce PUT 가 테스트 종료 직전 발화할 수 있어
      // unhandled 로 흘려보낸다. 다른 unhandled 는 그대로 에러.
      if (req.method === 'PUT' && req.url.endsWith(`/draft`)) return;
      console.error(`Unhandled ${req.method} ${req.url}`);
      throw new Error(`Unhandled ${req.method} ${req.url}`);
    },
  }),
);
afterEach(() => {
  server.resetHandlers();
  mockRouterPush.mockReset();
  mockRouterReplace.mockReset();
});
afterAll(() => server.close());

type RecruitmentDetailMockOpts = {
  useInterview?: boolean;
  questions?: string[];
  interviewAvailabilityDeadline?: string | null;
};

function makeRecruitment({
  useInterview = false,
  questions = ['지원 동기는?'],
  interviewAvailabilityDeadline = null,
}: RecruitmentDetailMockOpts = {}): RecruitmentDetail {
  return {
    id: RECRUITMENT_ID,
    clubId: 1,
    clubName: '테스트 동아리',
    title: '테스트 모집',
    startDate: '2099-01-01',
    endDate: null,
    capacity: 10,
    status: 'OPEN',
    displayStatus: 'OPEN',
    effectivelyOpen: true,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview,
    targetRole: 'MEMBER',
    content: null,
    questions,
    interviewStartDate: null,
    interviewEndDate: null,
    showApplicantCount: false,
    applicantCount: null,
    interviewAvailabilityDeadline,
  };
}

function mockSubmitApplication(applicationId = 999) {
  return http.post(`*/recruitments/${RECRUITMENT_ID}/applications`, () =>
    HttpResponse.json({ ok: true, data: applicationId, message: null }),
  );
}

// ApplyPage 전체 렌더 테스트 전용 핸들러 — 상세/임시저장/사전 확인 세 요청을 모두 담당한다.
function mockRecruitmentDetailHandler(recruitment: RecruitmentDetail = makeRecruitment()) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
    HttpResponse.json({ ok: true, data: recruitment, message: null }),
  );
}

function mockDraftHandler() {
  return http.get(`*/recruitments/${RECRUITMENT_ID}/draft`, () =>
    HttpResponse.json({ ok: true, data: { exists: false, answers: [], updatedAt: null }, message: null }),
  );
}

function mockEligibilityHandler(status: number, message: string | null = null) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}/applications/eligibility`, () =>
    HttpResponse.json({ ok: status < 300, data: null, message }, { status }),
  );
}

function renderForm(opts: RecruitmentDetailMockOpts = {}) {
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

  const recruitment = makeRecruitment(opts);
  const initialAnswers: DraftAnswer[] = recruitment.questions.map((_, idx) => ({
    questionId: idx,
    value: '',
  }));

  return render(
    <Wrapper>
      <ApplyForm
        recruitment={recruitment}
        recruitmentId={RECRUITMENT_ID}
        initialAnswers={initialAnswers}
      />
    </Wrapper>,
  );
}

describe('ApplyForm — 단일 스텝 지원', () => {
  it('useInterview=false 면 다음 버튼 없이 제출 버튼이 바로 노출된다', () => {
    renderForm({ useInterview: false });
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제출' })).toBeInTheDocument();
  });

  it('useInterview=true 도 다음 버튼 없이 제출 버튼이 바로 노출된다', () => {
    renderForm({ useInterview: true });
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제출' })).toBeInTheDocument();
  });

  it('제출 성공 시 me/applications/[id] 로 navigate 한다', async () => {
    server.use(mockSubmitApplication(555));

    const user = userEvent.setup();
    renderForm({ useInterview: false });
    await user.type(screen.getByLabelText(/지원 동기/), '열정');
    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalled());
    const firstCall = mockRouterPush.mock.calls[0];
    if (!firstCall) throw new Error('expected push call');
    const pushArg = firstCall[0];
    expect(typeof pushArg === 'string' && pushArg.includes('/me/applications/555')).toBe(true);
  });

  it('제출이 실패하면 서버 메시지가 알림으로 노출되고 이동하지 않는다', async () => {
    server.use(
      http.post('*/recruitments/:recruitmentId/applications', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '이미 지원한 모집입니다.' },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderForm({ useInterview: false });
    await user.type(screen.getByLabelText(/지원 동기/), '열정');
    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('이미 지원한 모집입니다.'),
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('제출 payload 에 interviewSlotIds 가 포함되지 않는다', async () => {
    // 기존 MSW submit 핸들러 패턴을 따라 request body 를 캡처한다.
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`*/recruitments/${RECRUITMENT_ID}/applications`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ok: true, data: 1, message: null });
      }),
    );
    // useInterview=true 모집으로 렌더
    renderForm({ useInterview: true });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/지원 동기/), '열정');
    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
    });
    expect(capturedBody).not.toHaveProperty('interviewSlotIds');
    expect(capturedBody?.['answers']).toEqual(['열정']);
  });
});

function renderApplyPage() {
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

  // React 19 의 use(thenable) 이 정상 fulfilled 상태로 재진입 없이 동기적으로 값을 꺼내가도록
  // status/value 가 미리 태깅된 thenable 을 전달한다 (server-rendered params 와 동일 모양).
  // 일반 Promise.resolve 를 넘기면 use 가 한 번 suspend 한 뒤 microtask 가 act 경계를 벗어나
  // jsdom + vitest 환경에서 영구 loading 으로 막힌다.
  const paramsValue = { recruitmentId: String(RECRUITMENT_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });

  return render(
    <Wrapper>
      <Suspense fallback={<p>loading…</p>}>
        <ApplyPage params={params} />
      </Suspense>
    </Wrapper>,
  );
}

describe('ApplyPage — 지원 가능 여부 딥링크 가드', () => {
  it('지원 가능하면 기존과 동일하게 지원 폼이 렌더된다', async () => {
    renderApplyPage();

    expect(await screen.findByRole('button', { name: '제출' })).toBeInTheDocument();
  });

  it('부적격 딥링크 진입은 지원 폼 대신 안내 패널을 보여준다', async () => {
    server.use(mockEligibilityHandler(409, '이미 지원한 모집 공고입니다.'));

    renderApplyPage();

    expect(await screen.findByText('이미 지원한 모집 공고입니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument();
    // makeRecruitment() 의 clubId 고정값(1)에 대응하는 동아리 상세로 돌아가는 링크.
    const backLink = screen.getByRole('link', { name: '동아리 페이지로 돌아가기' });
    expect(backLink).toHaveAttribute('href', '/clubs/1');
  });
});
