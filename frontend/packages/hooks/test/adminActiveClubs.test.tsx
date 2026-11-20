import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import type { AdminClubSummary } from '@duing/types';
import { ApiClientProvider } from '../src/api-context';
import { useAdminActiveClubsQuery, useUpdateClubStatusMutation } from '../src/admin';
import { adminQueryKeys } from '../src/adminQueryKeys';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const activeClub = (id: number): AdminClubSummary => ({
  id, name: `동아리 ${id}`, category: 'ACADEMIC', division: null, college: null, logoUrl: null,
  status: 'ACTIVE', tags: [], leaderId: null, leaderName: null, leaderStudentId: null,
  centralClub: false, facilitySecuredTimeTarget: false, rejectionReason: null, statusChangedAt: null,
  statusChangedByName: null,
});
const clubRange = (fromId: number, toId: number) =>
  Array.from({ length: toId - fromId + 1 }, (_, index) => activeClub(fromId + index));
// 서버처럼 페이지마다 같은 totalElements·totalPages 를 싣는다.
const pageOf = (content: AdminClubSummary[], page: number, totalElements: number) => {
  const totalPages = Math.ceil(totalElements / 100);
  return { content, page, size: 100, totalElements, totalPages, hasNext: page + 1 < totalPages };
};
const ok = (data: unknown) => HttpResponse.json({ ok: true, message: null, data });

let requestedUrls: URL[] = [];
// 페이지 번호 → 응답. 없는 페이지는 500.
let pagesByNumber: Record<number, ReturnType<typeof pageOf>> = {};
const server = setupServer(
  http.get('*/admin/clubs', ({ request }) => {
    const url = new URL(request.url);
    requestedUrls.push(url);
    const responsePage = pagesByNumber[Number(url.searchParams.get('page'))];
    return responsePage
      ? ok(responsePage)
      : HttpResponse.json({ ok: false, message: '서버 오류', data: null }, { status: 500 });
  }),
  http.patch('*/admin/clubs/7/status', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  requestedUrls = [];
  pagesByNumber = {};
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }
  return Wrapper;
}

const requestedPages = () => requestedUrls.map((url) => url.searchParams.get('page'));

describe('useAdminActiveClubsQuery', () => {
  it('운영 중 동아리를 모든 페이지에서 받아 서버가 준 순서(이름순) 그대로 합친다', async () => {
    // 이름순은 id 순과 다르다 — 0페이지 id 를 내림차순으로 둬 id 로 다시 정렬하는 구현을 잡는다.
    const firstPageClubs = clubRange(1, 100).reverse();
    pagesByNumber = { 0: pageOf(firstPageClubs, 0, 166), 1: pageOf(clubRange(101, 166), 1, 166) };
    const { result } = renderHook(() => useAdminActiveClubsQuery(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((club) => club.id)).toEqual(
      [...firstPageClubs, ...clubRange(101, 166)].map((club) => club.id),
    );
    expect(requestedPages()).toEqual(['0', '1']);
    expect(requestedUrls.map((url) => url.searchParams.get('status'))).toEqual(['ACTIVE', 'ACTIVE']);
    expect(requestedUrls.map((url) => url.searchParams.get('size'))).toEqual(['100', '100']);
  });

  it('한 페이지뿐이거나 비어 있으면 한 번만 묻는다', async () => {
    pagesByNumber = { 0: pageOf(clubRange(1, 40), 0, 40) };
    const onePage = renderHook(() => useAdminActiveClubsQuery(), { wrapper: makeWrapper() });
    await waitFor(() => expect(onePage.result.current.isSuccess).toBe(true));
    expect(onePage.result.current.data).toHaveLength(40);
    expect(requestedPages()).toEqual(['0']);

    requestedUrls = [];
    pagesByNumber = { 0: pageOf([], 0, 0) };
    const emptyPage = renderHook(() => useAdminActiveClubsQuery(), { wrapper: makeWrapper() });
    await waitFor(() => expect(emptyPage.result.current.isSuccess).toBe(true));
    expect(emptyPage.result.current.data).toEqual([]);
    expect(requestedPages()).toEqual(['0']);
  });

  it('뒤 페이지가 실패하면 앞 페이지만 돌려주지 않고 실패한다', async () => {
    pagesByNumber = { 0: pageOf(clubRange(1, 100), 0, 166) };
    const { result } = renderHook(() => useAdminActiveClubsQuery(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
  });

  // 페이지 사이에 목록이 바뀐 두 신호를 하나씩 — 건수가 달라짐(앞쪽에 한 곳이 늘어 100번이 다시 옴, 중복을 걸러도 166곳),
  // 건수는 같은데 한 곳이 빠짐(이름이 바뀌어 offset 이 밀림).
  it('페이지 사이에 목록이 바뀌면 빠진 채로 돌려주지 않고 실패한다', async () => {
    pagesByNumber = { 0: pageOf(clubRange(1, 100), 0, 166), 1: pageOf([activeClub(100), ...clubRange(101, 166)], 1, 167) };
    const countChanged = renderHook(() => useAdminActiveClubsQuery(), { wrapper: makeWrapper() });
    await waitFor(() => expect(countChanged.result.current.isError).toBe(true));
    expect(countChanged.result.current.data).toBeUndefined();

    pagesByNumber = { 0: pageOf(clubRange(1, 100), 0, 166), 1: pageOf([activeClub(100), ...clubRange(101, 165)], 1, 166) };
    const oneSkipped = renderHook(() => useAdminActiveClubsQuery(), { wrapper: makeWrapper() });
    await waitFor(() => expect(oneSkipped.result.current.isError).toBe(true));
    expect(oneSkipped.result.current.data).toBeUndefined();
  });

  it('키가 동아리 접두(clubsAll) 아래라 동아리 상태 변경 뒤 다시 받는다', async () => {
    expect(adminQueryKeys.clubsActiveAll()).toEqual([...adminQueryKeys.clubsAll, 'active-all']);
    pagesByNumber = { 0: pageOf(clubRange(1, 3), 0, 3) };
    const { result } = renderHook(
      () => ({ activeClubs: useAdminActiveClubsQuery(), statusMutation: useUpdateClubStatusMutation() }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.activeClubs.isSuccess).toBe(true));
    expect(requestedUrls).toHaveLength(1);

    await act(() => result.current.statusMutation.mutateAsync({ clubId: 7, payload: { status: 'INACTIVE' } }));
    await waitFor(() => expect(requestedUrls).toHaveLength(2));
  });
});
