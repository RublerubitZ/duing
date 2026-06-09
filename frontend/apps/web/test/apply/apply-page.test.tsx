import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
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

const RECRUITMENT_ID = 42;
const server = setupServer();
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

beforeEach(() => {
  window.sessionStorage.clear();
});

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

function mockApplicantSlots(slots: Array<{ slotId: number; startTime: string; endTime: string; capacity: number }>) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}/applicant-interview-slots`, () =>
    HttpResponse.json({ ok: true, data: slots, message: null }),
  );
}

function mockSubmitApplication(applicationId = 999) {
  return http.post(`*/recruitments/${RECRUITMENT_ID}/applications`, () =>
    HttpResponse.json({ ok: true, data: applicationId, message: null }),
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

const FUTURE_DEADLINE = '2099-12-31T23:59:00';
const PAST_DEADLINE = '2000-01-01T00:00:00';

const SAMPLE_SLOTS = [
  { slotId: 11, startTime: '2099-06-18T18:00:00', endTime: '2099-06-18T18:30:00', capacity: 2 },
  { slotId: 12, startTime: '2099-06-18T18:30:00', endTime: '2099-06-18T19:00:00', capacity: 2 },
];

describe('ApplyForm — 2-Step UI (PR-FE4)', () => {
  it('useInterview=false 면 다음 버튼이 없고 제출 버튼이 바로 노출된다', () => {
    renderForm({ useInterview: false });

    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '제출' })).toBeInTheDocument();
  });

  it('useInterview=true 면 Step 1 다음 클릭 시 Step 2 가 노출된다', async () => {
    server.use(mockApplicantSlots(SAMPLE_SLOTS));

    const user = userEvent.setup();
    renderForm({ useInterview: true, interviewAvailabilityDeadline: FUTURE_DEADLINE });

    // Step 1: 답변 textarea 가 보인다
    expect(screen.getByLabelText(/지원 동기/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다음' }));

    // Step 2: 슬롯 picker 가 보인다
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '면접 가능시간 선택' })).toBeInTheDocument(),
    );
    // 슬롯 chip 2개
    await waitFor(() =>
      expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(2),
    );
    expect(screen.getByRole('button', { name: '제출' })).toBeInTheDocument();
  });

  it('Step 2 에서 슬롯 0개 선택 시 제출 버튼이 disabled 다', async () => {
    server.use(mockApplicantSlots(SAMPLE_SLOTS));

    const user = userEvent.setup();
    renderForm({ useInterview: true, interviewAvailabilityDeadline: FUTURE_DEADLINE });
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('heading', { name: '면접 가능시간 선택' });

    expect(screen.getByRole('button', { name: '제출' })).toBeDisabled();
  });

  it('deadline 이 과거이면 picker 가 disabled 되고 안내가 보인다', async () => {
    server.use(mockApplicantSlots(SAMPLE_SLOTS));

    const user = userEvent.setup();
    renderForm({ useInterview: true, interviewAvailabilityDeadline: PAST_DEADLINE });
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('heading', { name: '면접 가능시간 선택' });

    expect(screen.getByRole('alert')).toHaveTextContent(/면접 가능시간 제출 기간이 종료/);
    // 슬롯이 로드된 뒤 chip 검사
    await waitFor(() => {
      const groups = screen.queryAllByRole('group');
      if (groups.length === 0) throw new Error('no slot group');
      const firstGroup = groups[0];
      if (!firstGroup) throw new Error('no group');
      const chip = firstGroup.querySelector('button[aria-pressed]');
      if (!chip) throw new Error('no chip');
    });
    const groups = screen.getAllByRole('group');
    const firstGroup = groups[0];
    if (!firstGroup) throw new Error('no group');
    const chip = firstGroup.querySelector('button[aria-pressed]');
    expect(chip).toBeDisabled();
  });

  it('Step 1 → 2 → 1 이동 시 답변·선택이 보존된다', async () => {
    server.use(mockApplicantSlots(SAMPLE_SLOTS));

    const user = userEvent.setup();
    renderForm({ useInterview: true, interviewAvailabilityDeadline: FUTURE_DEADLINE });

    // Step 1: 답변 입력
    const textarea = screen.getByLabelText(/지원 동기/);
    await user.type(textarea, '열정');

    // Step 2 로 이동
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('heading', { name: '면접 가능시간 선택' });
    // 슬롯 chip 만 골라 첫 chip 선택
    await waitFor(() => {
      const groups = screen.getAllByRole('group');
      const firstGroup = groups[0];
      if (!firstGroup) throw new Error('no group yet');
      const chip = firstGroup.querySelector('button[aria-pressed]');
      if (!chip) throw new Error('no chip yet');
    });
    const groups = screen.getAllByRole('group');
    const firstGroup = groups[0];
    if (!firstGroup) throw new Error('no group');
    const firstChip = firstGroup.querySelector('button[aria-pressed]');
    if (!firstChip) throw new Error('no chip');
    await user.click(firstChip);

    // Step 1 로 복귀
    await user.click(screen.getByRole('button', { name: '이전' }));
    const restoredTextarea = await screen.findByLabelText(/지원 동기/);
    expect(restoredTextarea).toHaveValue('열정');

    // 다시 Step 2 — 선택이 복원돼 있는지
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByRole('heading', { name: '면접 가능시간 선택' });
    const restoredPressed = await screen.findAllByRole('button', { pressed: true });
    expect(restoredPressed).toHaveLength(1);
  });

  it('제출 성공 시 me/applications/[id] 로 navigate 하고 sessionStorage 가 비워진다', async () => {
    server.use(mockApplicantSlots(SAMPLE_SLOTS), mockSubmitApplication(555));

    const user = userEvent.setup();
    renderForm({ useInterview: true, interviewAvailabilityDeadline: FUTURE_DEADLINE });
    await user.type(screen.getByLabelText(/지원 동기/), '열정');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => {
      const groups = screen.getAllByRole('group');
      const firstGroup = groups[0];
      if (!firstGroup) throw new Error('no group');
      const chip = firstGroup.querySelector('button[aria-pressed]');
      if (!chip) throw new Error('no chip');
    });
    const groupsForSubmit = screen.getAllByRole('group');
    const firstGroupForSubmit = groupsForSubmit[0];
    if (!firstGroupForSubmit) throw new Error('no group');
    const firstChipForSubmit = firstGroupForSubmit.querySelector('button[aria-pressed]');
    if (!firstChipForSubmit) throw new Error('no chip');
    await user.click(firstChipForSubmit);

    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalled());
    const firstCall = mockRouterPush.mock.calls[0];
    if (!firstCall) throw new Error('expected push call');
    const pushArg = firstCall[0];
    expect(typeof pushArg === 'string' && pushArg.includes('/me/applications/555')).toBe(true);
    expect(window.sessionStorage.getItem(`apply:${RECRUITMENT_ID}:slots`)).toBeNull();
  });

  it('slotsQuery 가 409 에러를 반환하면 에러 alert 가 노출된다 (Issue 5)', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/applicant-interview-slots`, () =>
        HttpResponse.json(
          {
            ok: false,
            data: null,
            message: '모집이 종료되어 더 이상 면접 슬롯을 조회할 수 없습니다.',
          },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderForm({ useInterview: true, interviewAvailabilityDeadline: FUTURE_DEADLINE });
    await user.click(screen.getByRole('button', { name: '다음' }));

    await screen.findByRole('heading', { name: '면접 가능시간 선택' });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/모집이 종료되어/),
    );
    // 슬롯 picker 가 렌더되지 않아야 한다.
    expect(screen.queryAllByRole('group')).toHaveLength(0);
  });

  it('운영진이 슬롯을 등록하지 않은 경우 (200 빈 배열) 별도 안내가 노출된다 (Issue 5)', async () => {
    server.use(mockApplicantSlots([]));

    const user = userEvent.setup();
    renderForm({ useInterview: true, interviewAvailabilityDeadline: FUTURE_DEADLINE });
    await user.click(screen.getByRole('button', { name: '다음' }));

    await screen.findByRole('heading', { name: '면접 가능시간 선택' });
    await waitFor(() =>
      expect(
        screen.getByText(/운영진이 아직 면접 슬롯을 등록하지 않았습니다/),
      ).toBeInTheDocument(),
    );
  });

  it('409 AVAILABILITY_PERIOD_CLOSED 응답 시 에러 alert 가 노출된다', async () => {
    server.use(
      mockApplicantSlots(SAMPLE_SLOTS),
      http.post(`*/recruitments/${RECRUITMENT_ID}/applications`, () =>
        HttpResponse.json(
          { ok: false, data: null, message: '면접 가능시간 제출 기간이 마감되었습니다.' },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderForm({ useInterview: true, interviewAvailabilityDeadline: FUTURE_DEADLINE });
    await user.type(screen.getByLabelText(/지원 동기/), '열정');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => {
      const groups = screen.getAllByRole('group');
      const firstGroup = groups[0];
      if (!firstGroup) throw new Error('no group');
      const chip = firstGroup.querySelector('button[aria-pressed]');
      if (!chip) throw new Error('no chip');
    });
    const groups409 = screen.getAllByRole('group');
    const firstGroup409 = groups409[0];
    if (!firstGroup409) throw new Error('no group');
    const firstChip409 = firstGroup409.querySelector('button[aria-pressed]');
    if (!firstChip409) throw new Error('no chip');
    await user.click(firstChip409);
    await user.click(screen.getByRole('button', { name: '제출' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/면접 가능시간 제출 기간이 마감/),
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
