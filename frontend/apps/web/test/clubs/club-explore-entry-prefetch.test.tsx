import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys } from '@duing/hooks';
import type { ClubSummary, PageResponse } from '@duing/types';

/**
 * 탐색 카드 누름 선조회(스펙 P1 §3.4) — 인터셉트 상세 셸은 데이터 없이 마운트하므로 카드 Link 의 pointerdown 에서 상세(터치는 상세만,
 * 마우스·펜은 대표 활동도)를 훅과 같은 옵션으로 받아 둔다. 요청 수는 MSW 로 센다(TanStack 내부는 건드리지 않는다).
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/clubs',
  useSelectedLayoutSegment: () => null,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

import { ClubExplorePage } from '@/app/clubs/_pages/ClubExplorePage';

const BASE = 'http://localhost:8080/api/v1';
const CLUB_ID = 7;
const DETAIL_PATH = `/api/v1/clubs/${CLUB_ID}`;
const HERO_PATH = `/api/v1/clubs/${CLUB_ID}/hero-activities`;
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

const CLUB: ClubSummary = {
  id: CLUB_ID,
  name: '밴드부',
  category: 'ART',
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
const clubPage: PageResponse<ClubSummary> = { content: [CLUB], page: 1, size: 20, totalElements: 1, totalPages: 1, hasNext: false };
// 상세 응답 — 이 스위트는 요청 수만 센다.
const detailStub = { ...CLUB, description: null };

const requestedPaths: string[] = [];
const trackRequest = ({ request }: { request: Request }) => {
  requestedPaths.push(new URL(request.url).pathname);
};
const countRequests = (pathname: string) => requestedPaths.filter((path) => path === pathname).length;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', trackRequest);
});
afterEach(() => {
  server.resetHandlers();
  requestedPaths.length = 0;
});
afterAll(() => {
  server.events.removeListener('request:start', trackRequest);
  server.close();
});

function serveClub(options: { holdDetail?: Promise<void> } = {}) {
  server.use(
    http.get(`${BASE}/clubs`, () => HttpResponse.json({ ok: true, data: clubPage, message: null })),
    http.get(`${BASE}/clubs/${CLUB_ID}`, async () => {
      if (options.holdDetail) await options.holdDetail;
      return HttpResponse.json({ ok: true, data: detailStub, message: null });
    }),
    http.get(`${BASE}/clubs/${CLUB_ID}/hero-activities`, () => HttpResponse.json({ ok: true, data: [], message: null })),
  );
}

function renderExplore(seed?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  seed?.(queryClient);
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>{children}</ApiClientProvider>
      </QueryClientProvider>
    );
  }
  render(
    <Wrapper>
      <ClubExplorePage />
    </Wrapper>,
  );
}

// 데스크탑 그리드(ClubCard)와 모바일 리스트(ClubListItem)가 같은 트리에 함께 렌더된다(CSS 로만 감춘다) — 카드 링크는 둘이다.
async function cardLinks(): Promise<{ desktopCard: HTMLElement; mobileItem: HTMLElement }> {
  await waitFor(() => expect(document.querySelectorAll(`a[href="/clubs/${CLUB_ID}"]`)).toHaveLength(2));
  const [desktopCard, mobileItem] = Array.from(document.querySelectorAll<HTMLElement>(`a[href="/clubs/${CLUB_ID}"]`));
  if (!desktopCard || !mobileItem) throw new Error('카드 링크가 둘이어야 한다');
  return { desktopCard, mobileItem };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

describe('ClubExplorePage — 카드 누름 선조회(스펙 P1 §3.4)', () => {
  it('마우스로 카드를 누르면(pointerdown) 상세·대표 활동을 각 1회 받는다 — 진행 중에 또 눌러도 같은 요청을 함께 쓴다', async () => {
    let releaseDetail: () => void = () => {};
    const detailReleased = new Promise<void>((resolve) => {
      releaseDetail = resolve;
    });
    serveClub({ holdDetail: detailReleased });
    renderExplore();
    const { desktopCard } = await cardLinks();

    try {
      fireEvent.pointerDown(desktopCard, { pointerType: 'mouse', button: 0 });
      fireEvent.pointerDown(desktopCard, { pointerType: 'mouse', button: 0 });
      await waitFor(() => expect(countRequests(HERO_PATH)).toBe(1));
      expect(countRequests(DETAIL_PATH)).toBe(1);
    } finally {
      releaseDetail();
    }
    await settle();
    expect(countRequests(DETAIL_PATH)).toBe(1);
    expect(countRequests(HERO_PATH)).toBe(1);
  });

  it('터치로 누르면 상세만 받는다 — 대표 활동은 모바일에서 접힌 아래다', async () => {
    serveClub();
    renderExplore();
    const { mobileItem } = await cardLinks();

    fireEvent.pointerDown(mobileItem, { pointerType: 'touch', button: 0 });
    await waitFor(() => expect(countRequests(DETAIL_PATH)).toBe(1));
    await settle();
    expect(countRequests(HERO_PATH)).toBe(0);
  });

  it('신선한 캐시가 있으면 요청하지 않는다 — 훅과 같은 신선도(5분)', async () => {
    serveClub();
    renderExplore((queryClient) => {
      queryClient.setQueryData(clubQueryKeys.detail(CLUB_ID), detailStub);
      queryClient.setQueryData(clubQueryKeys.heroActivities(CLUB_ID), []);
    });
    const { desktopCard } = await cardLinks();

    fireEvent.pointerDown(desktopCard, { pointerType: 'mouse', button: 0 });
    await settle();
    expect(countRequests(DETAIL_PATH)).toBe(0);
    expect(countRequests(HERO_PATH)).toBe(0);
  });

  it('하트 아이콘 안쪽(svg·path)에서 시작한 누름, 가운데·오른쪽 버튼, 수정키(새 탭) 누름은 받지 않는다', async () => {
    serveClub();
    renderExplore();
    const { desktopCard, mobileItem } = await cardLinks();

    for (const card of [desktopCard, mobileItem]) {
      const heartPath = card.querySelector('button svg path');
      if (!(heartPath instanceof Element)) throw new Error('하트 아이콘 path 가 없다');
      fireEvent.pointerDown(heartPath, { pointerType: 'mouse', button: 0 });
      fireEvent.pointerDown(card, { pointerType: 'mouse', button: 1 });
      fireEvent.pointerDown(card, { pointerType: 'mouse', button: 2 });
      for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const) {
        fireEvent.pointerDown(card, { pointerType: 'mouse', button: 0, [modifier]: true });
      }
    }
    await settle();
    expect(countRequests(DETAIL_PATH)).toBe(0);
    expect(countRequests(HERO_PATH)).toBe(0);
  });

  it('키보드(포커스·Enter)는 선조회하지 않는다 — Tab 이동만으로 카드마다 요청이 나가지 않게(수용)', async () => {
    serveClub();
    renderExplore();
    const { desktopCard } = await cardLinks();

    act(() => desktopCard.focus());
    fireEvent.keyDown(desktopCard, { key: 'Enter' });
    await settle();
    expect(countRequests(DETAIL_PATH)).toBe(0);
    expect(countRequests(HERO_PATH)).toBe(0);
  });
});
