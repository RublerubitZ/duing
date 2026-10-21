import { render, screen, within } from '@testing-library/react';
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
 * 탐색 화면 페이지 버튼 — 페이지를 바꾸면 화면 맨 위(이 화면은 목록이 첫 내용)로 옮기고, 필터·마운트에는 움직이지 않는다.
 * 페이지 버튼 접근성(이전·다음 이름, 현재 번호, nav)도 여기서 본다. 데스크탑·모바일 두 트리가 다 그려져 페이지 영역이 둘이다.
 */
const mockSearchParams = { value: '' };
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/clubs',
  useSelectedLayoutSegment: () => null,
  useSearchParams: () => new URLSearchParams(mockSearchParams.value),
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
}));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

import { ClubExplorePage } from '@/app/clubs/_pages/ClubExplorePage';

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

const CLUB: ClubSummary = {
  id: 7,
  name: '밴드부',
  category: 'ART',
  division: '예술분과',
  college: null,
  department: null,
  logoUrl: null,
  status: 'ACTIVE',
  tags: ['합주'],
  tagline: null,
  centralClub: true,
  activeRecruitment: null,
};

function clubListHandler(totalPages: number) {
  const clubPage: PageResponse<ClubSummary> = {
    content: [CLUB],
    page: 0,
    size: 20,
    totalElements: totalPages * 20,
    totalPages,
    hasNext: totalPages > 1,
  };
  return http.get(`${BASE}/clubs`, () => HttpResponse.json({ ok: true, data: clubPage, message: null }));
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  clearNavigationPending();
  server.resetHandlers();
  mockSearchParams.value = '';
  mockReplace.mockReset();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function renderExplore() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

/** 데스크탑 트리가 먼저 그려진다(hidden md:block → md:hidden). noUncheckedIndexedAccess 라 구조 분해 값은 확인해서 넘긴다. */
async function findDesktopPager() {
  const [desktopPager] = await screen.findAllByRole('navigation', { name: '페이지' });
  if (desktopPager === undefined) throw new Error('페이지 영역이 그려지지 않았다');
  return desktopPager;
}

describe('ClubExplorePage — 페이지 버튼', () => {
  it('하단 번호로 2페이지에 가면 주소를 바꾸고 화면 맨 위로 간다', async () => {
    server.use(clubListHandler(3));
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderExplore();
    const desktopPager = await findDesktopPager();

    await userEvent.setup().click(within(desktopPager).getByRole('button', { name: '2' }));

    expect(mockReplace).toHaveBeenLastCalledWith('/clubs?page=2', { scroll: false });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('다음 페이지 버튼으로 옮겨도 화면 맨 위로 간다', async () => {
    server.use(clubListHandler(3));
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderExplore();
    const desktopPager = await findDesktopPager();

    await userEvent.setup().click(within(desktopPager).getByRole('button', { name: '다음 페이지' }));

    expect(mockReplace).toHaveBeenLastCalledWith('/clubs?page=2', { scroll: false });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('현재 번호를 다시 누르면 움직이지 않는다', async () => {
    server.use(clubListHandler(3));
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderExplore();
    const desktopPager = await findDesktopPager();

    await userEvent.setup().click(within(desktopPager).getByRole('button', { name: '1' }));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('주소에 page 가 있어도 마운트만으로는 움직이지 않는다 — 뒤로 가기로 다시 그려질 때 복원 위치를 지킨다', async () => {
    mockSearchParams.value = 'page=2';
    server.use(clubListHandler(3));
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderExplore();

    await screen.findAllByRole('navigation', { name: '페이지' });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('카테고리를 바꾸면 주소는 바꾸되 스크롤하지 않는다', async () => {
    // 1페이지뿐이라 페이지 영역이 없다 — 이름 없는 nav 는 카테고리 탭 하나다(기존 스위트와 같은 조회).
    server.use(clubListHandler(1));
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderExplore();
    const categoryTab = await screen.findByRole('navigation');

    await userEvent.setup().click(within(categoryTab).getByRole('button', { name: '예술' }));

    expect(mockReplace).toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('이전·다음 버튼에 이름이 있고 현재 번호를 aria-current 로 알린다', async () => {
    server.use(clubListHandler(3));
    renderExplore();
    const pagers = await screen.findAllByRole('navigation', { name: '페이지' });

    expect(pagers).toHaveLength(2);
    for (const pager of pagers) {
      expect(within(pager).getByRole('button', { name: '이전 페이지' })).toBeDisabled();
      expect(within(pager).getByRole('button', { name: '다음 페이지' })).toBeEnabled();
      expect(within(pager).getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
      expect(within(pager).getByRole('button', { name: '2' })).not.toHaveAttribute('aria-current');
    }
  });
});
