import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { delay, http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { ClubSummary, PageResponse } from '@duing/types';

/**
 * 탐색 목록의 등장 스태거.
 * 앞으로 들어온 마운트(첫 로드·앱 안 이동)거나 데이터 없이 마운트해 스켈레톤을 거친 첫 목록이 정착할 때 붙는다.
 * 뒤로·앞으로 가기(마커)로 그려진 마운트와, 서버 목록(fallback)을 바꿔 끼우는 교체 마운트는 제외한다.
 * 붙은 뒤에는 재생 시간(STAGGER_WINDOW_MS) 동안 같은 조건의 재요청에도 유지되고, 시간이 지나면 떨어진다.
 * 필터·정렬·페이지 변경은 반복 액션이라 붙지 않는다.
 */

// 실제 라우터처럼 replace 가 URL 을 바꾸면 화면이 다시 그려지게 만든다 — 그래야 카테고리 클릭이
// 곧 필터 변경이 되어 "같은 마운트에서 재조회" 를 검증할 수 있다.
const { navStore } = vi.hoisted(() => ({
  navStore: { search: '', listeners: new Set<() => void>() },
}));

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (onStoreChange: () => void) => {
    navStore.listeners.add(onStoreChange);
    return () => {
      navStore.listeners.delete(onStoreChange);
    };
  };
  const readSearch = () => navStore.search;
  return {
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(subscribe, readSearch, readSearch)),
    useRouter: () => ({
      replace: (href: string) => {
        const queryIndex = href.indexOf('?');
        navStore.search = queryIndex === -1 ? '' : href.slice(queryIndex + 1);
        navStore.listeners.forEach((listener) => listener());
      },
      push: () => {},
      prefetch: () => {},
    }),
  };
});

vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

import { ClubExplorePage } from '@/app/clubs/_pages/ClubExplorePage';
import { DEFAULT_EXPLORE_PARAMS, EXPLORE_PAGE_SIZE, toApiParams } from '@/app/clubs/_lib/exploreParams';
import { STAGGER_WINDOW_MS } from '@/app/clubs/_lib/exploreUi';

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

function makeClub(id: number, name: string, category: ClubSummary['category']): ClubSummary {
  return {
    id,
    name,
    category,
    division: '예술분과',
    college: null,
    department: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    tagline: null,
    centralClub: true,
    activeRecruitment: null,
  };
}

const ALL_CLUBS = [makeClub(1, '밴드부', 'ART'), makeClub(2, '등산부', 'SPORTS')];
const ART_CLUBS = [makeClub(3, '연극부', 'ART')];
const DEFAULT_LIST_KEY = clubQueryKeys.list(toApiParams(DEFAULT_EXPLORE_PARAMS, EXPLORE_PAGE_SIZE));

function toPage(content: ClubSummary[]): PageResponse<ClubSummary> {
  return { content, page: 1, size: 20, totalElements: content.length, totalPages: 1, hasNext: false };
}

// 카테고리 파라미터의 키 이름에 묶이지 않도록 쿼리스트링에 ART 가 들어갔는지로 분기한다.
const clubListHandler = http.get(`${BASE}/clubs`, ({ request }) => {
  const isArtFilter = new URL(request.url).search.includes('ART');
  return HttpResponse.json({
    ok: true,
    data: toPage(isArtFilter ? ART_CLUBS : ALL_CLUBS),
    message: null,
  });
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  navStore.search = '';
  navStore.listeners.clear();
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
  document.documentElement.removeAttribute('data-back-navigation');
  document.querySelectorAll('[data-explore-server-list]').forEach((element) => element.remove());
  vi.useRealTimers();
});
afterAll(() => server.close());

function renderExplore(seed?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  seed?.(queryClient);
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>{children}</ApiClientProvider>
      </QueryClientProvider>
    );
  }
  return {
    queryClient,
    ...render(
      <Wrapper>
        <ClubExplorePage />
      </Wrapper>,
    ),
  };
}

/** 서버가 시드한 첫 진입 키 — updatedAt 0 이라 마운트 때 곧바로 다시 받는다(운영과 같음). */
const seedDefaultList = (queryClient: QueryClient) =>
  queryClient.setQueryData(DEFAULT_LIST_KEY, toPage(ALL_CLUBS), { updatedAt: 0 });

// PC 그리드와 모바일 리스트가 같은 트리에 함께 렌더된다(CSS 로만 감춘다) — 래퍼는 항상 동아리 수 × 2 다.
const staggerWrappers = () => Array.from(document.querySelectorAll<HTMLElement>('.enter-stagger'));

describe('ClubExplorePage — 등장 스태거', () => {
  it('첫 데이터가 도착하면 카드 래퍼에 스태거와 순번(--i)이 붙는다', async () => {
    server.use(clubListHandler);
    renderExplore();

    await waitFor(() => expect(staggerWrappers()).toHaveLength(4));
    expect(staggerWrappers().map((wrapper) => wrapper.style.getPropertyValue('--i'))).toEqual([
      '0',
      '1',
      '0',
      '1',
    ]);
  });

  it('같은 마운트에서 카테고리를 바꿔 재조회하면 스태거가 붙지 않는다', async () => {
    server.use(clubListHandler);
    renderExplore();
    await waitFor(() => expect(staggerWrappers()).toHaveLength(4));

    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: '예술' }),
    );

    await waitFor(() => expect(screen.getAllByText('연극부').length).toBeGreaterThan(0));
    expect(staggerWrappers()).toHaveLength(0);
  });

  it('시드·캐시로 첫 렌더부터 목록이 있어도 앞으로 들어온 마운트면 스태거를 붙인다', async () => {
    server.use(clubListHandler);
    const { queryClient } = renderExplore(seedDefaultList);

    expect(staggerWrappers()).toHaveLength(4);
    // 시드가 있으면 스켈레톤은 뜨지 않는다 — TanStack 은 data 가 없을 때만 pending 이다(라이브러리 의미 변화 감지).
    expect(screen.queryByRole('status')).toBeNull();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });

  it('마운트 순간 서버 목록(fallback)이 문서에 있으면 스태거를 붙이지 않는다 — 첫 화면에서 이미 떠오른 카드를 바꿔 끼우는 교체다', async () => {
    const serverList = document.createElement('div');
    serverList.setAttribute('data-explore-server-list', '');
    document.body.appendChild(serverList);
    server.use(clubListHandler);
    const { queryClient } = renderExplore(seedDefaultList);

    expect(screen.getAllByText('밴드부').length).toBeGreaterThan(0);
    expect(staggerWrappers()).toHaveLength(0);
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });

  it('뒤로·앞으로 가기로 그려지는 마운트(마커)는 시드·캐시가 있으면 스태거를 붙이지 않는다', async () => {
    document.documentElement.setAttribute('data-back-navigation', '');
    server.use(clubListHandler);
    const { queryClient } = renderExplore(seedDefaultList);

    expect(screen.getAllByText('밴드부').length).toBeGreaterThan(0);
    expect(staggerWrappers()).toHaveLength(0);
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });

  it('마커가 서 있어도 데이터 없이 마운트했다면 첫 목록 도착 때 스태거를 붙인다 — 기다림을 거친 도착이다', async () => {
    document.documentElement.setAttribute('data-back-navigation', '');
    server.use(clubListHandler);
    renderExplore();

    await waitFor(() => expect(staggerWrappers()).toHaveLength(4));
  });

  it('재생 시간 안에 같은 조건의 재요청이 다른 목록 객체를 돌려줘도 스태거를 떼지 않는다', async () => {
    vi.useFakeTimers();
    server.use(clubListHandler);
    // 시드는 역순, 마운트 재요청(msw)은 원래 순서 — 같은 조건에 다른 객체가 도착한다(운영의 "시드보다 새 순서·수치").
    const { queryClient } = renderExplore((client) =>
      client.setQueryData(DEFAULT_LIST_KEY, toPage([...ALL_CLUBS].reverse()), { updatedAt: 0 }),
    );
    expect(staggerWrappers()).toHaveLength(4);
    expect(staggerWrappers()[0]).toHaveTextContent('등산부');

    // 가짜 시계를 재생 시간 직전까지만 돌린다 — 재요청 응답과 React Query 통지(setTimeout 0)는 그 안에 흘러 화면에
    // 반영되지만 재생 시간 타이머는 아직이다. 실제 시간과 무관해 느린 러너에서도 같다.
    await act(() => vi.advanceTimersByTimeAsync(STAGGER_WINDOW_MS - 1));
    expect(queryClient.isFetching()).toBe(0);
    // 목록 객체 동일성 게이트였다면 여기서 클래스가 떨어져 [0] 이 없어 실패한다.
    expect(staggerWrappers()[0]).toHaveTextContent('밴드부');
    expect(staggerWrappers()).toHaveLength(4);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(staggerWrappers()).toHaveLength(0);
  });

  it('재생 시간이 지나면 스태거를 떼고, 그 뒤 같은 조건의 재요청이 순서를 바꿔도 다시 붙이지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 마운트 재요청 응답을 재생 시간 뒤(700ms)로 못 박는다 — 시드와 순서가 다른(다른 객체) 응답이다.
    server.use(
      http.get(`${BASE}/clubs`, async () => {
        await delay(700);
        return HttpResponse.json({ ok: true, data: toPage([...ALL_CLUBS].reverse()), message: null });
      }),
    );
    const { queryClient } = renderExplore(seedDefaultList);
    expect(staggerWrappers()).toHaveLength(4);

    act(() => {
      vi.advanceTimersByTime(STAGGER_WINDOW_MS);
    });
    expect(staggerWrappers()).toHaveLength(0);

    // 응답 지연(700ms)을 넘겨 재요청을 끝내고, 통지(setTimeout 0)까지 흘린다.
    await act(() => vi.advanceTimersByTimeAsync(200));
    // 데스크탑 그리드(aria-busy 컨테이너)의 첫 카드 래퍼 — 역순 응답이 화면에 반영됐다.
    await waitFor(() => expect(document.querySelector('[aria-busy] > div')).toHaveTextContent('등산부'));
    expect(staggerWrappers()).toHaveLength(0);
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });

  it('찜 필터 딥링크가 인증 대기로 마운트했다가 인증 뒤 첫 목록이 도착하면 스태거를 붙인다 — 쿼리가 꺼진 채 데이터 없이 시작한 첫 도착이다', async () => {
    server.use(
      clubListHandler,
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ ok: true, data: { clubIds: [1, 2] }, message: null }),
      ),
    );
    navStore.search = 'favorite=true';
    renderExplore();
    // 마운트 때는 미인증이라 목록 쿼리가 꺼져 있다(로딩이 아닌 대기) — 로그인 안내만 보인다.
    expect(screen.getAllByText('찜한 동아리를 보려면 로그인해 주세요.')).toHaveLength(2);

    act(() => useAuthStore.setState({ status: 'authenticated' }));

    await waitFor(() => expect(screen.getAllByText('밴드부').length).toBeGreaterThan(0));
    expect(staggerWrappers()).toHaveLength(4);
  });
});
