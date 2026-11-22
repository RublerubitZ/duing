import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { FeeBill, FeeStatus, PageResponse } from '@duing/types';

vi.mock('@/app/_components/toast/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import { BillList } from '@/app/manage/clubs/[clubId]/fees/_components/BillList';

// 청구 목록 조회 실패·빈 페이지 보정·쪽 이동 상태(#1762). API 응답만 msw 로 모킹하고 React Query 는 실제로 돌린다 —
// 자리 채움·다시 받기·무효화 뒤 보정이 캐시 동작에 달려 있다(장부 cashbook-panel-paging.test.tsx 와 같은 틀).
const CLUB_ID = 1;
const API_BASE = 'http://localhost:8080/api/v1';
const BILLS_URL = `${API_BASE}/leader/clubs/${CLUB_ID}/fee-bills`;
const apiClient = createApiClient({ baseUrl: API_BASE });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });
const failure = () => HttpResponse.json({ ok: false, message: '서버 오류', data: null }, { status: 500 });

// 가짜 서버 상태 — beforeEach 에서 비운다.
let serverBills: FeeBill[] = [];
let listRequests: URLSearchParams[] = [];

// 부원 목록은 비워 둔다 — 행은 `부원 #userId` 로 보이고, userId 를 청구 id 와 같게 둬 행을 가른다.
const buildBill = (id: number, status: FeeStatus): FeeBill => ({
  id,
  clubId: CLUB_ID,
  userId: id,
  feePolicyId: 7,
  amount: 10000,
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  status,
  displayStatus: status,
  paidAmount: 0,
  remainingAmount: 10000,
});

/** id 1..count, 모두 납부대기. 최신(id 큰 것)부터 — 1쪽 = id count..count-19, id 1 이 맨 마지막. */
function seedBills(count: number) {
  serverBills = Array.from({ length: count }, (_, index) => buildBill(index + 1, 'PENDING'));
}

// 서버(FeeBillRepositoryImpl.searchClubBills + PageImpl)와 같게 자른다 — 상태는 표기 상태로 거르고, 범위 밖 page 는 content 만 빈다.
function pageOf(query: URLSearchParams): PageResponse<FeeBill> {
  const pageIndex = Number(query.get('page') ?? '0');
  const pageSize = Number(query.get('size') ?? '20');
  const matched = serverBills
    .filter((bill) => !query.has('status') || bill.displayStatus === query.get('status'))
    .sort((left, right) => right.id - left.id);
  return {
    content: matched.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    page: pageIndex,
    size: pageSize,
    totalElements: matched.length,
    totalPages: Math.ceil(matched.length / pageSize),
    hasNext: (pageIndex + 1) * pageSize < matched.length,
  };
}

type ListOverride = { when: (query: URLSearchParams) => boolean; gate?: Promise<void>; fail?: boolean };

/** 목록 핸들러 — override 가 있으면 조건에 맞는 요청만 붙잡거나(gate) 500 으로 답한다. */
function listHandler(override?: ListOverride) {
  return http.get(BILLS_URL, async ({ request }) => {
    const query = new URL(request.url).searchParams;
    listRequests.push(query);
    if (override?.when(query)) {
      await override.gate;
      if (override.fail) return failure();
    }
    return json(pageOf(query));
  });
}

const server = setupServer(
  listHandler(),
  http.delete<{ billId: string }>(`${BILLS_URL}/:billId`, ({ params }) => {
    serverBills = serverBills.map(
      (bill): FeeBill =>
        bill.id === Number(params.billId) ? { ...bill, status: 'CANCELLED', displayStatus: 'CANCELLED' } : bill,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${API_BASE}/clubs/${CLUB_ID}/members`, () => json([])),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  serverBills = [];
  listRequests = [];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** 나중에 건 것이 앞선다(server.use). */
const overrideList = (override: ListOverride) => server.use(listHandler(override));

/** 응답을 붙잡아 두는 게이트(apply-page.test.tsx 전례) — open 을 부를 때까지 핸들러가 기다린다. */
function createGate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

const pageIs = (pageIndex: number) => (query: URLSearchParams) => query.get('page') === String(pageIndex);
const listRequestCount = (pageIndex: number) => listRequests.filter(pageIs(pageIndex)).length;

function renderList(
  initialStatusFilter: FeeStatus | '' = '',
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
): UserEvent {
  const user = userEvent.setup();
  render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <BillList clubId={CLUB_ID} initialStatusFilter={initialStatusFilter} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
  return user;
}

/** 자리 채움 동안 '다음'은 잠겨 있다 — 잠김이 풀린 뒤 누른다. */
async function waitForPagerReady() {
  await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).not.toHaveAttribute('aria-disabled'));
}

async function goToSecondPage(user: UserEvent) {
  await screen.findByText('1 / 2');
  await waitForPagerReady();
  await user.click(screen.getByRole('button', { name: '다음' }));
  await screen.findByText('2 / 2');
}

async function cancelOnlyBillOnPage(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: '취소' }));
  const confirm = screen.getByRole('alertdialog', { name: '청구 취소 확인' });
  await user.click(within(confirm).getByRole('button', { name: '청구 취소' }));
}

describe('청구 목록 — 조회 실패(#1762)', () => {
  it('첫 조회가 실패하면 빈 안내 대신 실패 안내와 다시 시도를 보이고, 1쪽이라 첫 페이지로는 없다', async () => {
    seedBills(3);
    overrideList({ when: pageIs(0), fail: true });
    renderList();

    expect(await screen.findByText('청구 목록을 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toHaveAccessibleDescription('청구 목록을 불러오지 못했어요.');
    expect(screen.queryByText('발행된 청구가 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '첫 페이지로' })).not.toBeInTheDocument();
  });

  it('다시 시도 중에는 실패 안내를 두고 같은 버튼이 다시 불러오는 중으로 잠기며, 다시 실패하면 그 버튼이 다시 시도로 돌아온다', async () => {
    seedBills(3);
    overrideList({ when: pageIs(0), fail: true });
    const user = renderList();
    const retryButton = await screen.findByRole('button', { name: '다시 시도' });

    const gate = createGate();
    overrideList({ when: pageIs(0), gate: gate.opened, fail: true });
    await user.click(retryButton);

    expect(await screen.findByRole('button', { name: '다시 불러오는 중' })).toBe(retryButton);
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toHaveFocus();
    expect(screen.getByText('청구 목록을 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '청구 목록 불러오는 중' })).not.toBeInTheDocument();
    await waitFor(() => expect(listRequestCount(0)).toBe(2));
    // 회귀 가드: 다시 받는 중에 또 눌러도 요청이 늘지 않는다(쿼리 캐시에 data 가 없으면 진행 중 promise 를 돌려준다 — query.ts:714-720).
    await user.click(retryButton);

    gate.open();
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBe(retryButton);
    expect(retryButton).toHaveFocus();
    expect(listRequestCount(0)).toBe(2);
  });

  // 앱은 빠른 실패를 1회 재시도한다(shouldRetryQuery). 재시도 대기 뒤 탭이 가려져 있으면 TanStack 이 재시도를 멈춘다
  // (fetchStatus 'paused' — query-core retryer.ts:183-186 의 canContinue 첫 조건이 focusManager.isFocused(), query.ts:945-949).
  // 이때 isFetching 은 거짓이라, 그것으로 가르면 잠긴 버튼이 '다시 시도'로 풀린다 — fetchStatus 로 가른다.
  it('다시 시도의 재시도 차례에 탭이 가려져 멈춰도(paused) 같은 버튼이 다시 불러오는 중으로 잠겨 있고, 탭이 돌아오면 재시도 결과를 보인다', async () => {
    seedBills(3);
    overrideList({ when: pageIs(0), fail: true });
    // 이 테스트만: 앱처럼 1회 재시도, 대기 없이.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 }, mutations: { retry: false } },
    });
    const user = renderList('', queryClient);
    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    expect(listRequestCount(0)).toBe(2);

    try {
      focusManager.setFocused(false);
      await user.click(retryButton);
      // 다시 시도의 첫 요청이 실패한 뒤 재시도 차례에서 멈춘다 — 가려진 탭이라 다음 요청이 나가지 않는다.
      await waitFor(() =>
        expect(queryClient.getQueryCache().getAll().some((query) => query.state.fetchStatus === 'paused')).toBe(true),
      );
      // 멈춤 알림이 화면에 그려질 틈(알림은 다음 틱에 묶여 나간다).
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(listRequestCount(0)).toBe(3);
      expect(screen.getByRole('button', { name: '다시 불러오는 중' })).toBe(retryButton);
      expect(retryButton).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByText('청구 목록을 불러오지 못했어요.')).toBeInTheDocument();

      server.resetHandlers();
      focusManager.setFocused(true);
      expect(await screen.findByText('총 3건')).toBeInTheDocument();
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it('다시 시도가 성공하면 목록을 보인다', async () => {
    seedBills(3);
    overrideList({ when: pageIs(0), fail: true });
    const user = renderList();
    const retryButton = await screen.findByRole('button', { name: '다시 시도' });

    server.resetHandlers();
    await user.click(retryButton);

    expect(await screen.findByText('총 3건')).toBeInTheDocument();
    expect(screen.queryByText('청구 목록을 불러오지 못했어요.')).not.toBeInTheDocument();
  });

  it('2쪽으로 옮긴 직후 실패하면 첫 페이지로가 생기고, 누르면 1쪽으로 돌아간다', async () => {
    seedBills(25);
    overrideList({ when: pageIs(1), fail: true });
    const user = renderList();
    await screen.findByText('1 / 2');
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(await screen.findByText('청구 목록을 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByText('발행된 청구가 없습니다.')).not.toBeInTheDocument();
    const requestCountBeforeFirstPage = listRequests.length;
    await user.click(screen.getByRole('button', { name: '첫 페이지로' }));

    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    await waitFor(() => expect(listRequests.slice(requestCountBeforeFirstPage).some(pageIs(0))).toBe(true));
  });

  it('2쪽 실패 뒤 다시 받는 동안에는 1쪽 자리 채움 목록·푸터 없이 실패 안내와 첫 페이지로를 두고, 다시 실패하면 같은 버튼이 다시 시도로 돌아온다', async () => {
    seedBills(25);
    overrideList({ when: pageIs(1), fail: true });
    const user = renderList();
    await screen.findByText('1 / 2');
    await user.click(screen.getByRole('button', { name: '다음' }));
    const retryButton = await screen.findByRole('button', { name: '다시 시도' });

    const gate = createGate();
    overrideList({ when: pageIs(1), gate: gate.opened, fail: true });
    await user.click(retryButton);

    // 다시 받는 중 판정에서 자리 채움 항(isPlaceholderData)을 빼면 여기서 1쪽 목록이 다시 그려져 이 버튼이 사라진다.
    expect(await screen.findByRole('button', { name: '다시 불러오는 중' })).toBe(retryButton);
    expect(screen.queryByText('부원 #25')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '청구 목록 페이지' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '첫 페이지로' })).not.toHaveAttribute('aria-disabled');

    gate.open();
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBe(retryButton);
    expect(retryButton).toHaveFocus();
  });

  it('실패한 쪽으로 다시 옮겨 오면 다시 받는 중이 아니라 이전 쪽을 흐리게 두고 푸터를 잠근다', async () => {
    seedBills(25);
    overrideList({ when: pageIs(1), fail: true });
    const user = renderList();
    await screen.findByText('1 / 2');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(await screen.findByRole('button', { name: '첫 페이지로' }));
    await screen.findByText('1 / 2');
    await waitForPagerReady();

    const gate = createGate();
    overrideList({ when: pageIs(1), gate: gate.opened, fail: true });
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByText('부원 #25')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '다음' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('button', { name: '다시 불러오는 중' })).not.toBeInTheDocument();

    gate.open();
    expect(await screen.findByText('청구 목록을 불러오지 못했어요.')).toBeInTheDocument();
  });
});

describe('청구 목록 — 빈 페이지 보정(#1762)', () => {
  // 두 쪽짜리에서는 마지막 유효 쪽이 늘 첫 쪽이라 첫 쪽으로 보내는 보정과 구별되지 않는다 — 세 쪽으로 가른다.
  it('상태 필터 중 마지막 쪽의 마지막 청구를 취소하면 빈 쪽에 남지 않고 마지막 유효 쪽(2쪽)으로 옮긴다', async () => {
    seedBills(41);
    const user = renderList('PENDING');
    await screen.findByText('1 / 3');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('2 / 3');
    await waitForPagerReady();
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('3 / 3');

    await cancelOnlyBillOnPage(user);

    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    expect(screen.queryByText('발행된 청구가 없습니다.')).not.toBeInTheDocument();
  });

  it('다시 받은 결과가 0건이면 0쪽 빈 상태로 돌아간다', async () => {
    seedBills(21);
    // 이 테스트만: 취소하는 순간 나머지도 사라진다(다른 운영진이 다 정리한 상황).
    server.use(
      http.delete(`${BILLS_URL}/:billId`, () => {
        serverBills = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = renderList('PENDING');
    await goToSecondPage(user);
    const requestCountBeforeCancel = listRequests.length;

    await cancelOnlyBillOnPage(user);

    // 빈 상태 문구는 보정 없이 2쪽에 남아도 뜬다 — 취소 뒤 page=0 요청이 나갔는지로 보정을 가른다.
    await waitFor(() => expect(listRequests.slice(requestCountBeforeCancel).some(pageIs(0))).toBe(true));
    expect(await screen.findByText('발행된 청구가 없습니다.')).toBeInTheDocument();
  });

  // 보정 effect 의 isFetching 가드를 지킨다 — 가드를 빼면 옛 빈 캐시(totalPages 1)를 보고 1쪽으로 튕겨 로딩 표시가 안 보인다.
  it('보정으로 떠난 쪽의 옛 빈 캐시로 돌아가 다시 받는 동안 앞 쪽으로 튕기지 않는다', async () => {
    seedBills(21);
    const user = renderList('PENDING');
    await goToSecondPage(user);
    await cancelOnlyBillOnPage(user);
    expect(await screen.findByText('1 / 1')).toBeInTheDocument();

    // 다른 운영진이 청구를 하나 더 발행했다 — 납부대기가 다시 21건(2쪽).
    serverBills = [...serverBills, buildBill(22, 'PENDING')];
    const statusFilter = screen.getByRole('combobox', { name: '청구 상태 필터' });
    await user.selectOptions(statusFilter, '전체');
    expect(await screen.findByText('총 22건')).toBeInTheDocument();
    await user.selectOptions(statusFilter, 'PENDING');
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    await waitForPagerReady();

    // 납부대기 2쪽 키에는 보정 때 받은 옛 응답(content: [], totalPages: 1)이 남아 있다.
    const gate = createGate();
    overrideList({ when: (query) => query.get('status') === 'PENDING' && pageIs(1)(query), gate: gate.opened });
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.getByRole('status', { name: '청구 목록 불러오는 중' })).toBeInTheDocument();

    gate.open();
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
  });
});

describe('청구 목록 — 쪽 이동 중 상태(#1762)', () => {
  it('처음 가는 쪽을 받는 동안 이전 쪽을 흐리게 두고, 누른 다음 버튼에 포커스를 남긴 채 이전·다음을 잠근다', async () => {
    seedBills(41);
    const gate = createGate();
    overrideList({ when: pageIs(1), gate: gate.opened });
    const user = renderList();
    await screen.findByText('1 / 3');
    const nextButton = screen.getByRole('button', { name: '다음' });
    await user.click(nextButton);

    expect(screen.getByText('부원 #41')).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '다음' })).toBe(nextButton);
    expect(nextButton).toHaveFocus();
    expect(nextButton).toHaveAttribute('aria-disabled', 'true');
    expect(nextButton).not.toHaveClass('opacity-40');
    expect(screen.getByRole('button', { name: '이전' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(nextButton);

    gate.open();
    expect(await screen.findByText('2 / 3')).toBeInTheDocument();
    expect(listRequestCount(2)).toBe(0);
    expect(screen.getByRole('list')).not.toHaveAttribute('aria-busy');
  });

  it('받는 동안 이전을 눌러도 무시한다 — 응답이 오면 새 쪽(3 / 3)이 보인다', async () => {
    seedBills(41);
    const user = renderList();
    await screen.findByText('1 / 3');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('2 / 3');
    await waitForPagerReady();

    const gate = createGate();
    overrideList({ when: pageIs(2), gate: gate.opened });
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    gate.open();
    expect(await screen.findByText('3 / 3')).toBeInTheDocument();
  });

  it('마지막 쪽에 닿으면 다음은 disabled 가 아니라 aria-disabled 로 포커스를 남기고, 눌러도 옮기지 않는다', async () => {
    seedBills(25);
    const user = renderList();
    await goToSecondPage(user);
    const nextButton = screen.getByRole('button', { name: '다음' });

    expect(nextButton).toHaveAttribute('aria-disabled', 'true');
    expect(nextButton).not.toBeDisabled();
    expect(nextButton).toHaveFocus();
    await user.click(nextButton);
    // 눌린 것으로 처리되면 같은 렌더에서 새 page 키의 자리 채움이 걸려 목록이 aria-busy 가 된다.
    expect(screen.getByRole('list')).not.toHaveAttribute('aria-busy');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    // 첫 쪽의 '이전'도 끝 쪽이라 disabled 가 아니라 aria-disabled — 눌러 1쪽에 닿아도 포커스가 남는다.
    const previousButton = screen.getByRole('button', { name: '이전' });
    await user.click(previousButton);
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    expect(previousButton).toHaveAttribute('aria-disabled', 'true');
    expect(previousButton).not.toBeDisabled();
    expect(previousButton).toHaveFocus();
  });

  it('이전·다음은 청구 목록 페이지 내비게이션 안에 있고, 쪽 표시는 바뀔 때 읽히는 알림 영역이다', async () => {
    seedBills(25);
    renderList();
    const indicator = await screen.findByText('1 / 2');
    const pager = screen.getByRole('navigation', { name: '청구 목록 페이지' });

    expect(within(pager).getByRole('button', { name: '이전' })).toBeInTheDocument();
    expect(within(pager).getByRole('button', { name: '다음' })).toBeInTheDocument();
    expect(indicator).toHaveAttribute('aria-live', 'polite');
    expect(indicator).toHaveAttribute('aria-atomic', 'true');
  });

  it('필터를 바꾸는 동안 이전 목록·푸터를 흐리게 두고 목록에 aria-busy 를 단다', async () => {
    seedBills(25);
    const gate = createGate();
    overrideList({ when: (query) => query.get('status') === 'OVERDUE', gate: gate.opened });
    const user = renderList();
    await screen.findByText('1 / 2');
    await user.selectOptions(screen.getByRole('combobox', { name: '청구 상태 필터' }), 'OVERDUE');

    const list = screen.getByRole('list');
    expect(list).toHaveAttribute('aria-busy', 'true');
    expect(within(list).getByText('부원 #25')).toBeInTheDocument();
    // 흐림은 목록과 푸터를 함께 감싼 영역에 건다 — 이전 조건의 '총 25건'을 새 결과로 읽지 않게(#906).
    expect(screen.getByText('총 25건').closest('.opacity-60')).not.toBeNull();

    gate.open();
    expect(await screen.findByText('발행된 청구가 없습니다.')).toBeInTheDocument();
  });

  it('빈 결과를 캐시한 조건으로 돌아가 다시 받는 동안 빈 안내 대신 로딩을 보인다', async () => {
    seedBills(3);
    const user = renderList();
    await screen.findByText('1 / 1');
    const statusFilter = screen.getByRole('combobox', { name: '청구 상태 필터' });
    await user.selectOptions(statusFilter, 'OVERDUE');
    expect(await screen.findByText('발행된 청구가 없습니다.')).toBeInTheDocument();
    await user.selectOptions(statusFilter, '전체');
    await screen.findByText('총 3건');

    // 연체 키에는 0건 응답이 캐시돼 있다 — 다시 받는 동안 그 빈 결과로 "없습니다"를 단정하지 않는다.
    const gate = createGate();
    overrideList({ when: (query) => query.get('status') === 'OVERDUE', gate: gate.opened });
    await user.selectOptions(statusFilter, 'OVERDUE');

    expect(screen.queryByText('발행된 청구가 없습니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: '청구 목록 불러오는 중' })).toBeInTheDocument();

    gate.open();
    expect(await screen.findByText('발행된 청구가 없습니다.')).toBeInTheDocument();
  });
});
