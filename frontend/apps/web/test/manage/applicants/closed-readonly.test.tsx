import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { ApplicationStatus, RecruitmentStatus } from '@duing/types';

// 스펙 §6 — 마감(raw CLOSED) 모집은 최종 결과 확정만 허용되는 아카이브다.
// 게이트는 raw status 단일식이라 "마감일은 지났지만 수동 마감 전(OPEN)" 모집은 심사 중이므로 전 기능을 유지하고,
// status 를 아직 못 받은 창(로딩·조회 실패)에서는 fail-open — 진짜 방어선은 BE 409(RECRUITMENT_CLOSED).

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/_lib/useGuardedRouter', () => ({
  useGuardedRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import ApplicantsPage from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/page';
import { ApplicantDetailPage } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantDetailPage';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;
const APPLICATION_ID = 100;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

function recruitmentHandler(status: RecruitmentStatus, useInterview = false) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
    json({
      id: RECRUITMENT_ID,
      clubId: CLUB_ID,
      clubName: '테스트 동아리',
      title: '테스트 모집',
      startDate: '2026-03-02',
      // 마감일은 과거 — displayStatus 가 아니라 raw status 로 갈리는지 보기 위한 조건.
      endDate: '2026-03-16',
      capacity: 10,
      status,
      displayStatus: 'CLOSED',
      effectivelyOpen: false,
      applicationMode: 'SELF',
      externalFormUrl: null,
      useInterview,
      targetRole: 'MEMBER',
      closedAt: status === 'CLOSED' ? '2026-03-16T09:00:00Z' : null,
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

/** 모집 상세 조회가 실패해 status 를 확인하지 못하는 창 — fail-open 이 유지되어야 한다. */
const recruitmentErrorHandler = http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
  HttpResponse.json({ ok: false, message: '일시적인 오류', data: null }, { status: 500 }),
);

const applicantsHandler = http.get(`*/leader/recruitments/${RECRUITMENT_ID}/applications`, () =>
  json([
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
  ]),
);

const neighborsHandler = http.get(
  `*/leader/recruitments/${RECRUITMENT_ID}/applications/${APPLICATION_ID}/neighbors`,
  () => json({ prevApplicationId: null, nextApplicationId: null }),
);

function applicantDetailHandler(
  hasMyEvaluation: boolean,
  applicationStatus: ApplicationStatus = 'SUBMITTED',
) {
  return http.get(`*/leader/applications/${APPLICATION_ID}`, () =>
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
      answers: [{ question: '지원 동기', answer: '열심히 하겠습니다' }],
      status: applicationStatus,
      interview: null,
      submittedAt: '2026-03-10T10:00:00',
      myEvaluation: hasMyEvaluation
        ? {
            evaluatorId: 1,
            evaluatorName: '나',
            score: 4,
            memo: '기존 메모',
            createdAt: '2026-03-11T10:00:00',
            updatedAt: '2026-03-11T10:00:00',
          }
        : null,
      otherEvaluations: [],
      statusHistory: [],
      interviewAvailabilities: [],
      assignedSlot: null,
      interviewRound: null,
    }),
  );
}

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
  render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
  return queryClient;
}

describe('지원현황 목록 — 마감 모집 — 최종 결과 확정만', () => {
  it('raw CLOSED 면 마감 배너가 뜨고, 최종 결과를 확정할 수 있도록 선택은 유지된다', async () => {
    server.use(recruitmentHandler('CLOSED'), applicantsHandler);

    renderWithProviders(<ApplicantsPage params={taggedParams()} />);

    expect(
      await screen.findByText('마감된 모집 — 남은 지원서의 최종 결과만 확정할 수 있습니다.'),
    ).toBeInTheDocument();
    expect(await screen.findAllByText('홍길동')).not.toHaveLength(0);
    // 마감 후에도 남은 지원서를 합격·불합격으로 정리할 수 있어야 하므로 선택 수단을 없애지 않는다.
    expect(screen.getAllByRole('checkbox', { name: '홍길동 선택' })).not.toHaveLength(0);
    // 조회 수단(필터·검색)은 그대로 남는다 — 상태는 select 가 아니라 칩으로 거른다.
    expect(screen.getByRole('button', { name: /지원 완료/ })).toBeInTheDocument();
  });

  it('마감일이 지났어도 raw OPEN 이면 배너 없이 선택 체크박스를 유지한다', async () => {
    server.use(recruitmentHandler('OPEN'), applicantsHandler);

    renderWithProviders(<ApplicantsPage params={taggedParams()} />);

    expect(await screen.findAllByText('홍길동')).not.toHaveLength(0);
    expect(
      screen.queryByText('마감된 모집 — 남은 지원서의 최종 결과만 확정할 수 있습니다.'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: '홍길동 선택' })).not.toHaveLength(0);
  });

  // 화면을 열어 둔 채 모집이 마감되는 창(다른 운영진의 신규 모집 등록에 의한 lazy-close 등).
  // 선택은 유지하되, 마감 후 409 가 될 액션(보류·면접 대상)은 바에서 사라져야 한다.
  it('선택해 둔 상태에서 모집이 마감으로 갱신되면 되돌리는 일괄 액션만 사라진다', async () => {
    server.use(recruitmentHandler('OPEN'), applicantsHandler);

    const queryClient = renderWithProviders(<ApplicantsPage params={taggedParams()} />);

    // 표(데스크탑)와 카드(모바일) 두 벌이 함께 렌더되므로 앞의 하나만 누른다.
    const [desktopCheckbox] = await screen.findAllByRole('checkbox', { name: '홍길동 선택' });
    if (desktopCheckbox === undefined) throw new Error('선택 체크박스가 렌더되지 않았다');
    await userEvent.click(desktopCheckbox);
    expect(screen.getByRole('region', { name: '일괄 처리 액션' })).toBeInTheDocument();

    server.use(recruitmentHandler('CLOSED'));
    await act(async () => {
      await queryClient.invalidateQueries();
    });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '보류' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('region', { name: '일괄 처리 액션' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일괄 합격' })).toBeInTheDocument();
    expect(
      screen.getByText('마감된 모집 — 남은 지원서의 최종 결과만 확정할 수 있습니다.'),
    ).toBeInTheDocument();
  });
});

describe('지원자 상세 — 마감 모집 — 최종 결과 확정만', () => {
  it('raw CLOSED 면 최종 결과 버튼만 남고 되돌리는 전이·평가 삭제는 사라진다', async () => {
    server.use(
      recruitmentHandler('CLOSED'),
      applicantDetailHandler(true),
      neighborsHandler,
    );

    renderWithProviders(
      <ApplicantDetailPage
        clubId={CLUB_ID}
        recruitmentId={RECRUITMENT_ID}
        applicationId={APPLICATION_ID}
      />,
    );

    expect(await screen.findAllByText(/최종 결과만 확정할 수 있습니다/)).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: '합격으로' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보류로' })).not.toBeInTheDocument();
    // 평가는 마감 후 허용되는 "최종 결과 확정"에 포함되지 않으므로 계속 막힌다.
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
    // 조회 성격의 표면은 그대로 — 지원서 답변은 계속 보인다.
    expect(screen.getByText('열심히 하겠습니다')).toBeInTheDocument();
  });

  it('모집 status 를 확인하기 전에는 액션을 유지한다 (fail-open)', async () => {
    server.use(recruitmentErrorHandler, applicantDetailHandler(true), neighborsHandler);

    renderWithProviders(
      <ApplicantDetailPage
        clubId={CLUB_ID}
        recruitmentId={RECRUITMENT_ID}
        applicationId={APPLICATION_ID}
      />,
    );

    expect(await screen.findByRole('button', { name: '보류로' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
    expect(
      screen.queryByText(/최종 결과만 확정할 수 있습니다/),
    ).not.toBeInTheDocument();
  });

  // 면접 관리로 가는 링크는 조회 성격이라 마감 후에도 남는다 (스펙 §6).
  it('raw CLOSED 여도 면접 카드의 [면접 관리] 링크는 유지된다', async () => {
    server.use(
      recruitmentHandler('CLOSED', true),
      applicantDetailHandler(true, 'INTERVIEW_PENDING'),
      neighborsHandler,
    );

    renderWithProviders(
      <ApplicantDetailPage
        clubId={CLUB_ID}
        recruitmentId={RECRUITMENT_ID}
        applicationId={APPLICATION_ID}
      />,
    );

    expect(await screen.findByRole('link', { name: '면접 관리' })).toHaveAttribute(
      'href',
      `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/interview`,
    );
  });
});
