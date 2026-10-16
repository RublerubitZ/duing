import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { ClubSummary, PageResponse } from '@duing/types';

import { clearNavigationPending } from '@/app/_lib/backDismiss';

/**
 * 목록 가드(스펙 P1 §3.3) — 인터셉트 상세(/clubs/<id>)가 열린 동안 숨은 목록은 그 주소의 빈 쿼리로 다시 받지 않고(동결), 주소도
 * 바꾸지 않는다(replace 가 상세를 닫는다). 탐색 주소로 돌아오면 다시 live 쿼리·replace 다. 경로·쿼리는 실제 라우터처럼 함께 바뀐다.
 */
const { navigation, routerMock, replaceCalls } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const calls: string[] = [];
  const state = {
    pathname: '/clubs',
    search: '',
    listeners,
    emit: () => listeners.forEach((listener) => listener()),
  };
  return {
    navigation: state,
    replaceCalls: calls,
    routerMock: {
      replace: (href: string) => {
        calls.push(href);
        const queryIndex = href.indexOf('?');
        state.search = queryIndex === -1 ? '' : href.slice(queryIndex + 1);
        state.emit();
      },
      push: () => {},
      prefetch: () => {},
    },
  };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    navigation.listeners.add(listener);
    return () => {
      navigation.listeners.delete(listener);
    };
  };
  const readPathname = () => navigation.pathname;
  const readSearch = () => navigation.search;
  return {
    usePathname: () => useSyncExternalStore(subscribe, readPathname, readPathname),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, readSearch, readSearch)),
    useSelectedLayoutSegment: () => null,
    useRouter: () => routerMock,
  };
});

vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

import { ClubExplorePage } from '@/app/clubs/_pages/ClubExplorePage';

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

function toPage(content: ClubSummary[]): PageResponse<ClubSummary> {
  return { content, page: 1, size: 20, totalElements: content.length, totalPages: 1, hasNext: false };
}

/** 이 스위트에서 나간 목록 요청의 쿼리 문자열 — 숨은 동안 기본 조건으로 다시 받았는지 본다. */
const listRequestSearches: string[] = [];
const trackRequest = ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  if (url.pathname === '/api/v1/clubs') listRequestSearches.push(url.search);
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', trackRequest);
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  listRequestSearches.length = 0;
  replaceCalls.length = 0;
  navigation.pathname = '/clubs';
  navigation.search = '';
  navigation.listeners.clear();
  // useGuardedRouter 의 replace 가 세운 이동 예약(실 8초 타이머)을 비운다(member-access-guard.test 와 같은 정리).
  clearNavigationPending();
});
afterAll(() => {
  server.events.removeListener('request:start', trackRequest);
  server.close();
});

function serveClubLists() {
  server.use(
    http.get(`${BASE}/clubs`, ({ request }) => {
      const isArtFilter = new URL(request.url).search.includes('ART');
      return HttpResponse.json({ ok: true, data: toPage(isArtFilter ? ART_CLUBS : ALL_CLUBS), message: null });
    }),
  );
}

function renderExplore() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>{children}</ApiClientProvider>
      </QueryClientProvider>
    );
  }
  return render(
    <Wrapper>
      <ClubExplorePage />
    </Wrapper>,
  );
}

// 실제 라우터처럼 경로·쿼리가 한 번에 바뀐다(인터셉트 진입 = /clubs/<id> + 빈 쿼리, 복귀 = 목록 주소 + 원래 쿼리).
const goTo = (pathname: string, search: string) =>
  act(() => {
    navigation.pathname = pathname;
    navigation.search = search;
    navigation.emit();
  });

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

describe('ClubExplorePage — 목록 가드(스펙 P1 §3.3)', () => {
  it('인터셉트 상세 주소(/clubs/<id>)로 바뀌어도 숨은 목록은 마지막 목록 쿼리를 유지한다 — 기본 조건으로 다시 받지 않는다', async () => {
    serveClubLists();
    navigation.search = 'category=ART';
    renderExplore();
    await waitFor(() => expect(screen.getAllByText('연극부').length).toBeGreaterThan(0));
    const requestsBeforeIntercept = listRequestSearches.length;

    goTo('/clubs/3', '');
    await settle();

    expect(listRequestSearches.slice(requestsBeforeIntercept)).toEqual([]);
    expect(screen.getAllByText('연극부').length).toBeGreaterThan(0);
    expect(screen.queryByText('밴드부')).toBeNull();
  });

  it('숨은 동안은 필터를 눌러도 주소를 바꾸지 않고, 목록 주소로 돌아오면(끝 슬래시 /clubs/ 포함) 다시 바꾼다', async () => {
    serveClubLists();
    navigation.search = 'category=ART';
    renderExplore();
    await waitFor(() => expect(screen.getAllByText('연극부').length).toBeGreaterThan(0));

    goTo('/clubs/3', '');
    await userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: '운동' }));
    expect(replaceCalls).toEqual([]);

    // 끝 슬래시 — skipTrailingSlashRedirect 라 리다이렉트 없이 그대로 서빙된다(정규화 훅이 /clubs 로 접는다).
    goTo('/clubs/', 'category=ART');
    await userEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: '운동' }));
    expect(replaceCalls).toEqual(['/clubs?category=SPORTS']);
  });

  it('숨은 동안 도착한 늦은 응답이 page 보정을 깨워도 replace 하지 않고(상세 유지), 목록 주소로 돌아온 뒤 한 번 보정한다', async () => {
    let releaseLatePage: () => void = () => {};
    const latePageReleased = new Promise<void>((resolve) => {
      releaseLatePage = resolve;
    });
    server.use(
      http.get(`${BASE}/clubs`, async ({ request }) => {
        // 3쪽 목록(API page=2)만 붙잡는다 — 모집 중 카운트(page=0·size=1)는 그대로 답한다.
        if (new URL(request.url).searchParams.get('page') === '2') {
          await latePageReleased;
          return HttpResponse.json({ ok: true, data: { ...toPage(ALL_CLUBS), page: 2, totalPages: 1 }, message: null });
        }
        return HttpResponse.json({ ok: true, data: toPage(ALL_CLUBS), message: null });
      }),
    );
    navigation.search = 'page=3';
    renderExplore();
    await waitFor(() => expect(listRequestSearches.some((search) => search.includes('page=2'))).toBe(true));

    // 대기가 실패해도 붙잡은 응답을 푼다 — 안 풀면 요청이 케이스가 끝난 뒤에도 남는다.
    try {
      goTo('/clubs/3', '');
    } finally {
      releaseLatePage();
    }
    await waitFor(() => expect(screen.getAllByText('밴드부').length).toBeGreaterThan(0));
    await settle();
    expect(replaceCalls).toEqual([]);

    goTo('/clubs', 'page=3');
    await waitFor(() => expect(replaceCalls).toEqual(['/clubs']));
  });
});
