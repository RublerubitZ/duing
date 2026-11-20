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
  it('운영 중 동아리를 모든 페이지에서 받아 이름순 그대로 합친다', async () => {
    pagesByNumber = { 0: pageOf(clubRange(1, 100), 0, 166), 1: pageOf(clubRange(101, 166), 1, 166) };
    const { result } = renderHook(() => useAdminActiveClubsQuery(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((club) => club.id)).toEqual(clubRange(1, 166).map((club) => club.id));
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

  it('뒤 페이지에 앞 페이지 동아리가 다시 와도 한 번만 담는다', async () => {
    pagesByNumber = { 0: pageOf(clubRange(1, 100), 0, 166), 1: pageOf(clubRange(100, 166), 1, 166) };
    const { result } = renderHook(() => useAdminActiveClubsQuery(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const clubIds = result.current.data?.map((club) => club.id) ?? [];
    expect(clubIds).toHaveLength(166);
    expect(new Set(clubIds).size).toBe(166);
    expect(clubIds.filter((clubId) => clubId === 100)).toHaveLength(1);
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
