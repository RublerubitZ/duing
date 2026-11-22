import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, favoriteQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { FavoriteClub, PageResponse } from '@duing/types';

vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => <nav data-testid="home-nav" /> }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
// 카드는 찜 토글(스토어·훅·분석)을 품는다 — 이 파일은 페이지 셸·페이지 이동만 본다.
vi.mock('@/app/me/favorites/_components/FavoriteClubCard', () => ({
  FavoriteClubCard: ({ favorite }: { favorite: FavoriteClub }) => <li>{favorite.name}</li>,
}));

import MyFavoritesPage from '@/app/me/favorites/page';

/**
 * 찜 목록 화면(#1580·#1579) — 페이지 이동, 첫 조회 실패 안내, 찜을 풀어 사라진 페이지 보정.
 * 실제 훅 + 실제 ApiClient + MSW(TanStack Query 는 모킹하지 않는다).
 */
const BASE = 'http://localhost:8080/api/v1';
const FAVORITES_URL = `${BASE}/me/favorites`;
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

const favorite = (clubId: number): FavoriteClub => ({
  clubId,
  name: `찜동아리${clubId}`,
  logoUrl: null,
  category: 'ACADEMIC',
  division: null,
  favoritedAt: '2026-05-17T01:23:45',
  openRecruitmentCount: 0,
});

/** 서버 쪽 찜 — 테스트가 바꾸면 다음 조회부터 반영된다(찜 해제 흉내). */
const serverFavorites: { list: FavoriteClub[] } = { list: [] };
/** 받은 요청의 page·size — 마이페이지와 같은 캐시 키(page=0·size=20)를 쓰는지 본다. */
const requestedPages: { page: string | null; size: string | null }[] = [];

function serveFavorites(count: number) {
  serverFavorites.list = Array.from({ length: count }, (_, index) => favorite(index + 1));
  server.use(
    http.get(FAVORITES_URL, ({ request }) => {
      const searchParams = new URL(request.url).searchParams;
      requestedPages.push({ page: searchParams.get('page'), size: searchParams.get('size') });
      const page = Number(searchParams.get('page'));
      const size = Number(searchParams.get('size'));
      const totalElements = serverFavorites.list.length;
      const favoriteList: PageResponse<FavoriteClub> = {
        content: serverFavorites.list.slice(page * size, (page + 1) * size),
        page,
        size,
        totalElements,
        totalPages: Math.ceil(totalElements / size),
        hasNext: (page + 1) * size < totalElements,
      };
      return HttpResponse.json({ ok: true, data: favoriteList, message: null });
    }),
  );
}

const serverError = () =>
  HttpResponse.json({ ok: false, data: null, message: '일시적인 오류가 발생했습니다.' }, { status: 500 });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  act(() => useAuthStore.setState({ status: 'authenticated' }));
});
afterEach(() => {
  server.resetHandlers();
  requestedPages.length = 0;
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
});
afterAll(() => server.close());

function providers(queryClient: QueryClient, children: ReactNode) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>{children}</ApiClientProvider>
    </QueryClientProvider>
  );
}

function renderPage(): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(providers(queryClient, <MyFavoritesPage />));
  return queryClient;
}

const cardCount = () => screen.queryAllByRole('listitem').length;
const pagination = () => screen.queryByRole('navigation', { name: '찜한 동아리 페이지' });

/**
 * 지금부터 화면에 한 번이라도 그려진 글자를 모은다 — 곧바로 다른 화면으로 바뀌는 한 프레임도 놓치지 않게(끝 상태만 보면 지나간 거짓 안내를 못 잡는다).
 * 새로 붙은 노드의 글자와, 바뀐 글자 노드의 이전 값까지 모은다(React 는 같은 자리의 글자를 노드를 바꾸지 않고 고쳐 쓴다).
 */
function recordRenderedText() {
  const renderedTexts: string[] = [];
  const collect = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.oldValue !== null) renderedTexts.push(record.oldValue);
      renderedTexts.push(record.target.textContent ?? '');
      record.addedNodes.forEach((addedNode) => renderedTexts.push(addedNode.textContent ?? ''));
    }
  };
  const observer = new MutationObserver(collect);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
  return {
    everRendered: (text: string) => {
      collect(observer.takeRecords());
      return renderedTexts.some((renderedText) => renderedText.includes(text));
    },
    stop: () => observer.disconnect(),
  };
}

async function goToPage(pageLabel: string) {
  const pageNav = pagination();
  if (pageNav === null) throw new Error('페이지 버튼이 없다');
  await userEvent.click(within(pageNav).getByRole('button', { name: pageLabel }));
}

describe('MyFavoritesPage — 셸·첫 페이지', () => {
  // 회귀 가드
  it('불러오는 동안 공통 상단바 안에 스켈레톤을 그린다', async () => {
    serveFavorites(1);
    renderPage();

    expect(screen.getByTestId('home-nav')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '찜한 동아리 불러오는 중' })).toBeInTheDocument();
    expect(await screen.findByText('찜동아리1')).toBeInTheDocument();
    expect(screen.getByTestId('home-nav')).toBeInTheDocument();
  });

  // 회귀 가드 — 정적 HTML 은 조회가 꺼져 있어 빈 상태가 실렸다(#1500). 하이드레이션 전에는 로딩으로 둔다.
  it('서버 렌더(정적 HTML)는 빈 상태 대신 로딩 스켈레톤이다', () => {
    const html = renderToString(providers(new QueryClient(), <MyFavoritesPage />));

    expect(html).not.toContain('아직 찜한 동아리가 없어요');
    expect(html).toContain('찜한 동아리 불러오는 중');
  });

  // 회귀 가드 — 지금도 훅 기본값이 (0, 20) 이다.
  it('첫 페이지를 마이페이지와 같은 크기(page=0·size=20)로 받는다', async () => {
    serveFavorites(1);
    renderPage();

    await screen.findByText('찜동아리1');
    expect(requestedPages).toEqual([{ page: '0', size: '20' }]);
  });

  // 회귀 가드
  it('찜이 하나도 없으면 공통 상단바 안에 빈 안내를 그린다', async () => {
    serveFavorites(0);
    renderPage();

    expect(await screen.findByText('아직 찜한 동아리가 없어요')).toBeInTheDocument();
    expect(screen.getByTestId('home-nav')).toBeInTheDocument();
  });

  it('첫 조회가 실패하면 빈 안내 대신 실패 안내와 다시 시도를 그리고, 다시 받으면 목록을 그린다', async () => {
    server.use(http.get(FAVORITES_URL, () => serverError()));
    renderPage();

    expect(await screen.findByText('찜한 동아리를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.getByTestId('home-nav')).toBeInTheDocument();
    expect(screen.queryByText('아직 찜한 동아리가 없어요')).not.toBeInTheDocument();

    serveFavorites(1);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('찜동아리1')).toBeInTheDocument();
  });
});

describe('MyFavoritesPage — 페이지 이동', () => {
  it('찜이 한 페이지보다 많으면 페이지 버튼으로 나머지를 본다', async () => {
    serveFavorites(25);
    renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    expect(screen.getByTestId('home-nav')).toBeInTheDocument();

    await goToPage('2');

    await waitFor(() => expect(cardCount()).toBe(5));
    expect(screen.getByText('찜동아리21')).toBeInTheDocument();
    expect(requestedPages.at(-1)).toEqual({ page: '1', size: '20' });
  });

  it('페이지를 바꾼 직후 조회가 실패하면 빈 안내 대신 실패 안내, 다시 시도로 그 페이지를 받는다', async () => {
    serveFavorites(25);
    renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    server.use(http.get(FAVORITES_URL, () => serverError()));

    await goToPage('2');

    expect(await screen.findByText('찜한 동아리를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByText('아직 찜한 동아리가 없어요')).not.toBeInTheDocument();

    serveFavorites(25);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(cardCount()).toBe(5));
    expect(requestedPages.at(-1)).toEqual({ page: '1', size: '20' });
  });

  it('마지막 페이지의 마지막 찜이 풀리면 마지막 유효 페이지로 돌아간다 — 빈 쪽에 갇히거나 거짓 빈 안내를 그리지 않는다', async () => {
    serveFavorites(21);
    const queryClient = renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    await goToPage('2');
    await waitFor(() => expect(cardCount()).toBe(1));

    // 보정 전 한 프레임(이 쪽은 비었지만 전체는 남음)에 거짓 빈 안내가 스치는지까지 본다 — 끝 상태만 보면 놓친다.
    const renderedText = recordRenderedText();

    // 이 화면의 하트로 찜을 풀면 서버에서 빠지고 찜 목록 전체가 무효화된다(favorites.ts onSettled) — 카드 목을 쓰므로 그 둘을 직접 한다.
    serverFavorites.list = serverFavorites.list.slice(0, 20);
    await act(() => queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all }));

    await waitFor(() => expect(cardCount()).toBe(20));
    // 0쪽의 옛 캐시(총 2쪽)가 먼저 그려져 페이지 버튼이 다시 받을 때까지 잠깐 남는다(받아들인 동작, 스펙 3.5) — 사라질 때까지 기다린다.
    await waitFor(() => expect(pagination()).not.toBeInTheDocument());
    expect(renderedText.everRendered('아직 찜한 동아리가 없어요')).toBe(false);
    renderedText.stop();
  });

  it('3쪽의 마지막 찜이 풀리면 첫 쪽이 아니라 그 앞 쪽(2쪽)으로 옮긴다', async () => {
    serveFavorites(41);
    const queryClient = renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    await goToPage('3');
    await waitFor(() => expect(cardCount()).toBe(1));
    expect(screen.getByText('찜동아리41')).toBeInTheDocument();

    serverFavorites.list = serverFavorites.list.slice(0, 40);
    await act(() => queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all }));

    // 마지막 유효 페이지는 2쪽(21~40) — 첫 쪽(1~20)으로 가면 보던 자리에서 멀어진다.
    expect(await screen.findByText('찜동아리21')).toBeInTheDocument();
    expect(cardCount()).toBe(20);
    expect(screen.queryByText('찜동아리1')).not.toBeInTheDocument();
    expect(requestedPages.at(-1)).toEqual({ page: '1', size: '20' });
  });

  it('2쪽을 보다 찜이 전부 풀리면 빈 안내를 그린다 — 보정이 돌지 않는다', async () => {
    serveFavorites(21);
    const queryClient = renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    await goToPage('2');
    await waitFor(() => expect(cardCount()).toBe(1));

    serverFavorites.list = [];
    await act(() => queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all }));

    expect(await screen.findByText('아직 찜한 동아리가 없어요')).toBeInTheDocument();
    // 총 0쪽이면 보정하지 않는다 — 1쪽 요청이 다시 나가지 않는다(마지막 요청이 2쪽 재조회).
    expect(requestedPages.at(-1)).toEqual({ page: '1', size: '20' });
  });
});
