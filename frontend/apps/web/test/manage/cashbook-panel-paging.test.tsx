import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse, type PathParams } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type {
  CashbookEntry,
  CreateCashbookEntryPayload,
  PageResponse,
  UpdateCashbookEntryPayload,
} from '@duing/types';

vi.mock('@/app/_components/toast/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import { CashbookPanel } from '@/app/manage/clubs/[clubId]/fees/_components/CashbookPanel';

// 장부 목록 페이지 이동(#1752). API 응답만 msw 로 모킹하고 React Query·무효화는 실제로 돌린다 —
// 페이지 이동이 합계 요청을 다시 부르는지, 변경 뒤 같은 page 키를 다시 받는지가 캐시 동작에 달려 있다.
const CLUB_ID = 1;
const CASHBOOK_URL = `http://localhost:8080/api/v1/leader/clubs/${CLUB_ID}/cashbook`;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const json = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

// 가짜 서버 상태 — beforeEach 에서 비운다.
let serverEntries: CashbookEntry[] = [];
let listRequests: URLSearchParams[] = [];
let summaryRequests: URLSearchParams[] = [];

const buildEntry = (id: number, over: Partial<CashbookEntry> = {}): CashbookEntry => ({
  id, entryType: 'EXPENSE', source: 'BANK_API', categoryCode: 'OTHER', customCategory: null,
  amount: 1000, description: `항목 ${id}`, transactionDate: '2026-09-03', memo: null,
  attachmentUrl: null, bankTransactionId: id, excluded: false, createdAt: '2026-09-03T00:00:00', ...over,
});

/** id 1..count. 거래일이 같아 id 내림차순 — 1페이지 = id count..count-19, id 1 이 맨 마지막. `oldest` 는 id 1 에만 덮는다. */
function seedEntries(count: number, oldest: Partial<CashbookEntry> = {}) {
  serverEntries = Array.from({ length: count }, (_, index) => buildEntry(index + 1, index === 0 ? oldest : {}));
}

// 서버(CashbookEntryRepositoryImpl.search + PageImpl)와 같게 자른다 — 범위 밖 page 는 content 만 비고 총계는 그대로.
// 날짜·검색어는 거르지 않는다(그 필터 테스트는 요청 파라미터만 본다).
function pageOf(query: URLSearchParams): PageResponse<CashbookEntry> {
  const pageIndex = Number(query.get('page') ?? '0');
  const pageSize = Number(query.get('size') ?? '20');
  const matched = serverEntries
    .filter((entry) => !query.has('entryType') || entry.entryType === query.get('entryType'))
    .filter((entry) => !query.has('categoryCode') || entry.categoryCode === query.get('categoryCode'))
    .filter((entry) => query.get('hideExcluded') !== 'true' || !entry.excluded)
    .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate) || right.id - left.id);
  return {
    content: matched.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
    page: pageIndex,
    size: pageSize,
    totalElements: matched.length,
    totalPages: Math.ceil(matched.length / pageSize),
    hasNext: (pageIndex + 1) * pageSize < matched.length,
  };
}

const server = setupServer(
  http.get(CASHBOOK_URL, ({ request }) => {
    const query = new URL(request.url).searchParams;
    listRequests.push(query);
    return json(pageOf(query));
  }),
  http.get(`${CASHBOOK_URL}/summary`, ({ request }) => {
    summaryRequests.push(new URL(request.url).searchParams);
    return json({ totalIncome: 0, totalExpense: 0, bookBalance: 0 });
  }),
  http.post<PathParams, CreateCashbookEntryPayload>(CASHBOOK_URL, async ({ request }) => {
    const payload = await request.json();
    const createdId = Math.max(0, ...serverEntries.map((entry) => entry.id)) + 1;
    serverEntries = [
      ...serverEntries,
      buildEntry(createdId, {
        entryType: payload.entryType,
        categoryCode: payload.categoryCode,
        amount: payload.amount,
        description: payload.description,
        transactionDate: payload.transactionDate,
        source: 'MANUAL',
        bankTransactionId: null,
      }),
    ];
    return json(createdId);
  }),
  http.patch<{ entryId: string }, UpdateCashbookEntryPayload>(`${CASHBOOK_URL}/:entryId`, async ({ params, request }) => {
    const payload = await request.json();
    serverEntries = serverEntries.map((entry) =>
      entry.id === Number(params.entryId) ? { ...entry, categoryCode: payload.categoryCode } : entry,
    );
    return new HttpResponse(null, { status: 204 });
  }),
  http.patch<{ entryId: string }, { excluded: boolean }>(
    `${CASHBOOK_URL}/:entryId/exclusion`,
    async ({ params, request }) => {
      const { excluded } = await request.json();
      serverEntries = serverEntries.map((entry) => (entry.id === Number(params.entryId) ? { ...entry, excluded } : entry));
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.delete<{ entryId: string }>(`${CASHBOOK_URL}/:entryId`, ({ params }) => {
    serverEntries = serverEntries.filter((entry) => entry.id !== Number(params.entryId));
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  serverEntries = [];
  listRequests = [];
  summaryRequests = [];
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPanel(): UserEvent {
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <CashbookPanel clubId={CLUB_ID} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
  return user;
}

const lastListRequest = () => listRequests.at(-1);

async function goToSecondPage(user: UserEvent) {
  await screen.findByText('1 / 2');
  await user.click(screen.getByRole('button', { name: '다음' }));
  await screen.findByText('2 / 2');
}

const filterCases: { name: string; paramKey: string; applyFilter: (user: UserEvent) => Promise<void> }[] = [
  { name: '유형 수입', paramKey: 'entryType', applyFilter: (user) => user.click(screen.getByRole('button', { name: '수입' })) },
  {
    name: '제외 항목 숨기기',
    paramKey: 'hideExcluded',
    applyFilter: (user) => user.click(screen.getByRole('button', { name: '제외 항목 숨기기' })),
  },
  {
    name: '카테고리 회식',
    paramKey: 'categoryCode',
    applyFilter: (user) => user.selectOptions(screen.getByLabelText('카테고리 필터'), 'DINING'),
  },
  {
    name: '시작일',
    paramKey: 'from',
    applyFilter: async () => {
      fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-09-01' } });
    },
  },
  {
    name: '종료일',
    paramKey: 'to',
    applyFilter: async () => {
      fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-09-30' } });
    },
  },
  { name: '검색어', paramKey: 'keyword', applyFilter: (user) => user.type(screen.getByLabelText('장부 검색'), '버스') },
];

describe('금전출납부 패널 — 페이지 이동', () => {
  it('21건 이상이면 총 건수와 쪽 표시가 나오고, 다음·이전은 목록만 다시 부르며 합계는 다시 부르지 않는다', async () => {
    seedEntries(25);
    const user = renderPanel();

    expect(await screen.findByText('총 25건')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    await waitFor(() => expect(summaryRequests).toHaveLength(1));
    // 합계는 조건 전체를 센다 — 페이지 파라미터가 붙으면 페이지마다 다른 키가 된다.
    expect(summaryRequests[0]?.has('page')).toBe(false);
    expect(summaryRequests[0]?.has('size')).toBe(false);

    await user.click(screen.getByRole('button', { name: '다음' }));
    // 새 page 키를 받는 동안 보정이 0 으로 되돌리면 여기서 "2 / 2" 를 찾지 못한다.
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    expect(lastListRequest()?.get('page')).toBe('1');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('항목 1')).toBeInTheDocument();
    expect(screen.queryByText('항목 6')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(summaryRequests).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
    expect(summaryRequests).toHaveLength(1);
  });

  it.each(filterCases)('2페이지에서 $name 을(를) 바꾸면 그 필터를 단 목록 요청이 모두 page=0 이다', async ({ paramKey, applyFilter }) => {
    seedEntries(25);
    const user = renderPanel();
    await goToSecondPage(user);

    await applyFilter(user);

    await waitFor(() => expect(listRequests.some((query) => query.has(paramKey))).toBe(true));
    // 마지막 요청만 보면, 결과가 0건인 필터에서 보정이 0 으로 되돌려 리셋 누락을 가린다 — 그 필터를 단 요청 전부를 본다.
    const filteredRequests = listRequests.filter((query) => query.has(paramKey));
    expect(filteredRequests.every((query) => query.get('page') === '0')).toBe(true);
  });

  it('미분류를 분류해 목록에서 빠져도 그 페이지에 항목이 남으면 같은 페이지에 머문다', async () => {
    seedEntries(25); // 모두 BANK_API · 기타(OTHER) = 미분류
    const user = renderPanel();
    await screen.findByText('1 / 2');
    await user.selectOptions(screen.getByLabelText('카테고리 필터'), 'OTHER');
    await waitFor(() => expect(lastListRequest()?.get('categoryCode')).toBe('OTHER'));
    await goToSecondPage(user);

    const firstRow = screen.getAllByRole('listitem')[0]!;
    await user.click(within(firstRow).getByRole('button', { name: '수정' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('카테고리'), 'DINING');
    await user.click(within(dialog).getByRole('button', { name: '수정' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('총 24건')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(lastListRequest()?.get('page')).toBe('1');
  });

  it('20건 이하면 총 N건과 1 / 1 이 보이고 이전·다음이 모두 비활성이다', async () => {
    seedEntries(3);
    renderPanel();

    expect(await screen.findByText('총 3건')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('2페이지에서 등록해도 그 페이지에 머물고 총 건수만 는다', async () => {
    seedEntries(25);
    const user = renderPanel();
    await goToSecondPage(user);

    await user.click(screen.getByRole('button', { name: '지출 등록' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('금액(원)'));
    await user.type(within(dialog).getByLabelText('금액(원)'), '5000');
    await user.type(within(dialog).getByLabelText('설명'), '새 지출');
    // 기존 항목(2026-09-03)보다 늦은 날 — 1페이지 맨 위로 간다. 오늘 날짜 기본값에 기대지 않는다.
    fireEvent.change(within(dialog).getByLabelText('거래일'), { target: { value: '2026-09-04' } });
    await user.click(within(dialog).getByRole('button', { name: '등록' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('총 26건')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(lastListRequest()?.get('page')).toBe('1');
  });
});

describe('금전출납부 패널 — 빈 페이지 보정', () => {
  it('마지막 페이지의 마지막 항목을 지우면 빈 페이지에 남지 않고 마지막 유효 페이지로 옮긴다', async () => {
    seedEntries(21, { source: 'MANUAL', bankTransactionId: null });
    const user = renderPanel();
    await goToSecondPage(user);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('총 20건')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.queryByText('장부 항목이 없습니다.')).not.toBeInTheDocument();
  });

  // 두 쪽짜리에서는 마지막 유효 페이지가 늘 첫 쪽이라, 첫 쪽으로 보내는 보정과 구별되지 않는다 — 세 쪽으로 가른다.
  it('세 쪽 중 마지막 쪽이 비면 첫 쪽이 아니라 마지막 유효 페이지(2쪽)로 옮긴다', async () => {
    seedEntries(41, { source: 'MANUAL', bankTransactionId: null });
    const user = renderPanel();
    await screen.findByText('1 / 3');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('2 / 3');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('3 / 3');

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));

    expect(await screen.findByText('총 40건')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it("'제외 항목 숨기기' 중 마지막 페이지의 마지막 항목을 제외하면 마지막 유효 페이지로 옮긴다", async () => {
    seedEntries(21);
    const user = renderPanel();
    await screen.findByText('1 / 2');
    await user.click(screen.getByRole('button', { name: '제외 항목 숨기기' }));
    await waitFor(() => expect(lastListRequest()?.get('hideExcluded')).toBe('true'));
    await goToSecondPage(user);

    await user.click(screen.getByRole('button', { name: '제외' }));

    expect(await screen.findByText('총 20건')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('보정으로 떠난 페이지에 항목이 다시 생기면, 다음이 옛 빈 캐시를 보고 앞 페이지로 튕기지 않는다', async () => {
    seedEntries(21, { source: 'MANUAL', bankTransactionId: null });
    const user = renderPanel();
    await goToSecondPage(user);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
    expect(await screen.findByText('1 / 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '지출 등록' }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText('금액(원)'));
    await user.type(within(dialog).getByLabelText('금액(원)'), '5000');
    await user.type(within(dialog).getByLabelText('설명'), '지난 지출');
    // 기존 항목(2026-09-03)보다 이른 날 — 맨 마지막(2페이지)으로 간다.
    fireEvent.change(within(dialog).getByLabelText('거래일'), { target: { value: '2026-08-01' } });
    await user.click(within(dialog).getByRole('button', { name: '등록' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();

    // 2페이지 키에는 보정 때 받은 옛 응답(content: [], totalPages: 1)이 무효 표시된 채 남아 있다.
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText('지난 지출')).toBeInTheDocument();
  });

  it('다시 받은 결과가 0건이면 0페이지 빈 상태로 돌아간다', async () => {
    seedEntries(21, { source: 'MANUAL', bankTransactionId: null });
    // 이 테스트만: 지우는 순간 나머지도 사라진다(다른 운영진이 다 지운 상황).
    server.use(
      http.delete(`${CASHBOOK_URL}/:entryId`, () => {
        serverEntries = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = renderPanel();
    await goToSecondPage(user);
    const requestCountBeforeDelete = listRequests.length;

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));

    // 빈 상태 문구는 보정 없이 2페이지에 남아도 뜬다 — 삭제 뒤 page=0 요청이 나갔는지로 보정을 가른다.
    await waitFor(() =>
      expect(listRequests.slice(requestCountBeforeDelete).some((query) => query.get('page') === '0')).toBe(true),
    );
    expect(await screen.findByText('장부 항목이 없습니다.')).toBeInTheDocument();
  });
});
