import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { DraftAnswer, RecruitmentDetail, RecruitmentQuestionItem } from '@duing/types';
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

// 질문 id 는 V78 이후 서버가 발급하는 UUID 다 — 배열 인덱스가 아니라는 점이 드러나도록 UUID 형태로 둔다.
// (makeRecruitment 의 기본 인자로 쓰이므로 setupServer 호출보다 위에 있어야 TDZ 를 피한다.)
const TEXT_QUESTION_ID = '11111111-1111-1111-1111-111111111111';
const SINGLE_QUESTION_ID = '22222222-2222-2222-2222-222222222222';
const MULTI_QUESTION_ID = '33333333-3333-3333-3333-333333333333';
const SINGLE_CHOICE_MONDAY_ID = 'c1111111-0000-0000-0000-000000000001';
const SINGLE_CHOICE_TUESDAY_ID = 'c1111111-0000-0000-0000-000000000002';
const MULTI_CHOICE_FRONTEND_ID = 'c2222222-0000-0000-0000-000000000001';
const MULTI_CHOICE_BACKEND_ID = 'c2222222-0000-0000-0000-000000000002';

const TEXT_ONLY_QUESTION_ITEMS: RecruitmentQuestionItem[] = [
  { id: TEXT_QUESTION_ID, text: '지원 동기는?', type: 'TEXT', required: true, choices: [] },
];

/** 주관식(필수) + 단일 선택(필수) + 복수 선택(선택) — 세 유형과 필수/선택을 한 번에 덮는 픽스처. */
const MIXED_QUESTION_ITEMS: RecruitmentQuestionItem[] = [
  { id: TEXT_QUESTION_ID, text: '지원 동기는?', type: 'TEXT', required: true, choices: [] },
  {
    id: SINGLE_QUESTION_ID,
    text: '주 활동 요일은?',
    type: 'SINGLE_CHOICE',
    required: true,
    choices: [
      { id: SINGLE_CHOICE_MONDAY_ID, label: '월요일' },
      { id: SINGLE_CHOICE_TUESDAY_ID, label: '화요일' },
    ],
  },
  {
    id: MULTI_QUESTION_ID,
    text: '관심 분야를 모두 고르세요',
    type: 'MULTIPLE_CHOICE',
    required: false,
    choices: [
      { id: MULTI_CHOICE_FRONTEND_ID, label: '프론트엔드' },
      { id: MULTI_CHOICE_BACKEND_ID, label: '백엔드' },
    ],
  },
];

/** 필수 복수 선택 단일 질문 — 체크박스 그룹의 필수 여부 전달(aria-required) 검증용. */
const REQUIRED_MULTI_QUESTION_ITEMS: RecruitmentQuestionItem[] = [
  {
    id: MULTI_QUESTION_ID,
    text: '관심 분야를 모두 고르세요',
    type: 'MULTIPLE_CHOICE',
    required: true,
    choices: [
      { id: MULTI_CHOICE_FRONTEND_ID, label: '프론트엔드' },
      { id: MULTI_CHOICE_BACKEND_ID, label: '백엔드' },
    ],
  },
];

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
  questionItems?: RecruitmentQuestionItem[];
  interviewAvailabilityDeadline?: string | null;
};

function makeRecruitment({
  useInterview = false,
  questionItems = TEXT_ONLY_QUESTION_ITEMS,
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
    // 구 BE 호환 필드 — 신 BE 는 questionItems 와 함께 텍스트 목록도 그대로 내려준다.
    questions: questionItems.map((question) => question.text),
    questionItems,
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
  const questionItems = recruitment.questionItems ?? [];
  const initialAnswers: DraftAnswer[] = questionItems.map((question) => ({
    questionId: question.id,
    values: [],
  }));

  return render(
    <Wrapper>
      <ApplyForm
        recruitment={recruitment}
        recruitmentId={RECRUITMENT_ID}
        questionItems={questionItems}
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
    expect(capturedBody?.['answerItems']).toEqual([
      { questionId: TEXT_QUESTION_ID, values: ['열정'] },
    ]);
  });
});

/** 제출 엔드포인트 호출 여부와 body 를 함께 캡처한다 — "요청이 나가지 않는다" 단언용. */
function captureSubmit(capturedBodies: unknown[], applicationId = 999) {
  return http.post(`*/recruitments/${RECRUITMENT_ID}/applications`, async ({ request }) => {
    capturedBodies.push(await request.json());
    return HttpResponse.json({ ok: true, data: applicationId, message: null });
  });
}

describe('ApplyForm — 질문 유형별 렌더·검증·구조화 제출', () => {
  it('질문 유형에 따라 주관식·단일 선택·복수 선택 컨트롤이 렌더된다', () => {
    renderForm({ questionItems: MIXED_QUESTION_ITEMS });

    expect(screen.getByRole('textbox', { name: /지원 동기/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '월요일' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '화요일' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '프론트엔드' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '백엔드' })).toBeInTheDocument();

    // 필수 여부는 aria-required(스크린리더) + (선택) 배지(시각)로 함께 전달한다.
    expect(screen.getByRole('textbox', { name: /지원 동기/ })).toHaveAttribute(
      'aria-required',
      'true',
    );
    expect(screen.getByRole('radiogroup', { name: /주 활동 요일/ })).toHaveAttribute(
      'aria-required',
      'true',
    );
    expect(screen.getByText('(선택)')).toBeInTheDocument();
  });

  it('필수 질문을 비우고 제출하면 질문별 안내가 뜨고 요청이 나가지 않는다', async () => {
    const capturedBodies: unknown[] = [];
    server.use(captureSubmit(capturedBodies));

    const user = userEvent.setup();
    renderForm({ questionItems: MIXED_QUESTION_ITEMS });

    await user.click(screen.getByRole('button', { name: '제출' }));

    // 필수 주관식 + 필수 단일 선택 두 건. 복수 선택은 선택 질문이라 위반이 아니다.
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('필수 질문입니다. 답변을 입력해주세요.');
    expect(alerts[1]).toHaveTextContent('필수 질문입니다. 항목을 선택해주세요.');

    expect(capturedBodies).toHaveLength(0);
    expect(mockRouterPush).not.toHaveBeenCalled();

    // 첫 위반 질문(주관식)으로 포커스가 이동한다.
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /지원 동기/ }));

    // 오류 컨트롤은 aria-invalid + aria-describedby 로 안내와 연결된다.
    const textarea = screen.getByRole('textbox', { name: /지원 동기/ });
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute('aria-describedby', `q-${TEXT_QUESTION_ID}-error`);
  });

  it('필수 복수 선택 질문은 체크박스마다 aria-required 로 필수 여부를 전달한다', async () => {
    const capturedBodies: unknown[] = [];
    server.use(captureSubmit(capturedBodies));

    const user = userEvent.setup();
    renderForm({ questionItems: REQUIRED_MULTI_QUESTION_ITEMS });

    // `*` 는 aria-hidden 이므로 필수 여부는 aria-required 로만 보조기술에 전달된다.
    const frontendCheckbox = screen.getByRole('checkbox', { name: '프론트엔드' });
    expect(frontendCheckbox).toHaveAttribute('aria-required', 'true');
    expect(frontendCheckbox).toHaveAttribute('aria-invalid', 'false');

    await user.click(screen.getByRole('button', { name: '제출' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '필수 질문입니다. 항목을 선택해주세요.',
    );
    expect(capturedBodies).toHaveLength(0);
    expect(screen.getByRole('checkbox', { name: '프론트엔드' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: '백엔드' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('선택(비필수) 복수 선택 질문의 체크박스는 aria-required=false 다', () => {
    renderForm({ questionItems: MIXED_QUESTION_ITEMS });

    expect(screen.getByRole('checkbox', { name: '프론트엔드' })).toHaveAttribute(
      'aria-required',
      'false',
    );
  });

  it('공백만 입력한 필수 주관식은 제출되지 않고 인라인 안내가 뜬다', async () => {
    const capturedBodies: unknown[] = [];
    server.use(captureSubmit(capturedBodies));

    const user = userEvent.setup();
    renderForm({ questionItems: MIXED_QUESTION_ITEMS });

    await user.type(screen.getByRole('textbox', { name: /지원 동기/ }), '   ');
    await user.click(screen.getByRole('radio', { name: '월요일' }));
    await user.click(screen.getByRole('button', { name: '제출' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('필수 질문입니다. 답변을 입력해주세요.');
    expect(capturedBodies).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /지원 동기/ }));
  });

  it('답변을 채운 질문의 안내는 사라지고 다음 위반 컨트롤(라디오 그룹)로 포커스가 이동한다', async () => {
    const capturedBodies: unknown[] = [];
    server.use(captureSubmit(capturedBodies));

    const user = userEvent.setup();
    renderForm({ questionItems: MIXED_QUESTION_ITEMS });

    await user.click(screen.getByRole('button', { name: '제출' }));
    expect(await screen.findAllByRole('alert')).toHaveLength(2);

    // 주관식을 채우면 그 질문의 에러만 해제된다.
    await user.type(screen.getByRole('textbox', { name: /지원 동기/ }), '열정');
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '제출' }));

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(capturedBodies).toHaveLength(0);
    // 선택형 위반은 radiogroup 컨테이너(tabIndex=-1)로 포커스를 옮긴다.
    expect(document.activeElement).toBe(
      screen.getByRole('radiogroup', { name: /주 활동 요일/ }),
    );
  });

  it('선택 질문은 비워도 제출되고 payload 는 answerItems 형태다', async () => {
    const capturedBodies: unknown[] = [];
    server.use(captureSubmit(capturedBodies, 777));

    const user = userEvent.setup();
    renderForm({ questionItems: MIXED_QUESTION_ITEMS });

    await user.type(screen.getByRole('textbox', { name: /지원 동기/ }), '열정');
    await user.click(screen.getByRole('radio', { name: '월요일' }));
    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() => expect(capturedBodies).toHaveLength(1));
    expect(capturedBodies[0]).toEqual({
      answerItems: [
        { questionId: TEXT_QUESTION_ID, values: ['열정'] },
        { questionId: SINGLE_QUESTION_ID, values: [SINGLE_CHOICE_MONDAY_ID] },
        { questionId: MULTI_QUESTION_ID, values: [] },
      ],
    });
  });

  it('복수 선택은 여러 개를 고르면 선택지 정의 순서대로 values 에 모두 담긴다', async () => {
    const capturedBodies: unknown[] = [];
    server.use(captureSubmit(capturedBodies));

    const user = userEvent.setup();
    renderForm({ questionItems: MIXED_QUESTION_ITEMS });

    await user.type(screen.getByRole('textbox', { name: /지원 동기/ }), '열정');
    await user.click(screen.getByRole('radio', { name: '월요일' }));
    // 정의 역순으로 클릭해도 values 는 선택지 정의 순서로 정규화된다(BE 는 중복·순서 무관하나 결정성 확보).
    await user.click(screen.getByRole('checkbox', { name: '백엔드' }));
    await user.click(screen.getByRole('checkbox', { name: '프론트엔드' }));
    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() => expect(capturedBodies).toHaveLength(1));
    expect(capturedBodies[0]).toEqual({
      answerItems: [
        { questionId: TEXT_QUESTION_ID, values: ['열정'] },
        { questionId: SINGLE_QUESTION_ID, values: [SINGLE_CHOICE_MONDAY_ID] },
        { questionId: MULTI_QUESTION_ID, values: [MULTI_CHOICE_FRONTEND_ID, MULTI_CHOICE_BACKEND_ID] },
      ],
    });
  });

  it('복수 선택을 해제하면 values 에서 빠진다', async () => {
    const capturedBodies: unknown[] = [];
    server.use(captureSubmit(capturedBodies));

    const user = userEvent.setup();
    renderForm({ questionItems: MIXED_QUESTION_ITEMS });

    await user.type(screen.getByRole('textbox', { name: /지원 동기/ }), '열정');
    await user.click(screen.getByRole('radio', { name: '월요일' }));
    await user.click(screen.getByRole('checkbox', { name: '프론트엔드' }));
    await user.click(screen.getByRole('checkbox', { name: '백엔드' }));
    await user.click(screen.getByRole('checkbox', { name: '프론트엔드' }));
    expect(screen.getByRole('checkbox', { name: '프론트엔드' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() => expect(capturedBodies).toHaveLength(1));
    expect(capturedBodies[0]).toEqual({
      answerItems: [
        { questionId: TEXT_QUESTION_ID, values: ['열정'] },
        { questionId: SINGLE_QUESTION_ID, values: [SINGLE_CHOICE_MONDAY_ID] },
        { questionId: MULTI_QUESTION_ID, values: [MULTI_CHOICE_BACKEND_ID] },
      ],
    });
  });

  it(
    '임시저장은 questionId 와 values 로 저장된다',
    async () => {
      const draftBodies: unknown[] = [];
      server.use(
        http.put(`*/recruitments/${RECRUITMENT_ID}/draft`, async ({ request }) => {
          draftBodies.push(await request.json());
          return HttpResponse.json({ ok: true, data: null, message: null });
        }),
      );

      const user = userEvent.setup();
      renderForm({ questionItems: MIXED_QUESTION_ITEMS });

      await user.type(screen.getByRole('textbox', { name: /지원 동기/ }), '열정');
      await user.click(screen.getByRole('checkbox', { name: '백엔드' }));

      // useAutosaveDraft 의 2초 debounce 이후 마지막 상태가 PUT 된다.
      await waitFor(
        () =>
          expect(draftBodies.at(-1)).toEqual({
            answers: [
              { questionId: TEXT_QUESTION_ID, values: ['열정'] },
              { questionId: SINGLE_QUESTION_ID, values: [] },
              { questionId: MULTI_QUESTION_ID, values: [MULTI_CHOICE_BACKEND_ID] },
            ],
          }),
        { timeout: 6000 },
      );
    },
    10000,
  );
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

// 재마운트 회귀 테스트만 QueryClient 를 공유한다(실제 앱의 루트 QueryClient 가 SPA 네비게이션
// 내내 유지되는 상황 재현). 나머지 테스트는 매 렌더마다 새 인스턴스로 격리된 상태에서 돈다.
function renderApplyPage(queryClient: QueryClient = makeQueryClient()) {
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

  it('재진입 시 직전 판정 캐시로 지원 폼을 먼저 그리지 않는다', async () => {
    // 루트 QueryClient 는 SPA 네비게이션 내내 살아 있으므로, 캐시가 남아 있으면
    // 재마운트 시 status 가 'success' 라 isLoading=false → 로딩 게이트가 백그라운드
    // refetch 를 기다리지 않고 통과해 버린다. gcTime:0 이 이 경로를 막는다.
    const sharedQueryClient = makeQueryClient();

    // 1) 적격 상태로 첫 진입 — 폼이 뜨고 '적격' 판정이 캐시에 남는다.
    const firstVisit = renderApplyPage(sharedQueryClient);
    expect(await screen.findByRole('button', { name: '제출' })).toBeInTheDocument();
    firstVisit.unmount();

    // gcTime 만료는 setTimeout 으로 스케줄되므로 매크로태스크 한 틱을 흘려보낸다.
    // 실제 라우트 이동도 언마운트와 재마운트가 같은 동기 구간에서 일어나지 않으므로 이 편이 실제에 가깝다.
    // (gcTime 이 기본값 5분이면 이 틱으로는 캐시가 사라지지 않아 아래 단언이 그대로 깨진다.)
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 2) 이탈한 사이 모집이 마감돼 부적격으로 바뀐 상태에서 재진입.
    server.use(mockEligibilityHandler(400, '마감된 모집 공고에는 지원할 수 없습니다.'));
    renderApplyPage(sharedQueryClient);

    // 캐시된 '적격' 판정으로 지원 폼이 한 프레임이라도 그려지면 사용자가 입력을 시작해 버린다.
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument();
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();

    // 재확인 결과가 도착하면 차단 패널로 확정된다 — 그 사이에도 폼은 등장하지 않는다.
    expect(
      await screen.findByText('마감된 모집 공고에는 지원할 수 없습니다.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument();
  });
});

describe('ApplyPage — 임시저장 시드', () => {
  it('저장된 임시저장에 없는 선택지 id 는 시드에서 걸러진다', async () => {
    const capturedBodies: unknown[] = [];
    server.use(
      mockRecruitmentDetailHandler(makeRecruitment({ questionItems: MIXED_QUESTION_ITEMS })),
      http.get(`*/recruitments/${RECRUITMENT_ID}/draft`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            exists: true,
            answers: [
              // 주관식은 첫 값만 살아남는다.
              { questionId: TEXT_QUESTION_ID, values: ['저장된 답', '버려질 두 번째 값'] },
              { questionId: SINGLE_QUESTION_ID, values: [SINGLE_CHOICE_TUESDAY_ID] },
              // 임시저장 이후 삭제된 선택지 id 는 제출 시 400 이 되므로 시드 단계에서 걸러야 한다.
              { questionId: MULTI_QUESTION_ID, values: [MULTI_CHOICE_FRONTEND_ID, 'deleted-choice-id'] },
            ],
            updatedAt: '2026-01-01T09:00:00',
          },
          message: null,
        }),
      ),
      captureSubmit(capturedBodies, 321),
    );

    const user = userEvent.setup();
    renderApplyPage();

    const textarea = await screen.findByRole('textbox', { name: /지원 동기/ });
    expect(textarea).toHaveValue('저장된 답');
    expect(screen.getByRole('radio', { name: '화요일' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '월요일' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '프론트엔드' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '백엔드' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() => expect(capturedBodies).toHaveLength(1));
    expect(capturedBodies[0]).toEqual({
      answerItems: [
        { questionId: TEXT_QUESTION_ID, values: ['저장된 답'] },
        { questionId: SINGLE_QUESTION_ID, values: [SINGLE_CHOICE_TUESDAY_ID] },
        { questionId: MULTI_QUESTION_ID, values: [MULTI_CHOICE_FRONTEND_ID] },
      ],
    });
  });

  it('단일 선택 임시저장에 유효한 선택지가 2개 있어도 첫 하나만 시드된다', async () => {
    const capturedBodies: unknown[] = [];
    server.use(
      mockRecruitmentDetailHandler(makeRecruitment({ questionItems: MIXED_QUESTION_ITEMS })),
      http.get(`*/recruitments/${RECRUITMENT_ID}/draft`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            exists: true,
            answers: [
              { questionId: TEXT_QUESTION_ID, values: ['저장된 답'] },
              // 단일 선택인데 값이 2개 — 그대로 시드하면 제출 시 백엔드가 400 으로 막는다.
              { questionId: SINGLE_QUESTION_ID, values: [SINGLE_CHOICE_MONDAY_ID, SINGLE_CHOICE_TUESDAY_ID] },
            ],
            updatedAt: '2026-01-01T09:00:00',
          },
          message: null,
        }),
      ),
      captureSubmit(capturedBodies, 654),
    );

    const user = userEvent.setup();
    renderApplyPage();

    expect(await screen.findByRole('radio', { name: '월요일' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '화요일' })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() => expect(capturedBodies).toHaveLength(1));
    expect(capturedBodies[0]).toEqual({
      answerItems: [
        { questionId: TEXT_QUESTION_ID, values: ['저장된 답'] },
        { questionId: SINGLE_QUESTION_ID, values: [SINGLE_CHOICE_MONDAY_ID] },
        { questionId: MULTI_QUESTION_ID, values: [] },
      ],
    });
  });
});
