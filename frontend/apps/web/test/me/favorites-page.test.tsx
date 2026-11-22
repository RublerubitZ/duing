import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, favoriteQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';
import type { FavoriteClub, PageResponse } from '@duing/types';

vi.mock('@/app/_components/HomeNav', () => ({ HomeNav: () => <nav data-testid="home-nav" /> }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
// /me 가드(MeAuthGuard)로 감싸는 테스트가 있다 — 가드가 로그인 유도 링크에 지금 경로를 싣는다.
vi.mock('next/navigation', () => ({ usePathname: () => '/me/favorites' }));
// 카드는 찜 토글(스토어·훅·분석)을 품는다 — 이 파일은 페이지 셸·페이지 이동만 본다.
vi.mock('@/app/me/favorites/_components/FavoriteClubCard', () => ({
  FavoriteClubCard: ({ favorite }: { favorite: FavoriteClub }) => <li>{favorite.name}</li>,
}));

import { MeAuthGuard } from '@/app/me/_components/MeAuthGuard';
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

/** 받은 요청의 page·size 를 남기고 숫자로 돌려준다. */
function recordRequest(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const requested = { page: searchParams.get('page'), size: searchParams.get('size') };
  requestedPages.push(requested);
  return { page: Number(requested.page), size: Number(requested.size) };
}

/** 지금 서버 찜으로 한 쪽을 만든다. */
function favoritePageResponse(page: number, size: number) {
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
}

function serveFavorites(count: number) {
  serverFavorites.list = Array.from({ length: count }, (_, index) => favorite(index + 1));
  server.use(
    http.get(FAVORITES_URL, ({ request }) => {
      const { page, size } = recordRequest(request);
      return favoritePageResponse(page, size);
    }),
  );
}

type Gate = { opened: Promise<void>; open: () => void };

/** 붙잡아 둔 응답을 테스트가 원하는 때에 연다 — 받는 중 화면을 결과보다 먼저 본다. */
function createGate(): Gate {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

/** heldPage 요청만 관문에서 붙잡았다가 열린 뒤 outcome 대로 답한다. 다른 쪽은 지금 서버 찜으로 바로 답한다. */
function holdFavoritesPage(heldPage: number, gate: Gate, outcome: 'ok' | 'fail') {
  server.use(
    http.get(FAVORITES_URL, async ({ request }) => {
      const { page, size } = recordRequest(request);
      if (page === heldPage) {
        await gate.opened;
        if (outcome === 'fail') return serverError();
      }
      return favoritePageResponse(page, size);
    }),
  );
}

/** 그 쪽(page 쿼리) 요청 수. */
const requestCountFor = (page: number) => requestedPages.filter((requested) => requested.page === String(page)).length;

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
    // 첫 쪽이면 돌아갈 쪽이 없다 — '첫 페이지로'는 2쪽 이후의 실패에만 둔다(#1756).
    expect(screen.queryByRole('button', { name: '첫 페이지로' })).not.toBeInTheDocument();

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

  it('보정 뒤 남은 옛 2쪽 캐시로 다시 1쪽에 튕기지 않는다 — 다시 받는 중에는 보정을 판단하지 않는다', async () => {
    serveFavorites(21);
    const queryClient = renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    await goToPage('2');
    await waitFor(() => expect(cardCount()).toBe(1));

    // 2쪽의 마지막 찜을 풀어 1쪽으로 보정된다 — 2쪽 키에는 빈 쪽(총 1쪽) 캐시가 남는다.
    // 페이지 버튼은 2쪽의 빈 프레임에서도 잠깐 사라지므로, 1쪽 카드가 보이고 다시 받기가 모두 끝날 때까지 기다린다.
    serverFavorites.list = serverFavorites.list.slice(0, 20);
    await act(() => queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all }));
    await waitFor(() => expect(cardCount()).toBe(20));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(pagination()).not.toBeInTheDocument();

    // 다른 곳에서 찜이 다시 늘어 1쪽을 다시 받으면 페이지 버튼이 돌아온다 — 2쪽 캐시는 비활성이라 무효 표시만 되고 다시 받지 않는다.
    serverFavorites.list = Array.from({ length: 21 }, (_, index) => favorite(index + 1));
    await act(() => queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all }));
    await waitFor(() => expect(pagination()).toBeInTheDocument());
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(queryClient.getQueryData<PageResponse<FavoriteClub>>(favoriteQueryKeys.list(1, 20))?.content).toEqual([]);

    await goToPage('2');

    // 다시 받는 동안 먼저 나오는 옛 캐시(빈 쪽·총 1쪽)를 새 데이터로 착각해 보정하면 1쪽으로 튕겨 찜동아리21 이 끝내 안 보인다.
    expect(await screen.findByText('찜동아리21')).toBeInTheDocument();
    expect(cardCount()).toBe(1);
    expect(screen.queryByText('찜동아리1')).not.toBeInTheDocument();
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

describe('MyFavoritesPage — 이전 쪽 유지·첫 페이지로·다시 받는 동안 잠금(#1756)', () => {
  const pageNav = () => screen.getByRole('navigation', { name: '찜한 동아리 페이지' });

  it('처음 가는 쪽으로 옮기는 동안 이전 쪽과 페이지 버튼을 남기고, 누른 번호에 포커스가 남는다', async () => {
    serveFavorites(25);
    renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    const secondPageGate = createGate();
    holdFavoritesPage(1, secondPageGate, 'ok');

    await goToPage('2');

    expect(within(pageNav()).getByRole('button', { name: '2' })).toHaveFocus();
    expect(cardCount()).toBe(20);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('status', { name: '찜한 동아리 불러오는 중' })).not.toBeInTheDocument();
    // 키가 바뀌면 isFetchedAfterMount 의 기준이 새 쪽으로 잡힌다 — 일반 이동은 다시 받는 중이 아니다.
    expect(screen.queryByRole('button', { name: '다시 불러오는 중' })).not.toBeInTheDocument();

    secondPageGate.open();

    await waitFor(() => expect(cardCount()).toBe(5));
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'false');
  });

  it('쪽을 옮긴 직후 실패하면 실패 안내 아래 첫 페이지로가 있고, 누르면 첫 페이지 목록으로 돌아간다', async () => {
    serveFavorites(25);
    renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    server.use(http.get(FAVORITES_URL, () => serverError()));

    await goToPage('2');

    expect(await screen.findByText('찜한 동아리를 불러오지 못했어요.')).toBeInTheDocument();
    serveFavorites(25);
    await userEvent.click(screen.getByRole('button', { name: '첫 페이지로' }));

    await waitFor(() => expect(cardCount()).toBe(20));
    expect(screen.getByText('찜동아리1')).toBeInTheDocument();
    expect(pagination()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '첫 페이지로' })).not.toBeInTheDocument();
  });

  // 가드 — 이전 쪽 유지만 넣고 빈 자리표시 규칙을 빼면 제목 아래 빈 격자가 받는 동안 남는다.
  it('보정으로 옮긴 쪽의 캐시가 없어 이전 쪽 자리표시가 빈 쪽이면, 빈 격자 대신 스켈레톤으로 받는다', async () => {
    serveFavorites(21);
    const queryClient = renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    await goToPage('2');
    await waitFor(() => expect(cardCount()).toBe(1));

    // 1쪽 캐시가 gc 로 지워진 것을 흉내 낸다 — 보정으로 1쪽에 갈 때 보여 줄 캐시가 없다.
    queryClient.removeQueries({ queryKey: favoriteQueryKeys.list(0, 20) });
    const firstPageGate = createGate();
    holdFavoritesPage(0, firstPageGate, 'ok');
    serverFavorites.list = serverFavorites.list.slice(0, 20);
    await act(() => queryClient.invalidateQueries({ queryKey: favoriteQueryKeys.all }));

    // 2쪽이 빈 쪽(총 1쪽)으로 돌아와 1쪽으로 보정되고, 1쪽 응답은 관문에 걸려 있다.
    expect(await screen.findByRole('status', { name: '찜한 동아리 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '찜한 동아리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    firstPageGate.open();

    await waitFor(() => expect(cardCount()).toBe(20));
  });

  it('쪽을 옮긴 직후 실패한 뒤 다시 시도하면, 받는 동안 실패 안내를 두고 같은 버튼만 잠근다', async () => {
    serveFavorites(25);
    renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    server.use(http.get(FAVORITES_URL, () => serverError()));
    await goToPage('2');
    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    // 결과를 바로 돌려주면 받는 중과 실패 알림이 합쳐져 잠긴 화면이 그려지지 않는다 — 관문으로 붙잡는다.
    const retryGate = createGate();
    holdFavoritesPage(1, retryGate, 'fail');

    await userEvent.click(retryButton);

    // 다시 받는 동안 data 는 1쪽 자리표시다 — 그래도 목록이 아니라 실패 안내를 둔다.
    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toHaveFocus();
    expect(screen.getByText('찜한 동아리를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '첫 페이지로' })).toBeInTheDocument();
    expect(cardCount()).toBe(0);
    expect(pagination()).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '찜한 동아리 불러오는 중' })).not.toBeInTheDocument();

    // 가드 — 데이터 없이 받는 중이라 다시 불러도 진행 중 요청으로 합쳐진다. 잠금이 없어도 통과한다.
    const secondPageRequests = requestCountFor(1);
    await userEvent.click(retryButton);
    expect(requestCountFor(1)).toBe(secondPageRequests);

    retryGate.open();

    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 시도'));
    expect(retryButton).not.toHaveAttribute('aria-disabled');
    expect(retryButton).toHaveFocus();

    serveFavorites(25);
    await userEvent.click(retryButton);

    await waitFor(() => expect(cardCount()).toBe(5));
  });

  it('첫 조회가 실패한 뒤 다시 시도하면, 받은 쪽이 없어도 받는 동안 실패 안내를 두고 같은 버튼만 잠근다', async () => {
    server.use(http.get(FAVORITES_URL, () => serverError()));
    renderPage();
    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    serveFavorites(1);
    const retryGate = createGate();
    holdFavoritesPage(0, retryGate, 'ok');

    await userEvent.click(retryButton);

    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toHaveFocus();
    expect(screen.queryByRole('button', { name: '첫 페이지로' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '찜한 동아리 불러오는 중' })).not.toBeInTheDocument();

    retryGate.open();

    expect(await screen.findByText('찜동아리1')).toBeInTheDocument();
  });

  it('실패했던 쪽으로 다시 옮기면 다시 받는 중이 아니라 이전 쪽을 흐리게 남긴 채 받는다', async () => {
    serveFavorites(25);
    renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    server.use(http.get(FAVORITES_URL, () => serverError()));
    await goToPage('2');
    await screen.findByText('찜한 동아리를 불러오지 못했어요.');
    serveFavorites(25);
    await userEvent.click(screen.getByRole('button', { name: '첫 페이지로' }));
    await waitFor(() => expect(cardCount()).toBe(20));
    const secondPageGate = createGate();
    holdFavoritesPage(1, secondPageGate, 'ok');

    await goToPage('2');

    // 실패 캐시가 남은 키로 옮겨도 키가 바뀌면 기준이 새로 잡힌다 — 판정을 errorUpdateCount 로 바꾸면 여기서 잠긴다.
    expect(screen.queryByRole('button', { name: '다시 불러오는 중' })).not.toBeInTheDocument();
    expect(screen.queryByText('찜한 동아리를 불러오지 못했어요.')).not.toBeInTheDocument();
    expect(cardCount()).toBe(20);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(pagination()).toBeInTheDocument();

    secondPageGate.open();

    await waitFor(() => expect(cardCount()).toBe(5));
  });

  it('옮기는 동안 다른 번호를 또 누르면 마지막에 누른 쪽을 그리고, 늦게 온 앞 쪽 응답이 화면을 바꾸지 않는다', async () => {
    serveFavorites(65);
    const queryClient = renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    const secondPageGate = createGate();
    holdFavoritesPage(1, secondPageGate, 'ok');

    await goToPage('2');
    await goToPage('3');

    expect(within(pageNav()).getByRole('button', { name: '3' })).toHaveFocus();
    expect(await screen.findByText('찜동아리41')).toBeInTheDocument();

    secondPageGate.open();

    // 늦게 끝난 2쪽 응답은 2쪽 캐시에만 들어간다.
    await waitFor(() => expect(queryClient.getQueryData(favoriteQueryKeys.list(1, 20))).toBeDefined());
    expect(screen.getByText('찜동아리41')).toBeInTheDocument();
    expect(screen.queryByText('찜동아리21')).not.toBeInTheDocument();
  });

  it('다시 받는 중에 첫 페이지로를 누르면 1쪽 목록이 남고, 늦게 끝난 2쪽 응답이 화면을 바꾸지 않는다', async () => {
    serveFavorites(25);
    const queryClient = renderPage();
    await waitFor(() => expect(cardCount()).toBe(20));
    server.use(http.get(FAVORITES_URL, () => serverError()));
    await goToPage('2');
    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    const retryGate = createGate();
    holdFavoritesPage(1, retryGate, 'ok');
    await userEvent.click(retryButton);
    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');

    // '첫 페이지로'는 잠그지 않는다.
    await userEvent.click(screen.getByRole('button', { name: '첫 페이지로' }));

    await waitFor(() => expect(cardCount()).toBe(20));
    retryGate.open();
    await waitFor(() => expect(queryClient.getQueryData(favoriteQueryKeys.list(1, 20))).toBeDefined());
    expect(screen.getByText('찜동아리1')).toBeInTheDocument();
    expect(screen.queryByText('찜동아리21')).not.toBeInTheDocument();
  });

  // 공통식이 isFetching 이 아니라 fetchStatus 인 이유 — 재시도 대기 뒤 포커스가 없으면 TanStack 이 멈추고(fetchStatus
  // 'paused') 그동안 isFetching 은 거짓이다. isFetching 으로 되돌리면 멈춘 동안 이전 쪽 자리표시 목록이 그려져 이 테스트가 실패한다.
  it('다시 받다 재시도 대기에서 멈춰도(탭을 가림) 실패 안내와 같은 잠긴 버튼을 둔다', async () => {
    onTestFinished(() => focusManager.setFocused(undefined));
    serveFavorites(25);
    // 이 테스트만 앱처럼 빠른 실패를 1회 다시 시도한다(대기 0). 포커스 복귀로 일제 재조회가 끼지 않게 앱 설정처럼 끈다.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0, networkMode: 'always', refetchOnWindowFocus: false } },
    });
    render(providers(queryClient, <MyFavoritesPage />));
    await waitFor(() => expect(cardCount()).toBe(20));
    server.use(http.get(FAVORITES_URL, () => serverError()));
    await goToPage('2');
    const retryButton = await screen.findByRole('button', { name: '다시 시도' });

    focusManager.setFocused(false);
    await userEvent.click(retryButton);

    // 첫 시도가 실패하고 재시도 대기(0) 뒤 포커스가 없어 멈춘다 — 화면에는 1쪽 자리표시가 data 로 온다.
    await waitFor(() => expect(queryClient.getQueryState(favoriteQueryKeys.list(1, 20))?.fetchStatus).toBe('paused'));
    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toHaveFocus();
    expect(cardCount()).toBe(0);

    serveFavorites(25);
    act(() => focusManager.setFocused(true));

    await waitFor(() => expect(cardCount()).toBe(5));
  });

  // 가드 — 쪽 키가 고정돼도 clear() 뒤엔 이전 쪽 유지가 지워진 옛 데이터를 꺼낸다. 화면에 닿지 않는 건 /me 가드가 내리기 때문이다.
  it('세션이 끝나 상태를 내리고 캐시를 비우면 이전 찜 목록이 화면에 남지 않는다', async () => {
    serveFavorites(1);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      providers(
        queryClient,
        <MeAuthGuard>
          <MyFavoritesPage />
        </MeAuthGuard>,
      ),
    );
    expect(await screen.findByText('찜동아리1')).toBeInTheDocument();

    // 세션 만료·로그아웃 경로는 모두 상태를 먼저 내리고 캐시를 비운다(SessionExpiryHandler·useLogout).
    act(() => {
      useAuthStore.setState({ status: 'unauthenticated', isVerified: true });
      queryClient.clear();
    });

    expect(screen.queryByText('찜동아리1')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '로그인하기' })).toBeInTheDocument();
  });
});
