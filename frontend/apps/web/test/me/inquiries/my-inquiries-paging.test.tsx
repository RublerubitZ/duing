import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, federationInquiryQueryKeys } from '@duing/hooks';
import type { FederationInquiryStatus, FederationInquirySummary, PageResponse } from '@duing/types';

vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => <nav data-testid="home-nav" /> }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { INQUIRY_STATUS_LABEL } from '@/app/_lib/federationInquiryLabels';
import { MyInquiriesPage } from '@/app/me/inquiries/_pages/MyInquiriesPage';

/**
 * 내 문의 목록(#1756) — 쪽·상태 탭을 옮기는 동안 이전 목록 유지, 실패 시 '다시 시도'·'첫 페이지로', 다시 받는 동안 잠금.
 * 실제 훅 + 실제 ApiClient + MSW(TanStack Query 는 모킹하지 않는다). 훅 목 기반 화면 테스트는 my-inquiries-page.test.tsx.
 */
const BASE = 'http://localhost:8080/api/v1';
const INQUIRIES_URL = `${BASE}/me/federation-inquiries`;
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

const inquiry = (id: number, status: FederationInquiryStatus): FederationInquirySummary => ({
  id,
  title: `문의${id}`,
  status,
  createdAt: '2026-06-01T00:00:00Z',
  answeredAt: null,
});

// 1~12 접수, 13~15 답변완료 — 전체 15건(10건씩 2쪽), 답변완료 3건, 종료 0건.
const serverInquiries: FederationInquirySummary[] = [
  ...Array.from({ length: 12 }, (_, index) => inquiry(index + 1, 'RECEIVED')),
  ...Array.from({ length: 3 }, (_, index) => inquiry(index + 13, 'ANSWERED')),
];
/** 받은 요청의 status·page — 상태 탭이 쪽을 0으로 돌리는지 본다. */
const requestedLists: { status: string | null; page: string | null }[] = [];

function recordRequest(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const requested = { status: searchParams.get('status'), page: searchParams.get('page') };
  requestedLists.push(requested);
  return { status: requested.status, page: Number(requested.page), size: Number(searchParams.get('size')) };
}

function inquiryPageResponse(status: string | null, page: number, size: number) {
  const matching = serverInquiries.filter((summary) => status === null || summary.status === status);
  const inquiryPage: PageResponse<FederationInquirySummary> = {
    content: matching.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: matching.length,
    totalPages: Math.ceil(matching.length / size),
    hasNext: (page + 1) * size < matching.length,
  };
  return HttpResponse.json({ ok: true, data: inquiryPage, message: null });
}

const serverError = () =>
  HttpResponse.json({ ok: false, data: null, message: '일시적인 오류가 발생했습니다.' }, { status: 500 });

type Gate = { opened: Promise<void>; open: () => void };

/** 붙잡아 둔 응답을 테스트가 원하는 때에 연다 — 받는 중 화면을 결과보다 먼저 본다. */
function createGate(): Gate {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

type Hold = { status: string | null; page: number; gate: Gate; outcome: 'ok' | 'fail' };

/** hold 와 같은 상태·쪽 요청만 관문에서 붙잡았다가 열린 뒤 outcome 대로 답한다. 나머지는 바로 답한다. */
function serveInquiries(hold?: Hold) {
  server.use(
    http.get(INQUIRIES_URL, async ({ request }) => {
      const { status, page, size } = recordRequest(request);
      if (hold !== undefined && hold.status === status && hold.page === page) {
        await hold.gate.opened;
        if (hold.outcome === 'fail') return serverError();
      }
      return inquiryPageResponse(status, page, size);
    }),
  );
}

const failInquiries = () => server.use(http.get(INQUIRIES_URL, () => serverError()));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  requestedLists.length = 0;
});
afterAll(() => server.close());

function renderPage(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })): QueryClient {
  render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <MyInquiriesPage />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

const rowCount = () => screen.queryAllByRole('listitem').length;
const pagination = () => screen.queryByRole('navigation', { name: '문의 페이지' });
const failureText = '문의 목록을 불러오지 못했습니다.';

async function goToPage(pageLabel: string) {
  const pageNav = pagination();
  if (pageNav === null) throw new Error('페이지 버튼이 없다');
  await userEvent.click(within(pageNav).getByRole('button', { name: pageLabel }));
}

describe('MyInquiriesPage — 이전 목록 유지·다시 시도·첫 페이지로(#1756)', () => {
  it('처음 가는 쪽으로 옮기는 동안 이전 쪽과 페이지 버튼을 남기고, 누른 번호에 포커스가 남는다', async () => {
    const secondPageGate = createGate();
    serveInquiries({ status: null, page: 1, gate: secondPageGate, outcome: 'ok' });
    renderPage();
    await waitFor(() => expect(rowCount()).toBe(10));

    await goToPage('2');

    const pageNav = screen.getByRole('navigation', { name: '문의 페이지' });
    expect(within(pageNav).getByRole('button', { name: '2' })).toHaveFocus();
    expect(rowCount()).toBe(10);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('status', { name: '문의 목록 불러오는 중' })).not.toBeInTheDocument();

    secondPageGate.open();

    await waitFor(() => expect(rowCount()).toBe(5));
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'false');
  });

  it('첫 조회가 실패하면 문구와 다시 시도를 두고, 다시 받는 동안 같은 버튼만 잠근다', async () => {
    failInquiries();
    renderPage();
    expect(await screen.findByText(failureText)).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '다시 시도' });
    expect(screen.queryByRole('button', { name: '첫 페이지로' })).not.toBeInTheDocument();
    // 결과를 바로 돌려주면 받는 중과 실패 알림이 합쳐져 잠긴 화면이 그려지지 않는다 — 관문으로 붙잡는다.
    const failingRetryGate = createGate();
    serveInquiries({ status: null, page: 0, gate: failingRetryGate, outcome: 'fail' });

    await userEvent.click(retryButton);

    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toHaveFocus();
    expect(screen.getByText(failureText)).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '문의 목록 불러오는 중' })).not.toBeInTheDocument();

    // 가드 — 데이터 없이 받는 중이라 다시 불러도 진행 중 요청으로 합쳐진다(query.ts:707-721). 잠금이 없어도 통과한다.
    const requestsWhileRetrying = requestedLists.length;
    await userEvent.click(retryButton);
    expect(requestedLists.length).toBe(requestsWhileRetrying);

    failingRetryGate.open();

    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 시도'));
    expect(retryButton).not.toHaveAttribute('aria-disabled');
    expect(retryButton).toHaveFocus();

    const succeedingRetryGate = createGate();
    serveInquiries({ status: null, page: 0, gate: succeedingRetryGate, outcome: 'ok' });
    await userEvent.click(retryButton);
    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');

    succeedingRetryGate.open();

    await waitFor(() => expect(rowCount()).toBe(10));
  });

  it('쪽을 옮긴 직후 실패하면 첫 페이지로가 있고, 다시 받는 동안에도 목록·페이지 버튼 대신 실패 안내를 둔다', async () => {
    serveInquiries();
    renderPage();
    await waitFor(() => expect(rowCount()).toBe(10));
    failInquiries();
    await goToPage('2');
    expect(await screen.findByText(failureText)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '첫 페이지로' })).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '다시 시도' });
    const retryGate = createGate();
    serveInquiries({ status: null, page: 1, gate: retryGate, outcome: 'fail' });

    await userEvent.click(retryButton);

    // 다시 받는 동안 data 는 1쪽 자리표시다 — 목록·페이지 버튼을 그리지 않는다.
    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');
    expect(retryButton).toHaveFocus();
    expect(rowCount()).toBe(0);
    expect(pagination()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '첫 페이지로' })).toBeInTheDocument();

    retryGate.open();
    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 시도'));

    serveInquiries();
    await userEvent.click(screen.getByRole('button', { name: '첫 페이지로' }));

    await waitFor(() => expect(rowCount()).toBe(10));
    expect(screen.getByText('문의1')).toBeInTheDocument();
    expect(screen.queryByText(failureText)).not.toBeInTheDocument();
  });

  it('상태 탭을 바꾸는 동안 이전 목록을 흐리게 남기고, 받으면 그 상태 목록을 그린다', async () => {
    const answeredGate = createGate();
    serveInquiries({ status: 'ANSWERED', page: 0, gate: answeredGate, outcome: 'ok' });
    renderPage();
    await waitFor(() => expect(rowCount()).toBe(10));

    await userEvent.click(screen.getByRole('button', { name: INQUIRY_STATUS_LABEL.ANSWERED }));

    expect(rowCount()).toBe(10);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: '다시 불러오는 중' })).not.toBeInTheDocument();

    answeredGate.open();

    await waitFor(() => expect(rowCount()).toBe(3));
    expect(screen.getByText('문의13')).toBeInTheDocument();
  });

  // 가드 — 이전 목록 유지만 넣고 빈 자리표시 규칙을 빼면 받는 동안 "아직 문의 내역이 없어요"가 남는다.
  it('0건이던 상태에서 처음 가는 상태로 바꾸면, 받는 동안 빈 안내 대신 스켈레톤을 둔다', async () => {
    const answeredGate = createGate();
    serveInquiries({ status: 'ANSWERED', page: 0, gate: answeredGate, outcome: 'ok' });
    renderPage();
    await waitFor(() => expect(rowCount()).toBe(10));
    await userEvent.click(screen.getByRole('button', { name: INQUIRY_STATUS_LABEL.CLOSED }));
    expect(await screen.findByText('아직 문의 내역이 없어요.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: INQUIRY_STATUS_LABEL.ANSWERED }));

    expect(screen.getByRole('status', { name: '문의 목록 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByText('아직 문의 내역이 없어요.')).not.toBeInTheDocument();

    answeredGate.open();

    await waitFor(() => expect(rowCount()).toBe(3));
  });

  it('상태 탭을 바꾼 직후 실패하면 첫 페이지로 없이 다시 시도만 두고, 다시 시도로 그 상태 목록을 받는다', async () => {
    serveInquiries();
    renderPage();
    await waitFor(() => expect(rowCount()).toBe(10));
    failInquiries();

    await userEvent.click(screen.getByRole('button', { name: INQUIRY_STATUS_LABEL.ANSWERED }));

    expect(await screen.findByText(failureText)).toBeInTheDocument();
    // 상태 탭은 쪽을 0으로 돌린다 — 돌아갈 쪽이 없다.
    expect(screen.queryByRole('button', { name: '첫 페이지로' })).not.toBeInTheDocument();

    serveInquiries();
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(rowCount()).toBe(3));
    expect(requestedLists.at(-1)).toEqual({ status: 'ANSWERED', page: '0' });
  });

  // 스펙 3.7 마지막 행·9절 5 — 진짜 목록이 있는 다시 받기는 다시 시도 중 판정에 들지 않는다(받아들인 동작을 고정한다).
  it('받은 목록을 다시 받다 실패하면 문구·다시 시도와 페이지 버튼을 두고, 다시 받는 동안 버튼을 잠그지 않는다', async () => {
    serveInquiries();
    const queryClient = renderPage();
    await waitFor(() => expect(rowCount()).toBe(10));
    await goToPage('2');
    await waitFor(() => expect(rowCount()).toBe(5));
    failInquiries();

    await act(() => queryClient.invalidateQueries({ queryKey: federationInquiryQueryKeys.all }));

    expect(await screen.findByText(failureText)).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '다시 시도' });
    expect(pagination()).toBeInTheDocument();
    // 페이지 버튼이 있으니 돌아갈 길을 따로 두지 않는다.
    expect(screen.queryByRole('button', { name: '첫 페이지로' })).not.toBeInTheDocument();
    const retryGate = createGate();
    serveInquiries({ status: null, page: 1, gate: retryGate, outcome: 'ok' });

    await userEvent.click(retryButton);

    // 진짜 data 가 있어 status 가 error 로 남는다 — 문구·버튼은 그대로라 포커스는 남지만 잠기지 않는다.
    expect(retryButton).toHaveAccessibleName('다시 시도');
    expect(retryButton).not.toHaveAttribute('aria-disabled');
    expect(retryButton).toHaveFocus();

    retryGate.open();

    await waitFor(() => expect(rowCount()).toBe(5));
    expect(screen.queryByText(failureText)).not.toBeInTheDocument();
  });

  it('실패했던 쪽으로 다시 옮기면 다시 받는 중이 아니라 이전 쪽을 흐리게 남긴 채 받는다', async () => {
    serveInquiries();
    renderPage();
    await waitFor(() => expect(rowCount()).toBe(10));
    failInquiries();
    await goToPage('2');
    await screen.findByText(failureText);
    serveInquiries();
    await userEvent.click(screen.getByRole('button', { name: '첫 페이지로' }));
    await waitFor(() => expect(rowCount()).toBe(10));
    const secondPageGate = createGate();
    serveInquiries({ status: null, page: 1, gate: secondPageGate, outcome: 'ok' });

    await goToPage('2');

    // 실패 캐시가 남은 키로 옮겨도 키가 바뀌면 기준이 새로 잡힌다 — 판정을 errorUpdateCount 로 바꾸면 여기서 잠긴다.
    expect(screen.queryByRole('button', { name: '다시 불러오는 중' })).not.toBeInTheDocument();
    expect(screen.queryByText(failureText)).not.toBeInTheDocument();
    expect(rowCount()).toBe(10);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(pagination()).toBeInTheDocument();

    secondPageGate.open();

    await waitFor(() => expect(rowCount()).toBe(5));
  });

  // 공통식이 isFetching 이 아니라 fetchStatus 인 이유 — 재시도 대기 뒤 포커스가 없으면 멈추고('paused') 그동안 isFetching 은 거짓이다
  // (retryer.ts:183-186·277, query.ts:945-949). isFetching 으로 되돌리면 멈춘 동안 실패 블록이 내려가 이 테스트가 실패한다.
  it('다시 받다 재시도 대기에서 멈춰도(탭을 가림) 문구와 같은 잠긴 버튼을 둔다', async () => {
    onTestFinished(() => focusManager.setFocused(undefined));
    failInquiries();
    // 이 테스트만 앱처럼 빠른 실패를 1회 다시 시도한다(대기 0). 포커스 복귀로 일제 재조회가 끼지 않게 앱 설정처럼 끈다.
    const queryClient = renderPage(
      new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0, networkMode: 'always', refetchOnWindowFocus: false } } }),
    );
    expect(await screen.findByText(failureText)).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '다시 시도' });

    focusManager.setFocused(false);
    await userEvent.click(retryButton);

    // 첫 시도가 실패하고 재시도 대기(0) 뒤 포커스가 없어 멈춘다 — 받은 목록이 없어 data 도 없다.
    await waitFor(() =>
      expect(
        queryClient.getQueryState(federationInquiryQueryKeys.my({ status: undefined, page: 0, size: 10 }))?.fetchStatus,
      ).toBe('paused'),
    );
    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toHaveFocus();
    expect(screen.getByText(failureText)).toBeInTheDocument();

    serveInquiries();
    act(() => focusManager.setFocused(true));

    await waitFor(() => expect(rowCount()).toBe(10));
  });
});
