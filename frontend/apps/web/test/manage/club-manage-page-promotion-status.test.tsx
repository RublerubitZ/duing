import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { delay, http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys, shouldRetryQuery } from '@duing/hooks';
import type { LatestPromotionRequest } from '@duing/types';

// 대시보드 카드는 각자 여러 API 를 부른다 — 이 파일은 헤더의 홍보 요청 상태만 본다.
vi.mock('@/app/manage/_components/dashboard/DashboardCardGrid', () => ({
  DashboardCardGrid: () => null,
}));
// 머리말 보조 줄도 업무 큐 API 를 여러 개 부른다 — 이 파일은 홍보 요청 상태만 본다.
vi.mock('@/app/manage/_components/dashboard/DashboardHeadline', () => ({
  DashboardHeadline: () => null,
}));

import ClubManagePage from '@/app/manage/clubs/[clubId]/page';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const CLUB_ID = 7;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const latestQueryKey = clubQueryKeys.latestPromotionRequest(CLUB_ID);

// 처리 시각 기준 14일(절대시각) 경계 — 2026-10-07T03:00Z + 14×24h = 2026-10-21T03:00Z.
const HANDLED_AT = '2026-10-07T03:00:00Z';
const JUST_BEFORE_14_DAYS = new Date('2026-10-21T02:59:59.999Z');
const AT_14_DAYS = new Date('2026-10-21T03:00:00Z');

function latestRequest(overrides: Partial<LatestPromotionRequest> = {}): LatestPromotionRequest {
  return {
    requestId: 3,
    status: 'PENDING',
    title: '가을 정기 공연 홍보',
    actionNote: null,
    // KST 자정 직후 — UTC 날짜(10.20)를 그대로 쓰면 하루 어긋난다.
    createdAt: '2026-10-20T15:30:00Z',
    handledAt: null,
    ...overrides,
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

function setupHandlers(latestResponse: () => Response | Promise<Response>) {
  let latestRequestCount = 0;
  server.use(
    http.get('*/leader/clubs/me/managed', () =>
      HttpResponse.json({
        ok: true,
        message: null,
        data: [
          {
            clubId: CLUB_ID,
            clubName: '두잉',
            logoUrl: null,
            myRole: 'LEADER',
            centralClub: false,
            activeRecruitmentCount: 0,
          },
        ],
      }),
    ),
    http.get(`*/clubs/${CLUB_ID}/promotion-requests/latest`, () => {
      latestRequestCount += 1;
      return latestResponse();
    }),
  );
  return { latestRequestCount: () => latestRequestCount };
}

const latestJson = (data: LatestPromotionRequest | null) => () =>
  HttpResponse.json({ ok: true, message: null, data });

function renderPage() {
  // 앱의 전역 재시도 정책(providers.tsx)으로 돌린다 — 대기 없이 재시도하게 해 재시도가 나가면 바로 드러나게 한다.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 }, mutations: { retry: false } },
  });
  // React 19 use(thenable) 가 동기적으로 값을 꺼내가도록 status/value 를 미리 태깅한다(members-page 테스트와 같은 패턴).
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ClubManagePage params={params} />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
  return { queryClient };
}

async function waitForLatestStatus(queryClient: QueryClient, status: 'success' | 'error') {
  await waitFor(() => expect(queryClient.getQueryState(latestQueryKey)?.status).toBe(status));
}

const promotionButton = () => screen.getByRole('button', { name: '홍보 요청' });

// 대기 중 잠금은 disabled 가 아니라 aria-disabled 다 — 활성 판정은 둘 다 없는지로 본다.
function expectPromotionButtonActive() {
  expect(promotionButton()).toBeEnabled();
  expect(promotionButton()).not.toHaveAttribute('aria-disabled');
}

describe('운영 홈 — 최근 홍보 요청 상태 배지', () => {
  it('검토 대기 중이면 KST 제출일을 붙인 배지를 보이고, 버튼은 aria-disabled 로 잠그며 배지를 설명으로 가리킨다', async () => {
    setupHandlers(latestJson(latestRequest({ status: 'PENDING' })));
    renderPage();

    expect(await screen.findByText('검토 대기 중 · 2026.10.21 제출')).toBeInTheDocument();
    expect(promotionButton()).toHaveAttribute('aria-disabled', 'true');
    expect(promotionButton()).toHaveAccessibleDescription('검토 대기 중 · 2026.10.21 제출');
  });

  it('검토 대기 중인 버튼은 Tab 으로 닿지만 눌러도 모달을 열지 않는다', async () => {
    setupHandlers(latestJson(latestRequest({ status: 'PENDING' })));
    renderPage();
    await screen.findByText('검토 대기 중 · 2026.10.21 제출');

    // disabled 였다면 Tab 순서에서 빠져 설명이 들리지 않는다.
    expect(promotionButton()).toBeEnabled();
    expect(promotionButton()).not.toHaveAttribute('tabindex');
    promotionButton().focus();
    expect(promotionButton()).toHaveFocus();

    await userEvent.click(promotionButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('수락된 지 14일이 안 됐으면 "수락됨" 배지를 보이고 버튼은 활성이다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(JUST_BEFORE_14_DAYS);
    setupHandlers(latestJson(latestRequest({ status: 'ACCEPTED', handledAt: HANDLED_AT })));
    renderPage();

    expect(await screen.findByText('수락됨')).toBeInTheDocument();
    expectPromotionButtonActive();
  });

  it('거절된 지 14일이 안 됐으면 "거절됨" 배지를 보이고 버튼은 활성이다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(JUST_BEFORE_14_DAYS);
    setupHandlers(latestJson(latestRequest({ status: 'REJECTED', handledAt: HANDLED_AT })));
    renderPage();

    expect(await screen.findByText('거절됨')).toBeInTheDocument();
    expectPromotionButtonActive();
  });

  it.each(['ACCEPTED', 'REJECTED'] as const)(
    '%s 처리 뒤 정확히 14일이 되면 배지가 사라진다(미만일 때만 보임)',
    async (status) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(AT_14_DAYS);
      setupHandlers(latestJson(latestRequest({ status, handledAt: HANDLED_AT })));
      const { queryClient } = renderPage();

      await waitForLatestStatus(queryClient, 'success');
      expect(screen.queryByText('수락됨')).not.toBeInTheDocument();
      expect(screen.queryByText('거절됨')).not.toBeInTheDocument();
      expectPromotionButtonActive();
    },
  );

  it('요청한 적이 없으면 배지 없이 버튼이 활성이다', async () => {
    const { latestRequestCount } = setupHandlers(latestJson(null));
    const { queryClient } = renderPage();

    await waitForLatestStatus(queryClient, 'success');
    expect(latestRequestCount()).toBe(1);
    expect(screen.queryByText(/검토 대기 중/)).not.toBeInTheDocument();
    expectPromotionButtonActive();
  });

  it('lg 미만(모바일·사이드바가 붙는 md 구간)에서는 배지를 헤더 아래 줄로 내리고 lg 이상에서는 버튼 옆에 둔다', async () => {
    setupHandlers(latestJson(latestRequest({ status: 'PENDING' })));
    renderPage();

    const badgeRow = (await screen.findByText('검토 대기 중 · 2026.10.21 제출')).parentElement;
    expect(badgeRow).toHaveClass('order-last', 'basis-full', 'lg:order-none', 'lg:basis-auto');
  });

  it('모달을 열면 최근 요청을 카드로 넘겨 보여 준다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(JUST_BEFORE_14_DAYS);
    setupHandlers(
      latestJson(latestRequest({ status: 'REJECTED', handledAt: HANDLED_AT, actionNote: '이번 달 배너가 이미 찼어요.' })),
    );
    renderPage();
    await screen.findByText('거절됨');

    await userEvent.click(promotionButton());

    const card = within(await screen.findByRole('dialog')).getByRole('region', { name: '최근 홍보 요청' });
    expect(within(card).getByText('가을 정기 공연 홍보')).toBeInTheDocument();
    expect(within(card).getByText('이번 달 배너가 이미 찼어요.')).toBeInTheDocument();
  });
});

describe('운영 홈 — 최근 홍보 요청 조회 실패는 지금 화면 그대로(fail-open)', () => {
  it('API 가 없으면(404) 한 번만 묻고 배지 없이 버튼을 활성으로 둔다', async () => {
    const { latestRequestCount } = setupHandlers(() =>
      HttpResponse.json({ ok: false, message: '찾을 수 없습니다.', data: null }, { status: 404 }),
    );
    const { queryClient } = renderPage();

    await waitForLatestStatus(queryClient, 'error');
    expect(latestRequestCount()).toBe(1);
    expectPromotionButtonActive();
    expect(promotionButton()).not.toHaveAttribute('aria-describedby');
  });

  it('서버 오류(500)면 전역 정책대로 한 번 다시 묻고 배지 없이 버튼을 활성으로 둔다', async () => {
    const { latestRequestCount } = setupHandlers(() =>
      HttpResponse.json({ ok: false, message: '서버 오류', data: null }, { status: 500 }),
    );
    const { queryClient } = renderPage();

    await waitForLatestStatus(queryClient, 'error');
    expect(latestRequestCount()).toBe(2);
    expectPromotionButtonActive();
    expect(promotionButton()).not.toHaveAttribute('aria-describedby');
  });

  it('응답을 기다리는 동안에는 배지 없이 버튼을 활성으로 둔다', async () => {
    const { latestRequestCount } = setupHandlers(async () => {
      await delay('infinite');
      return HttpResponse.json({ ok: true, message: null, data: latestRequest({ status: 'PENDING' }) });
    });
    renderPage();

    await waitFor(() => expect(latestRequestCount()).toBe(1));
    expect(screen.queryByText(/검토 대기 중/)).not.toBeInTheDocument();
    expectPromotionButtonActive();
  });
});
