import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { ApplicationMode, JoinCodeSummary } from '@duing/types';
import RecruitmentDetailPage from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page';

// 모집 관리 상세의 회원 등록 영역 (스펙 §5·§7·§8·§9) — 코드 관리가 회원 관리 화면에서 이 자리로 옮겨왔다.
// 모드 분기(INTERNAL 무표시 / EXTERNAL 상태 무관 표시)와 안내·경고 문안을 고정한다.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

const FUTURE_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST_ISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const DEDUCTION_NOTICE =
  '가입 요청이 생성되는 즉시 사용 가능 인원이 차감됩니다. 운영진이 가입 요청을 거절하면 자동으로 ' +
  '사용 가능 인원이 복구됩니다. 링크가 외부에 유출될 경우 승인 여부와 관계없이 가입 요청이 생성된 ' +
  '횟수만큼 사용 가능 인원이 일시적으로 감소할 수 있습니다.';

const LEAK_WARNING =
  '⚠️ 가입 코드는 합격자에게만 공유해주세요. 링크가 외부에 유출되면 제3자가 가입 요청을 생성할 수 ' +
  '있으며, 가입 요청이 생성될 때마다 사용 가능 인원이 일시적으로 차감됩니다. 잘못 생성된 가입 요청은 ' +
  '운영진이 거절하면 자동으로 복구됩니다.';

function joinCode(overrides: Partial<JoinCodeSummary> = {}): JoinCodeSummary {
  return {
    joinCodeId: 3,
    code: 'ABCD1234',
    generation: 12,
    maxUses: 30,
    usedCount: 4,
    expiresAt: FUTURE_ISO,
    ...overrides,
  };
}

function recruitmentHandler({
  applicationMode = 'EXTERNAL',
  externalFormUrl = 'https://docs.google.com/forms/d/e/abc/viewform',
  status = 'CLOSED',
}: {
  applicationMode?: ApplicationMode;
  externalFormUrl?: string | null;
  status?: 'OPEN' | 'CLOSED';
} = {}) {
  return http.get(`*/recruitments/${RECRUITMENT_ID}`, () =>
    json({
      id: RECRUITMENT_ID,
      clubId: CLUB_ID,
      clubName: '테스트 동아리',
      title: '테스트 모집',
      startDate: '2099-01-01',
      endDate: '2099-02-01',
      capacity: 10,
      status,
      displayStatus: status === 'CLOSED' ? 'CLOSED' : 'OPEN',
      effectivelyOpen: status === 'OPEN',
      applicationMode,
      externalFormUrl,
      useInterview: false,
      targetRole: 'MEMBER',
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

const statsHandler = http.get(`*/leader/recruitments/${RECRUITMENT_ID}/stats/summary`, () =>
  json({
    total: 0,
    submitted: 0,
    underReview: 0,
    interviewPending: 0,
    accepted: 0,
    rejected: 0,
    capacity: 10,
    ratio: 0,
  }),
);

const clubDetailHandler = (useGeneration = true) =>
  http.get(`*/clubs/${CLUB_ID}`, () => json({ useGeneration }));

const pendingRequestsHandler = (count: number) =>
  http.get(`*/clubs/${CLUB_ID}/join-requests`, () =>
    json(
      Array.from({ length: count }, (_, index) => ({
        joinRequestId: index + 1,
        userName: '김두잉',
        studentId: '20231234',
        major: '컴퓨터공학과',
        code: 'ABCD1234',
        generation: 12,
        status: 'PENDING',
        requestedAt: '2026-08-01T02:00:00Z',
      })),
    ),
  );

const writeText = vi.fn(() => Promise.resolve());

const server = setupServer(statsHandler);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    configurable: true,
    value: { writeText },
  });
});
afterEach(() => {
  server.resetHandlers();
  writeText.mockClear();
  vi.restoreAllMocks();
});
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

  // React 19 use(thenable) 가 동기적으로 값을 꺼내가도록 status/value 를 미리 태깅한다
  // (recruitment-detail-page 테스트와 동일 패턴).
  const paramsValue = { clubId: String(CLUB_ID), recruitmentId: String(RECRUITMENT_ID) };
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

type ExternalSetup = {
  activeCode?: JoinCodeSummary | null;
  useGeneration?: boolean;
  pendingCount?: number;
  status?: 'OPEN' | 'CLOSED';
  externalFormUrl?: string | null;
};

/** 활성 코드 응답을 지정해 EXTERNAL 모집 상세를 띄운다. */
function setupExternal({
  activeCode = null,
  useGeneration = true,
  pendingCount = 0,
  status = 'CLOSED',
  externalFormUrl = 'https://docs.google.com/forms/d/e/abc/viewform',
}: ExternalSetup = {}) {
  server.use(
    recruitmentHandler({ status, externalFormUrl }),
    clubDetailHandler(useGeneration),
    pendingRequestsHandler(pendingCount),
    http.get(`*/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/join-codes/active`, () =>
      json(activeCode),
    ),
  );
}

describe('모집 상세 — 모드별 회원 등록 영역', () => {
  it('자체 폼(INTERNAL) 모집에는 회원 등록 영역과 외부 폼 배지를 일절 표시하지 않는다', async () => {
    server.use(recruitmentHandler({ applicationMode: 'SELF', externalFormUrl: null }));

    renderPage();

    await screen.findByRole('link', { name: /지원자 관리/ });
    expect(screen.queryByRole('heading', { name: '회원 등록' })).not.toBeInTheDocument();
    expect(screen.queryByText('외부 폼 모집')).not.toBeInTheDocument();
    expect(screen.queryByText(DEDUCTION_NOTICE)).not.toBeInTheDocument();
  });

  it('외부 폼 모집이 진행 중(OPEN)이어도 회원 등록 영역을 보여준다', async () => {
    setupExternal({ status: 'OPEN' });

    renderPage();

    expect(await screen.findByRole('heading', { name: '회원 등록' })).toBeInTheDocument();
  });

  it('외부 폼 모집이면 헤더에 "외부 폼 모집" 배지와 플랫폼명을 함께 보여준다', async () => {
    setupExternal();

    renderPage();

    expect(await screen.findByText('외부 폼 모집')).toBeInTheDocument();
    expect(screen.getByText('Google Forms')).toBeInTheDocument();
  });

  it('네이버 폼 주소면 플랫폼명이 Naver Form 이다', async () => {
    setupExternal({ externalFormUrl: 'https://form.naver.com/response/abc123' });

    renderPage();

    expect(await screen.findByText('Naver Form')).toBeInTheDocument();
  });

  it('알 수 없는 호스트면 배지만 남기고 플랫폼명은 표시하지 않는다', async () => {
    setupExternal({ externalFormUrl: 'https://example.com/form' });

    renderPage();

    expect(await screen.findByText('외부 폼 모집')).toBeInTheDocument();
    expect(screen.queryByText('Google Forms')).not.toBeInTheDocument();
    expect(screen.queryByText('Naver Form')).not.toBeInTheDocument();
  });

  it('회원 등록 절차 카드와 차감 안내를 항상 보여준다', async () => {
    setupExternal();

    renderPage();

    expect(await screen.findByText('가입 코드 생성')).toBeInTheDocument();
    expect(screen.getByText('운영진 승인')).toBeInTheDocument();
    expect(screen.getByText(DEDUCTION_NOTICE)).toBeInTheDocument();
  });

  it('가입 요청 관리로 이동하는 링크에 대기 건수 배지를 보여준다', async () => {
    setupExternal({ pendingCount: 3 });

    renderPage();

    const requestsLink = await screen.findByRole('link', { name: /가입 요청 관리/ });
    expect(requestsLink).toHaveAttribute('href', `/manage/clubs/${CLUB_ID}/members/requests`);
    await waitFor(() => expect(within(requestsLink).getByText('3')).toBeInTheDocument());
  });
});

describe('모집 상세 — 가입 코드 생성', () => {
  it('활성 코드가 없으면 생성 폼을 보여주고 만료 기본값은 30일이다', async () => {
    setupExternal();

    renderPage();

    expect(await screen.findByRole('combobox', { name: '유효 기간' })).toHaveValue('30');
    expect(screen.getByRole('spinbutton', { name: '최대 사용 인원' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '기수 (선택)' })).toBeInTheDocument();
  });

  it('기수를 쓰지 않는 동아리에는 기수 입력을 노출하지 않는다', async () => {
    setupExternal({ useGeneration: false });

    renderPage();

    expect(await screen.findByRole('spinbutton', { name: '최대 사용 인원' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: '기수 (선택)' })).not.toBeInTheDocument();
  });

  it('모집 스코프 경로로 입력한 인원·기간·기수를 보내 코드를 만든다', async () => {
    let created: unknown = null;
    setupExternal();
    server.use(
      http.post(`*/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/join-codes`, async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({ ok: true, message: null, data: joinCode() }, { status: 201 });
      }),
    );

    renderPage();

    await userEvent.type(await screen.findByRole('spinbutton', { name: '최대 사용 인원' }), '30');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '유효 기간' }), '7');
    await userEvent.type(screen.getByRole('spinbutton', { name: '기수 (선택)' }), '12');
    await userEvent.click(screen.getByRole('button', { name: '코드 만들기' }));

    await waitFor(() => expect(created).toEqual({ maxUses: 30, expiresInDays: 7, generation: 12 }));
  });

  it('인원이 비어 있으면 요청하지 않고 입력을 안내한다', async () => {
    setupExternal();

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '코드 만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '최대 사용 인원은 1~500 사이로 입력해주세요.',
    );
  });

  it('자체 폼 모집이라 409 가 나면 서버 메시지를 그대로 보여준다', async () => {
    setupExternal();
    server.use(
      http.post(`*/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/join-codes`, () =>
        HttpResponse.json(
          { ok: false, message: '외부 폼 모집에서만 가입 코드를 사용할 수 있습니다.', data: null },
          { status: 409 },
        ),
      ),
    );

    renderPage();

    await userEvent.type(await screen.findByRole('spinbutton', { name: '최대 사용 인원' }), '30');
    await userEvent.click(screen.getByRole('button', { name: '코드 만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '외부 폼 모집에서만 가입 코드를 사용할 수 있습니다.',
    );
  });
});

describe('모집 상세 — 활성 코드 카드', () => {
  it('코드·사용 현황·만료일과 유출 경고를 보여주고 초대 링크를 복사한다', async () => {
    setupExternal({ activeCode: joinCode() });

    renderPage();

    expect(await screen.findByText('ABCD1234')).toBeInTheDocument();
    expect(screen.getByText('4 / 30명')).toBeInTheDocument();
    expect(screen.getByText(LEAK_WARNING)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '초대 링크 복사' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/ABCD1234`);
  });

  it('만료 시각이 지난 코드에는 만료 배지를 보여준다', async () => {
    setupExternal({ activeCode: joinCode({ expiresAt: PAST_ISO }) });

    renderPage();

    expect(await screen.findByText('만료됨')).toBeInTheDocument();
  });

  it('폐기는 확인 모달을 거치고 성공하면 생성 폼으로 돌아간다', async () => {
    let active: JoinCodeSummary | null = joinCode();
    setupExternal();
    server.use(
      http.get(`*/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/join-codes/active`, () =>
        json(active),
      ),
      http.delete(`*/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/join-codes/3`, () => {
        active = null;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '코드 폐기' }));
    const confirm = await screen.findByRole('dialog', { name: '가입 코드를 폐기할까요?' });
    await userEvent.click(within(confirm).getByRole('button', { name: '폐기' }));

    expect(await screen.findByRole('spinbutton', { name: '최대 사용 인원' })).toBeInTheDocument();
  });

  it('폐기가 실패하면 확인 모달을 닫지 않고 모달 안에서 안내한다', async () => {
    setupExternal({ activeCode: joinCode() });
    server.use(
      http.delete(`*/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/join-codes/3`, () =>
        HttpResponse.json({ ok: false, message: '폐기할 수 없습니다.', data: null }, { status: 409 }),
      ),
    );

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '코드 폐기' }));
    const confirm = await screen.findByRole('dialog', { name: '가입 코드를 폐기할까요?' });
    await userEvent.click(within(confirm).getByRole('button', { name: '폐기' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent('폐기할 수 없습니다.');
    expect(screen.getByRole('dialog', { name: '가입 코드를 폐기할까요?' })).toBeInTheDocument();
  });

  it('재생성은 기존 코드가 무효해진다는 확인을 거쳐 생성 폼으로 바뀐다', async () => {
    setupExternal({ activeCode: joinCode() });

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: '코드 재생성' }));
    const confirm = await screen.findByRole('dialog', { name: '코드를 새로 만들까요?' });
    expect(within(confirm).getByText(/기존 코드는 즉시 사용할 수 없게 됩니다/)).toBeInTheDocument();

    await userEvent.click(within(confirm).getByRole('button', { name: '새로 만들기' }));
    expect(await screen.findByRole('spinbutton', { name: '최대 사용 인원' })).toBeInTheDocument();
  });
});
