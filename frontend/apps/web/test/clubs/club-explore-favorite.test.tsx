import { act, render, screen, waitFor } from '@testing-library/react';
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
 * 탐색 화면의 인증 소비 두 축(§8.1).
 * - 목록·안내는 시드된 status 로 첫 렌더부터 그린다(대기 자리표시 없음).
 * - 찜 하트만 예외다: 방향(추가/해제)이 찜 목록에 달려 있어, 목록이 오기 전 클릭은 반대 방향으로
 *   나가 409 로 조용히 실패한다. 그 사이만 비활성으로 막는다.
 */
const mockSearchParams = { value: '' };
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParams.value),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

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
  logoUrl: null,
  status: 'ACTIVE',
  tags: ['합주'],
  tagline: null,
  centralClub: true,
  activeRecruitment: {
    recruitmentId: 10,
    displayStatus: 'OPEN',
    startDate: '2026-01-01',
    endDate: '2099-12-31',
  },
};

const clubPage: PageResponse<ClubSummary> = {
  content: [CLUB],
  page: 1,
  size: 20,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
};

const clubListHandler = http.get(`${BASE}/clubs`, () =>
  HttpResponse.json({ ok: true, data: clubPage, message: null }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  mockSearchParams.value = '';
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
  render(
    <Wrapper>
      <ClubExplorePage />
    </Wrapper>,
  );
}

// 데스크탑 그리드·모바일 리스트가 같은 트리에 함께 렌더된다(CSS 로만 감춘다) — 하트는 항상 2개다.
const hearts = (name: '찜 추가' | '찜 해제') => screen.getAllByRole('button', { name });

describe('ClubExplorePage — 찜 방향이 확정되기 전의 하트', () => {
  it('시드된 인증에서 찜 목록이 오기 전에는 하트가 비활성이다', async () => {
    server.use(clubListHandler, http.get(`${BASE}/me/favorites/ids`, () => new Promise(() => {})));
    act(() => useAuthStore.setState({ status: 'authenticated' }));
    renderExplore();

    await waitFor(() => expect(hearts('찜 추가')).toHaveLength(2));
    for (const heart of hearts('찜 추가')) expect(heart).toBeDisabled();
  });

  it('찜 목록이 도착하면 활성화되고 이미 찜한 동아리는 해제 방향으로 표시된다', async () => {
    server.use(
      clubListHandler,
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ ok: true, data: { clubIds: [7] }, message: null }),
      ),
    );
    act(() => useAuthStore.setState({ status: 'authenticated' }));
    renderExplore();

    await waitFor(() => expect(hearts('찜 해제')).toHaveLength(2));
    for (const heart of hearts('찜 해제')) {
      expect(heart).toBeEnabled();
      expect(heart).toHaveAttribute('aria-pressed', 'true');
    }
  });

  // 미인증에는 찜 목록 자체가 없다(쿼리 비활성) — 방향을 못 기다리므로 클릭이 열려 있어야
  // 로그인으로 갈 수 있다.
  it('미인증이면 목록 없이도 하트가 활성이다', async () => {
    server.use(clubListHandler);
    renderExplore();

    await waitFor(() => expect(hearts('찜 추가')).toHaveLength(2));
    for (const heart of hearts('찜 추가')) expect(heart).toBeEnabled();
  });
});

describe('ClubExplorePage — 찜 필터 + 미인증', () => {
  // 시드된 미인증은 "확인 중"이 아니다 — 스켈레톤으로 붙잡아 두지 않고 곧장 로그인으로 유도한다.
  it('로그인 안내를 즉시 렌더하고 목록 스켈레톤은 띄우지 않는다', async () => {
    mockSearchParams.value = 'favorite=true';
    renderExplore();

    expect(await screen.findAllByText('찜한 동아리를 보려면 로그인해 주세요.')).toHaveLength(2);
    expect(screen.queryByRole('status', { name: '동아리 목록 불러오는 중' })).not.toBeInTheDocument();
    // 로그인 후 찜 필터가 켜진 채 돌아온다. 목록 핸들러를 일부러 등록하지 않았다 — 목록 쿼리가
    // 나갔다면 MSW 가 unhandled 로 잡는다(비로그인 401 은 전역 리프레시 플로우를 깨운다).
    expect(screen.getAllByRole('link', { name: '로그인하기' })[0]).toHaveAttribute(
      'href',
      '/login?next=%2Fclubs%3Ffavorite%3Dtrue',
    );
  });
});
