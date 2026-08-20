import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { ManagedClub, UserRole } from '@duing/types';

import { useOperatorAccess } from '@/app/calendar/_lib/useOperatorAccess';

/**
 * 행사 추가 권한은 "총동연(ADMIN)" 과 "운영 동아리 보유" 두 축의 합집합이다 — 총동연은 어느
 * 동아리의 멤버도 아니라 managed 목록이 비어 있어도 권한이 있다. 두 축을 &&/|| 로 잘못 엮으면
 * 총동연이 버튼을 잃거나 일반 학생에게 버튼이 뜬다.
 *
 * 인증 판정은 스토어 시드가 아니라 meQuery 확정(`!!meQuery.data`)이다 — 이 시멘틱이 managed
 * 조회 게이트까지 함께 잡고 있어서, 시드로 바꾸면 프로필 도착 전에 401 요청이 나간다.
 *
 * React Query 는 모킹하지 않고 MSW 로 실제 왕복을 돌린다 — 검증 대상이 enabled 게이트(요청이
 * 나갔는지)라 훅을 모킹하면 그 축이 통째로 사라진다.
 */
const BASE = 'http://localhost:8080/api/v1';
const MANAGED_PATH = '/api/v1/leader/clubs/me/managed';

const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

/** 이 스위트에서 나간 API 경로 — 게이트는 "요청이 없었다" 로만 확인할 수 있다. */
const requestedPaths: string[] = [];
const trackRequest = ({ request }: { request: Request }) => {
  requestedPaths.push(new URL(request.url).pathname);
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', trackRequest);
});
afterEach(() => {
  server.resetHandlers();
  requestedPaths.length = 0;
  // 부분 setState 로 되돌리면 필드가 테스트 간에 새어 나간다 — 초기값 전체로 교체.
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
});
afterAll(() => {
  server.events.removeListener('request:start', trackRequest);
  server.close();
});

/** 렌더 본문에서 만들면 재렌더 때 조용히 교체된다 — 밖에서 만들고 렌더 직전에 갈아 끼운다. */
let latestQueryClient = new QueryClient();

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={latestQueryClient}>
      <ApiClientProvider client={apiClient}>{children}</ApiClientProvider>
    </QueryClientProvider>
  );
}

const meUser = (role: UserRole) => ({
  id: 1,
  studentId: '20200001',
  name: '홍길동',
  phone: '01000000000',
  grade: 'THIRD',
  role,
});

const managedClub: ManagedClub = {
  clubId: 7,
  clubName: '두잉동아리',
  logoUrl: null,
  myRole: 'LEADER',
  centralClub: false,
  activeRecruitmentCount: 0,
};

function renderOperatorAccess({
  role,
  managedClubs,
}: {
  role: UserRole;
  managedClubs: ManagedClub[];
}) {
  server.use(
    http.get(`${BASE}/users/me`, () =>
      HttpResponse.json({ ok: true, data: meUser(role), message: null }),
    ),
    http.get(`${BASE}/leader/clubs/me/managed`, () =>
      HttpResponse.json({ ok: true, data: managedClubs, message: null }),
    ),
  );
  act(() => useAuthStore.setState({ status: 'authenticated', user: null }));
  latestQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useOperatorAccess(), { wrapper: Wrapper });
}

/**
 * managed 요청이 나갔고 in-flight 쿼리가 없다 = 두 쿼리 모두 반영됐다.
 * "요청 나감" 없이 isFetching 만 보면 me→managed 사이의 빈 틈을 완료로 오인한다.
 */
async function settleQueries() {
  await waitFor(() => {
    expect(requestedPaths).toContain(MANAGED_PATH);
    expect(latestQueryClient.isFetching()).toBe(0);
  });
}

/** "요청이 없었다" 를 단언하기 전에, 나갈 요청은 나가도록 한 바퀴 흘린다. */
async function flushPendingRequests() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useOperatorAccess — 운영 권한 진리표', () => {
  it('총동연은 운영 동아리가 없어도 권한이 있다', async () => {
    const { result } = renderOperatorAccess({ role: 'ADMIN', managedClubs: [] });

    await settleQueries();
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.managedClubs).toEqual([]);
    expect(result.current.canOperate).toBe(true);
  });

  it('운영 동아리를 가진 학생은 총동연이 아니어도 권한이 있다', async () => {
    const { result } = renderOperatorAccess({ role: 'STUDENT', managedClubs: [managedClub] });

    await settleQueries();
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.managedClubs).toEqual([managedClub]);
    expect(result.current.canOperate).toBe(true);
  });

  it('두 축을 모두 가진 총동연도 권한이 있다', async () => {
    const { result } = renderOperatorAccess({ role: 'ADMIN', managedClubs: [managedClub] });

    await settleQueries();
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.canOperate).toBe(true);
  });

  it('두 축이 모두 없는 학생은 권한이 없다', async () => {
    const { result } = renderOperatorAccess({ role: 'STUDENT', managedClubs: [] });

    await settleQueries();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.canOperate).toBe(false);
  });
});

describe('useOperatorAccess — managed 조회 게이트', () => {
  it('비로그인 사용자에게는 managed 요청 자체를 보내지 않는다', async () => {
    act(() => useAuthStore.setState({ status: 'unauthenticated', user: null }));
    latestQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOperatorAccess(), { wrapper: Wrapper });

    await flushPendingRequests();
    expect(requestedPaths).not.toContain(MANAGED_PATH);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.canOperate).toBe(false);
  });

  it('인증이 시드됐어도 프로필이 도착하기 전에는 managed 를 조회하지 않는다', async () => {
    // 시드 신뢰로 바꾸면 이 자리에서 401 이 나간다 — 현행 `!!meQuery.data` 시멘틱을 고정한다.
    server.use(http.get(`${BASE}/users/me`, () => new Promise(() => {})));
    act(() => useAuthStore.setState({ status: 'authenticated', user: null }));
    latestQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOperatorAccess(), { wrapper: Wrapper });

    await flushPendingRequests();
    expect(requestedPaths).not.toContain(MANAGED_PATH);
    expect(result.current.isMeLoading).toBe(true);
    expect(result.current.canOperate).toBe(false);
  });
});
