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
 * 탐색 화면의 인증 소비 두 축(§8.1).
 * - 목록·안내는 시드된 status 로 첫 렌더부터 그린다(대기 자리표시 없음).
 * - 찜 하트만 예외다: 방향(추가/해제)이 찜 목록에 달려 있어, 목록이 오기 전 클릭은 반대 방향으로
 *   나가 409 로 조용히 실패한다. 그 사이만 클릭을 막는다 — 겉모습은 그대로 두고(반투명 깜빡임 #1360)
 *   aria-disabled 로만 알린다. 반투명(disabled)은 토글 진행 중인 카드와 찜 목록 조회 실패에만 쓴다.
 */
const mockSearchParams = { value: '' };
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mockSearchParams.value),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const { mockPosthogCapture } = vi.hoisted(() => ({ mockPosthogCapture: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { capture: mockPosthogCapture } }));

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

/** 이 스위트에서 나간 API 요청 경로 — 준비 전 클릭이 토글 요청 없이 삼켜졌는지 단언한다. */
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
  mockSearchParams.value = '';
  mockPosthogCapture.mockReset();
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
});
afterAll(() => {
  server.events.removeListener('request:start', trackRequest);
  server.close();
});

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

// 데스크탑 그리드·모바일 리스트가 같은 트리에 함께 렌더된다(CSS 로만 감춘다) — 하트는 항상 2개다.
const hearts = (name: '찜 추가' | '찜 해제') => screen.getAllByRole('button', { name });

describe('ClubExplorePage — 찜 방향이 확정되기 전의 하트', () => {
  // disabled 면 disabled:opacity-50 이 붙어 "정상 → 반투명 → 정상"으로 깜빡인다(#1360) — 클릭만 막는다.
  it('시드된 인증에서 찜 목록이 오기 전에는 하트가 반투명 없이 aria-disabled 로만 막히고, 눌러도 토글이 나가지 않는다', async () => {
    let sendFavoriteIds: () => void = () => {};
    const favoriteIdsArrived = new Promise<void>((resolve) => {
      sendFavoriteIds = resolve;
    });
    server.use(
      clubListHandler,
      http.get(`${BASE}/me/favorites/ids`, async () => {
        await favoriteIdsArrived;
        return HttpResponse.json({ ok: true, data: { clubIds: [7] }, message: null });
      }),
    );
    act(() => useAuthStore.setState({ status: 'authenticated' }));
    renderExplore();

    await waitFor(() => expect(hearts('찜 추가')).toHaveLength(2));
    for (const heart of hearts('찜 추가')) {
      expect(heart).not.toHaveAttribute('disabled');
      expect(heart).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(heart);
    }

    sendFavoriteIds();
    await waitFor(() => expect(hearts('찜 해제')).toHaveLength(2));
    for (const heart of hearts('찜 해제')) {
      expect(heart).toBeEnabled();
      expect(heart).not.toHaveAttribute('aria-disabled');
      expect(heart).toHaveAttribute('aria-pressed', 'true');
    }
    // 응답 뒤에 확인한다 — 준비 전 클릭이 늦게라도 토글로 나갔다면 여기서 잡힌다.
    expect(requestedPaths).not.toContain('/api/v1/me/favorites/7');
  });

  // 조회가 실패하면 방향을 끝내 알 수 없다 — 이때만 "지금은 쓸 수 없음"을 반투명으로 보인다.
  it('찜 목록 조회가 실패하면 하트를 반투명(disabled)으로 둔다', async () => {
    server.use(
      clubListHandler,
      http.get(`${BASE}/me/favorites/ids`, () => new HttpResponse(null, { status: 500 })),
    );
    act(() => useAuthStore.setState({ status: 'authenticated' }));
    renderExplore();

    await waitFor(() => {
      expect(hearts('찜 추가')).toHaveLength(2);
      for (const heart of hearts('찜 추가')) expect(heart).toBeDisabled();
    });
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
      expect(heart).not.toHaveAttribute('aria-disabled');
      expect(heart).toHaveAttribute('aria-pressed', 'true');
    }
  });

  // 찜 목록 도착은 사용자의 클릭이 아니다 — 데스크탑 카드·모바일 행 어느 쪽도 튀면 안 된다.
  // 호출부가 isFavoriteStateReady 를 안 내려주면(기본 true) 목록이 먼저 뜬 이 순서에서
  // 꺼진 하트를 본 것으로 기록돼 전환이 곧장 팝으로 샌다.
  it('목록이 먼저 뜬 뒤 찜 목록이 도착해 하트가 켜져도 팝 애니메이션을 재생하지 않는다', async () => {
    let sendFavoriteIds: () => void = () => {};
    const favoriteIdsArrived = new Promise<void>((resolve) => {
      sendFavoriteIds = resolve;
    });
    server.use(
      clubListHandler,
      http.get(`${BASE}/me/favorites/ids`, async () => {
        await favoriteIdsArrived;
        return HttpResponse.json({ ok: true, data: { clubIds: [7] }, message: null });
      }),
    );
    act(() => useAuthStore.setState({ status: 'authenticated' }));
    renderExplore();

    // 찜 목록 전에는 찜한 동아리도 "찜 안 함"으로 보인다 — 이 상태로 카드가 먼저 마운트된다.
    await waitFor(() => expect(hearts('찜 추가')).toHaveLength(2));
    sendFavoriteIds();

    await waitFor(() => expect(hearts('찜 해제')).toHaveLength(2));
    for (const heart of hearts('찜 해제')) {
      expect(heart.querySelector('svg')?.getAttribute('class') ?? '').not.toContain('animate-heart-pop');
    }
  });

  // 미인증에는 찜 목록 자체가 없다(쿼리 비활성) — 방향을 못 기다리므로 클릭이 열려 있어야
  // 로그인으로 갈 수 있다.
  it('미인증이면 목록 없이도 하트가 활성이다', async () => {
    server.use(clubListHandler);
    renderExplore();

    await waitFor(() => expect(hearts('찜 추가')).toHaveLength(2));
    // 활성(disabled 아님)이어야 눌러서 로그인으로 간다 — aria-disabled 도 없어야 한다.
    for (const heart of hearts('찜 추가')) {
      expect(heart).toBeEnabled();
      expect(heart).not.toHaveAttribute('aria-disabled');
    }
  });
});

describe('ClubExplorePage — 찜 토글이 진행 중인 하트', () => {
  // 반투명(disabled)은 사용자가 누른 카드의 진행 표시로만 남는다 — 다른 카드 하트는 그대로다.
  it('토글이 진행 중인 카드의 하트만 disabled 다', async () => {
    const otherClub: ClubSummary = { ...CLUB, id: 8, name: '축구부' };
    server.use(
      http.get(`${BASE}/clubs`, () =>
        HttpResponse.json({
          ok: true,
          data: { ...clubPage, content: [CLUB, otherClub], totalElements: 2 },
          message: null,
        }),
      ),
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ ok: true, data: { clubIds: [] }, message: null }),
      ),
      // 응답하지 않아 토글이 진행 중인 채로 남는다.
      http.post(`${BASE}/me/favorites/7`, () => new Promise(() => {})),
    );
    act(() => useAuthStore.setState({ status: 'authenticated' }));
    renderExplore();

    // 동아리마다 데스크탑 카드·모바일 행이 하나씩 — 카드 링크 안에서 하트를 찾는다.
    const heartsOf = (clubName: string) =>
      screen
        .getAllByRole('link', { name: new RegExp(clubName) })
        .map((card) => within(card).getByRole('button', { name: /찜/ }));

    await waitFor(() => {
      expect(heartsOf('밴드부')).toHaveLength(2);
      for (const heart of heartsOf('밴드부')) expect(heart).not.toHaveAttribute('aria-disabled');
    });
    const [bandHeart] = heartsOf('밴드부');
    if (!bandHeart) throw new Error('밴드부 하트가 렌더되지 않았다');
    await userEvent.click(bandHeart);

    await waitFor(() => {
      for (const heart of heartsOf('밴드부')) expect(heart).toBeDisabled();
    });
    expect(heartsOf('축구부')).toHaveLength(2);
    for (const heart of heartsOf('축구부')) {
      expect(heart).not.toBeDisabled();
      expect(heart).not.toHaveAttribute('aria-disabled');
    }
  });
});

describe('ClubExplorePage — 찜 토글 관측 이벤트', () => {
  // 과거 탐색 카드의 토글 사본에는 capture 가 빠져 있어 찜 지표가 과소집계됐다(하트 버튼만 발화).
  // 공용 플로우(useFavoriteToggleFlow) 통합 후, 탐색 진입점에서도 이벤트가 나가는지 고정한다.
  it('탐색 카드에서 찜 추가에 성공하면 club_favorited 이벤트가 잡힌다', async () => {
    server.use(
      clubListHandler,
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ ok: true, data: { clubIds: [] }, message: null }),
      ),
      http.post(`${BASE}/me/favorites/7`, () =>
        HttpResponse.json({ ok: true, data: 1, message: null }),
      ),
    );
    act(() => useAuthStore.setState({ status: 'authenticated' }));
    renderExplore();

    const firstAddHeart = () => {
      const [heart] = hearts('찜 추가');
      if (!heart) throw new Error('찜 추가 하트가 렌더되지 않았다');
      return heart;
    };
    // 준비 신호는 aria-disabled 다 — 하트는 찜 목록 전에도 disabled 가 아니라 toBeEnabled 로는 못 기다린다.
    await waitFor(() => expect(firstAddHeart()).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(firstAddHeart());

    await waitFor(() =>
      expect(mockPosthogCapture).toHaveBeenCalledWith('club_favorited', { club_id: 7 }),
    );
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

  // 게이트에서는 목록·모집 수 쿼리가 둘 다 꺼져 있어, 카운트를 그리면 0 이거나 직전 화면의 stale 값이다.
  // 로그인 안내 위에 그런 숫자가 얹히지 않아야 한다(#801).
  it('로그인 안내 위에 카운트 헤더를 띄우지 않는다', async () => {
    mockSearchParams.value = 'favorite=true';
    renderExplore();

    await screen.findAllByText('찜한 동아리를 보려면 로그인해 주세요.');
    expect(screen.queryAllByText(/현재 페이지/)).toHaveLength(0);
    expect(screen.queryAllByText(/곳 모집 중/)).toHaveLength(0);
  });
});

describe('ClubExplorePage — 찜 해제 직후 빈 상태 플래시', () => {
  // 찜 해제는 낙관적 ids 교집합으로 목록을 즉시 0건으로 만들고, 곧바로 목록 재검증이 뜬다.
  // 이 갱신 구간에 전용 문구든 일반 문구든 띄우면 곧 사라질 빈 상태가 번쩍인다(#801).
  it('찜 해제로 0건이 된 뒤 목록 재검증이 끝나기 전에는 빈 상태 문구가 보이지 않는다', async () => {
    mockSearchParams.value = 'favorite=true';
    let favoriteIds = [7];
    server.use(
      clubListHandler,
      // 해제 후 재조회까지 [7] 을 돌려주면 카드가 되살아나 0건 구간 자체가 사라진다 — 서버도 함께 비운다.
      http.get(`${BASE}/me/favorites/ids`, () =>
        HttpResponse.json({ ok: true, data: { clubIds: favoriteIds }, message: null }),
      ),
      http.delete(`${BASE}/me/favorites/7`, () => {
        favoriteIds = [];
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    act(() => useAuthStore.setState({ status: 'authenticated' }));
    const { unmount } = renderExplore();

    await waitFor(() => expect(hearts('찜 해제')).toHaveLength(2));

    // 재검증 GET 은 끝내 응답하지 않는다 — isFetching 이 계속 true 인 구간을 만든다.
    server.use(http.get(`${BASE}/clubs`, () => new Promise(() => {})));

    const [heart] = hearts('찜 해제');
    if (!heart) throw new Error('찜 해제 하트가 렌더되지 않았다');
    await userEvent.click(heart);

    await waitFor(() => expect(screen.queryAllByText('밴드부')).toHaveLength(0));
    await waitFor(() => {
      expect(screen.queryAllByText('아직 찜한 동아리가 없어요.')).toHaveLength(0);
      expect(screen.queryAllByText('조건에 맞는 동아리가 없어요.')).toHaveLength(0);
    });

    // 끝내 응답하지 않는 목록 GET 을 띄운 채로 두면, 정리 단계에서 핸들러가 리셋된 뒤 재요청이
    // 나가 MSW unhandled 로 잡힌다 — 단언이 끝나면 이 테스트가 직접 화면을 내린다.
    unmount();
  });
});
