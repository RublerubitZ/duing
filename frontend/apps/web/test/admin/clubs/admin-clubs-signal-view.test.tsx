import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { delay, http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminClubSignalDetail, AdminClubSummary } from '@duing/types';

import { AdminClubsListPage } from '@/app/admin/clubs/_pages/AdminClubsListPage';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const mockSearchParams = vi.fn(() => new URLSearchParams());
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/clubs',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...anchorProps }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...anchorProps}>
      {children}
    </a>
  ),
}));

const NO_MATERIAL: AdminClubSignalDetail = { operatorsLastActiveAt: null, resultWaiting: null, joinRequestWaiting: null };

/** signalDetail 을 주지 않으면 키가 없는 행(옛 백엔드)이다. */
function makeClub(overrides: Partial<AdminClubSummary> = {}): AdminClubSummary {
  return {
    id: 1, name: '두잉 코딩 동아리', category: 'ACADEMIC', division: null, college: null, logoUrl: null,
    status: 'ACTIVE', tags: [], leaderId: 3, leaderName: '김회장', leaderStudentId: '20250002', centralClub: false,
    facilitySecuredTimeTarget: false, rejectionReason: null, statusChangedAt: null, statusChangedByName: null,
    ...overrides,
  };
}

type ListState = { content: AdminClubSummary[]; totalElements: number; hasNext: boolean; status: number; isStalled: boolean };
let listState: ListState;
let listRequests: Record<string, string>[] = [];
const server = setupServer(
  http.get('*/admin/clubs', async ({ request }) => {
    const searchParams = new URL(request.url).searchParams;
    listRequests.push(Object.fromEntries(searchParams));
    if (listState.isStalled) await delay('infinite');
    if (listState.status !== 200) {
      return HttpResponse.json({ ok: false, message: '서버 오류', data: null }, { status: listState.status });
    }
    return HttpResponse.json({
      ok: true,
      message: null,
      data: {
        content: listState.content,
        page: Number(searchParams.get('page') ?? '0'),
        size: 20,
        totalElements: listState.totalElements,
        totalPages: Math.max(1, Math.ceil(listState.totalElements / 20)),
        hasNext: listState.hasNext,
      },
    });
  }),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  listRequests = [];
  listState = { content: [], totalElements: 0, hasNext: false, status: 200, isStalled: false };
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function showList(content: AdminClubSummary[], totalElements = content.length, hasNext = false) {
  listState = { ...listState, content, totalElements, hasNext };
}

function renderPage(query = '') {
  mockSearchParams.mockReturnValue(new URLSearchParams(query));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const pageTree = () => (
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AdminClubsListPage />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>
  );
  const view = render(pageTree());
  return {
    ...view,
    queryClient,
    rerenderPage: (nextQuery: string) => {
      mockSearchParams.mockReturnValue(new URLSearchParams(nextQuery));
      view.rerender(pageTree());
    },
  };
}

async function searchKeyword(keyword: string) {
  await userEvent.type(screen.getByPlaceholderText('이름 또는 설명으로 검색'), keyword);
  await userEvent.click(screen.getByRole('button', { name: '검색' }));
}

describe('AdminClubsListPage — 신호 주소·조회 조건', () => {
  it('주소 ?signal=RESULT_WAITING 이면 운영 중 탭으로 열고 운영 중 + 신호 조건으로 조회한다', async () => {
    renderPage('signal=RESULT_WAITING');
    await waitFor(() => expect(listRequests).toHaveLength(1));
    expect(listRequests[0]).toEqual({ status: 'ACTIVE', signal: 'RESULT_WAITING', page: '0', size: '20' });
    expect(screen.getByRole('tab', { name: '운영 중' })).toHaveAttribute('aria-selected', 'true');
  });

  it('모르는 신호(소문자 포함)는 무시하고 status 주소값을 따른다 — 서버에 400 을 부르지 않는다', async () => {
    renderPage('signal=result_waiting&status=INACTIVE');
    await waitFor(() => expect(listRequests).toHaveLength(1));
    expect(listRequests[0]).toEqual({ status: 'INACTIVE', page: '0', size: '20' });
    expect(screen.queryByRole('button', { name: /조건 해제$/ })).toBeNull();
  });

  it('신호가 있으면 status 주소값보다 우선한다', async () => {
    renderPage('signal=NO_RECORD&status=INACTIVE_PENDING');
    await waitFor(() => expect(listRequests).toHaveLength(1));
    expect(listRequests[0]).toEqual({ status: 'ACTIVE', signal: 'NO_RECORD', page: '0', size: '20' });
    expect(screen.getByRole('tab', { name: '운영 중' })).toHaveAttribute('aria-selected', 'true');
  });

  it('2쪽을 보던 신호 목록도 다른 신호 주소로 다시 그리면 새 신호로 0쪽부터 받는다', async () => {
    showList([makeClub({ signalDetail: NO_MATERIAL })], 40, true);
    const { rerenderPage } = renderPage('signal=RESULT_WAITING');
    await userEvent.click(await screen.findByRole('button', { name: '다음' }));
    await waitFor(() => expect(listRequests.at(-1)).toMatchObject({ signal: 'RESULT_WAITING', page: '1' }));

    rerenderPage('signal=NO_RECORD');

    await waitFor(() => expect(listRequests.at(-1)).toEqual({ status: 'ACTIVE', signal: 'NO_RECORD', page: '0', size: '20' }));
    expect(await screen.findByText(/동아리 40곳만 보고 있어요/)).toHaveTextContent('두잉 기록 없음 동아리 40곳만 보고 있어요');
  });
});

describe('AdminClubsListPage — 신호 줄', () => {
  it('목록 건수와 함께 신호 이름을 쓰고, 둘째 줄에 연락처 찾는 곳(회원 관리 링크)을 쓴다', async () => {
    showList([makeClub({ signalDetail: NO_MATERIAL })], 3);
    renderPage('signal=RESULT_WAITING');
    expect(await screen.findByText(/동아리 3곳만 보고 있어요/)).toHaveTextContent(
      '지원 결과 미확정 동아리 3곳만 보고 있어요 · 조건 해제',
    );
    expect(screen.getByText(/회장 학번으로 찾을 수 있어요/)).toHaveTextContent(
      '총동연이 대신 처리할 수 없어요 · 연락처는 회원 관리에서 회장 학번으로 찾을 수 있어요 · 회원 관리',
    );
    expect(screen.getByRole('link', { name: '회원 관리' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('button', { name: "'지원 결과 미확정' 조건 해제" })).toHaveTextContent('조건 해제');
  });

  it.each([
    ['NO_RECORD', '두잉 기록 없음', '사진·대표 활동·일정·모집 등록만 세요 · 동아리 활동 평가 기준이 아니에요 · 매시 갱신돼요'],
    ['OPERATOR_INACTIVE', '운영진 30일 넘게 미접속', '두잉 접속만 세요 · 동아리 활동 평가 기준이 아니에요'],
  ])('%s 신호 줄은 무엇을 세는지와 평가 기준이 아님을 쓰고 회원 관리 링크는 없다', async (signal, signalName, guide) => {
    showList([makeClub({ signalDetail: NO_MATERIAL })], 1);
    renderPage(`signal=${signal}`);
    expect(await screen.findByText(/동아리 1곳만 보고 있어요/)).toHaveTextContent(`${signalName} 동아리 1곳만 보고 있어요 · 조건 해제`);
    expect(screen.getByText(guide)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '회원 관리' })).toBeNull();
  });

  it('0건이면 건수를 빼고 "지금은 해당하는 동아리가 없어요" 를 쓴다(바닥글은 곳)', async () => {
    renderPage('signal=JOIN_REQUEST_WAITING');
    expect(await screen.findByText('지금은 해당하는 동아리가 없어요. 홈 숫자는 조금 전 기준이에요.')).toBeInTheDocument();
    expect(screen.getByText(/동아리만 보고 있어요/)).toHaveTextContent('가입 신청 7일 넘게 대기 동아리만 보고 있어요 · 조건 해제');
    expect(screen.getByText('총 0곳')).toBeInTheDocument();
  });

  it('검색어가 있는 0건이면 그 검색어로 찾은 곳이 없다고 쓰고, 검색 초기화가 검색어만 지운다', async () => {
    renderPage('signal=RESULT_WAITING');
    await waitFor(() => expect(listRequests).toHaveLength(1));
    await searchKeyword('코딩');
    expect(await screen.findByText(/'코딩'로 찾은 동아리 중 해당하는 곳이 없어요/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '검색 초기화' }));

    await waitFor(() => expect(listRequests.at(-1)).toEqual({ status: 'ACTIVE', signal: 'RESULT_WAITING', page: '0', size: '20' }));
  });

  it('목록을 받는 중에는 건수를 뺀다 — 건수를 받은 뒤 다음 쪽을 받는 동안에도 앞 건수를 남기지 않는다', async () => {
    showList([makeClub({ signalDetail: NO_MATERIAL })], 40, true);
    renderPage('signal=RESULT_WAITING');
    expect(await screen.findByText(/동아리 40곳만 보고 있어요/)).toBeInTheDocument();

    listState = { ...listState, isStalled: true };
    await userEvent.click(screen.getByRole('button', { name: '다음' }));

    await waitFor(() => expect(listRequests.at(-1)).toMatchObject({ signal: 'RESULT_WAITING', page: '1' }));
    expect(screen.getByText(/동아리만 보고 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/곳만 보고 있어요/)).toBeNull();
  });

  it('목록을 받지 못하면 건수를 빼고 기존 오류 문구를 쓴다 — 건수를 받은 뒤 같은 조건을 다시 받다 실패해도', async () => {
    showList([makeClub({ signalDetail: NO_MATERIAL })], 40);
    const { queryClient } = renderPage('signal=RESULT_WAITING');
    expect(await screen.findByText(/동아리 40곳만 보고 있어요/)).toBeInTheDocument();

    // 같은 조건을 다시 받다 실패하면 앞서 받은 목록(data)이 남은 채 오류가 된다 — 건수가 0 이 아니어도 N 을 빼야 한다.
    listState = { ...listState, status: 500 };
    await act(async () => {
      await queryClient.refetchQueries();
    });

    expect(await screen.findByText('목록을 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByText(/동아리만 보고 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/곳만 보고 있어요/)).toBeNull();
  });
});

describe('AdminClubsListPage — 조건 해제·탭', () => {
  it('조건 해제는 검색어를 두고 신호만 풀어 0쪽부터 받고, 포커스를 운영 중 탭으로 옮긴다', async () => {
    showList([makeClub({ signalDetail: NO_MATERIAL })], 40, true);
    renderPage('signal=RESULT_WAITING');
    await waitFor(() => expect(listRequests).toHaveLength(1));
    await searchKeyword('코딩');
    await userEvent.click(await screen.findByRole('button', { name: '다음' }));
    await waitFor(() => expect(listRequests.at(-1)).toMatchObject({ keyword: '코딩', page: '1' }));

    await userEvent.click(screen.getByRole('button', { name: "'지원 결과 미확정' 조건 해제" }));

    await waitFor(() => expect(listRequests.at(-1)).toEqual({ status: 'ACTIVE', keyword: '코딩', page: '0', size: '20' }));
    expect(screen.getByRole('tab', { name: '운영 중' })).toHaveFocus();
    expect(screen.queryByText(/보고 있어요/)).toBeNull();
    expect(screen.getByPlaceholderText('이름 또는 설명으로 검색')).toHaveValue('코딩');
  });

  it('다른 탭을 누르면 신호를 풀고 그 탭으로 간다', async () => {
    renderPage('signal=OPERATOR_INACTIVE');
    await waitFor(() => expect(listRequests).toHaveLength(1));
    await userEvent.click(screen.getByRole('tab', { name: '전체' }));
    await waitFor(() => expect(listRequests.at(-1)).toEqual({ page: '0', size: '20' }));
    expect(screen.queryByRole('button', { name: /조건 해제$/ })).toBeNull();
  });

  it('이미 선택된 운영 중 탭을 다시 누르면 조건 해제와 같다', async () => {
    renderPage('signal=NO_RECORD');
    await waitFor(() => expect(listRequests).toHaveLength(1));
    await userEvent.click(screen.getByRole('tab', { name: '운영 중' }));
    await waitFor(() => expect(listRequests.at(-1)).toEqual({ status: 'ACTIVE', page: '0', size: '20' }));
    expect(screen.queryByRole('button', { name: /조건 해제$/ })).toBeNull();
  });
});

describe('AdminClubsListPage — 롤백 가드·바닥글', () => {
  it('행에 signalDetail 키가 없으면(옛 백엔드) 조건을 지금 볼 수 없다고 쓰고 건수·표·바닥글·쪽수를 그리지 않는다', async () => {
    showList([makeClub(), makeClub({ id: 2, name: '두잉 사진부' })], 165, true);
    renderPage('signal=RESULT_WAITING');
    expect(await screen.findByText('조건을 해제하면 운영 중 동아리 전체를 볼 수 있어요.')).toBeInTheDocument();
    expect(screen.getByText(/조건은 지금 볼 수 없어요/)).toHaveTextContent("'지원 결과 미확정' 조건은 지금 볼 수 없어요 · 조건 해제");
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText(/^총 \d+곳$/)).toBeNull();
    expect(screen.queryByRole('button', { name: '다음' })).toBeNull();
    expect(screen.queryByText(/곳만 보고 있어요/)).toBeNull();
    expect(screen.queryByText(/회장 학번으로/)).toBeNull();
  });

  it('signalDetail 이 null 인 행은 새 백엔드의 "재료 없음"이라 표를 그린다', async () => {
    showList([makeClub({ signalDetail: null })], 1);
    renderPage('signal=RESULT_WAITING');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText(/조건은 지금 볼 수 없어요/)).toBeNull();
  });

  it('건수는 있는데 이 쪽만 비면(보던 사이 줄어 끝을 넘음) 해요체 빈 문구 대신 표의 기존 빈 문구와 쪽수를 둔다', async () => {
    showList([], 21);
    renderPage('signal=RESULT_WAITING');
    expect(await screen.findByText('조건에 맞는 동아리가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText(/동아리 21곳만 보고 있어요/)).toBeInTheDocument();
    expect(screen.queryByText(/지금은 해당하는 동아리가 없어요/)).toBeNull();
    expect(screen.getByText('총 21곳')).toBeInTheDocument();
  });

  it('바닥글은 신호가 없어도 동아리를 곳으로 센다', async () => {
    showList([makeClub()], 7);
    renderPage();
    expect(await screen.findByText('총 7곳')).toBeInTheDocument();
  });
});
