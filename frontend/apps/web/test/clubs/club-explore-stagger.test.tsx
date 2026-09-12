import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { ClubSummary, PageResponse } from '@duing/types';

/**
 * 탐색 화면의 첫 로드 스태거와 모바일 카테고리 탭 인디케이터(§PR-4).
 * - 스태거는 첫 데이터가 도착한 1회에만 붙는다. 필터 변경은 반복 액션이라 제외한다.
 * - 카테고리 인디케이터는 활성 항목 안에만 1개 있고, 활성이 바뀌면 그쪽으로 옮겨간다.
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
  server.resetHandlers();
  navStore.search = '';
  navStore.listeners.clear();
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
});
afterAll(() => server.close());

function renderExplore() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

// PC 그리드와 모바일 리스트가 같은 트리에 함께 렌더된다(CSS 로만 감춘다) — 래퍼는 항상 동아리 수 × 2 다.
const staggerWrappers = () => Array.from(document.querySelectorAll<HTMLElement>('.enter-stagger'));

describe('ClubExplorePage — 첫 로드 스태거', () => {
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
});

describe('ClubExplorePage — 모바일 카테고리 탭 인디케이터', () => {
  it('활성 카테고리 안에만 1개 있고 다른 카테고리를 누르면 옮겨간다', async () => {
    server.use(clubListHandler);
    renderExplore();

    const rail = within(screen.getByRole('navigation'));
    const allTab = rail.getByRole('button', { name: '전체' });
    const artTab = rail.getByRole('button', { name: '예술' });

    expect(document.querySelectorAll('[data-tab-indicator]')).toHaveLength(1);
    expect(allTab.querySelector('[data-tab-indicator]')).not.toBeNull();

    await userEvent.click(artTab);

    await waitFor(() => expect(artTab.querySelector('[data-tab-indicator]')).not.toBeNull());
    expect(document.querySelectorAll('[data-tab-indicator]')).toHaveLength(1);
    expect(allTab.querySelector('[data-tab-indicator]')).toBeNull();
  });
});
