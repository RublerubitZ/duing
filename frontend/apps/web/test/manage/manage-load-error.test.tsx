import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys } from '@duing/hooks';
import type { ManagedClub } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const pushSpy = vi.fn();
const replaceSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushSpy,
    replace: replaceSpy,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/manage/clubs/1',
  useSearchParams: () => new URLSearchParams(),
}));
// 사이드바 로고(next/image) — 이 파일은 실패·다시 시도만 본다(manage-shell.test.tsx 와 같은 목).
vi.mock('@/components/duing/BrandMark', () => ({
  BrandMark: () => <span>Duing</span>,
}));

import { ManageShell } from '@/app/manage/_components/ManageShell';
import ManagePage from '@/app/manage/page';

/**
 * 관리 동아리 목록을 받지 못하면 '없음'이 아니라 '모름'이다(#1766, #1579 기준) — 실패 안내 + 다시 시도 + 홈 링크,
 * 다시 받는 동안에는 같은 버튼을 잠가 포커스를 지킨다. 실제 훅 + 실제 ApiClient + MSW(TanStack Query 는 모킹하지 않는다).
 */
const BASE = 'http://localhost:8080/api/v1';
const MANAGED_URL = `${BASE}/leader/clubs/me/managed`;
const MANAGED_PATH = '/api/v1/leader/clubs/me/managed';
const FAILURE_TEXT = '운영 동아리 목록을 불러오지 못했어요.';

const ok = <T,>(data: T) => HttpResponse.json({ ok: true, data, message: null });
const fail = () =>
  HttpResponse.json({ ok: false, data: null, message: '일시적인 오류가 발생했습니다.' }, { status: 500 });

// 본문이 열리면 사이드바 내비가 통계 폴백용으로 모집 목록을 부른다 — 이 파일은 그 결과를 보지 않는다.
const server = setupServer(http.get(`${BASE}/clubs/1/recruitments`, () => ok([])));
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

/** 관리 동아리 요청 수 — 다시 받기가 요청을 몇 번 보냈는지 센다. */
let managedRequestCount = 0;
const countManagedRequest = ({ request }: { request: Request }) => {
  if (new URL(request.url).pathname === MANAGED_PATH) managedRequestCount += 1;
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', countManagedRequest);
});
beforeEach(() => {
  managedRequestCount = 0;
  pushSpy.mockReset();
  replaceSpy.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  // 탭 가림을 흉내 낸 테스트가 중간에 실패해도 다음 테스트로 새지 않게 문서 기준으로 되돌린다.
  focusManager.setFocused(undefined);
});
afterAll(() => {
  server.events.removeListener('request:start', countManagedRequest);
  server.close();
});

const managedClub = (clubId: number): ManagedClub => ({
  clubId,
  clubName: `운영동아리${clubId}`,
  logoUrl: null,
  myRole: 'LEADER',
  centralClub: true,
  activeRecruitmentCount: 0,
});

/**
 * 실제 앱은 빠른 실패를 1회 더 받는다(shouldRetryQuery) — 그 경로를 볼 때만 retry 를 켠다.
 * 창 포커스 재조회는 앱처럼 끈다 — 탭 가림을 흉내 낸 뒤 되돌릴 때 낯선 요청이 끼지 않게.
 */
const createTestQueryClient = (retry: number | false = false) =>
  new QueryClient({ defaultOptions: { queries: { retry, retryDelay: 0, refetchOnWindowFocus: false } } });

function withProviders(ui: ReactElement, queryClient = createTestQueryClient()) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>{ui}</ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>
  );
}

/**
 * 첫 조회는 500 으로 바로 답하고, 그다음 조회는 게이트를 열 때까지 붙잡았다가 `heldResponse` 로 답한다.
 * 즉시 답하면 TanStack 의 조회 시작·결과 알림이 setTimeout 0 뒤 한 번에 합쳐져 '다시 받는 중'이 한 번도 그려지지 않는다.
 */
function failFirstThenHold(heldResponse: () => Response) {
  let releaseHeld: () => void = () => undefined;
  const heldGate = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
  server.use(
    http.get(MANAGED_URL, () => fail(), { once: true }),
    http.get(MANAGED_URL, async () => {
      await heldGate;
      return heldResponse();
    }),
  );
  return { releaseHeld };
}

/**
 * retry 1회 QueryClient 용 — 첫 조회(본 시도·자동 재시도)는 바로 500, 다시 시도의 첫 요청은 게이트를 열면 500,
 * 그 뒤 자동 재시도는 `resumedResponse` 로 답한다. 게이트를 열 때 탭이 가려져 있으면 TanStack 은 자동 재시도를 멈춘다(paused).
 */
function failFirstLoadThenHoldRetryFailure(resumedResponse: () => Response) {
  let releaseHeld: () => void = () => undefined;
  const heldGate = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
  server.use(
    http.get(MANAGED_URL, () => fail(), { once: true }),
    http.get(MANAGED_URL, () => fail(), { once: true }),
    http.get(
      MANAGED_URL,
      async () => {
        await heldGate;
        return fail();
      },
      { once: true },
    ),
    http.get(MANAGED_URL, () => resumedResponse()),
  );
  return { releaseHeld };
}

/** 자동 재시도가 멈췄다(paused) — TanStack 은 알림을 setTimeout 0 뒤에 묶어 보내므로 한 바퀴 흘려 화면까지 닿게 한다. */
async function waitForPausedRetry(queryClient: QueryClient) {
  await waitFor(() => expect(queryClient.getQueryState(clubQueryKeys.managed())?.fetchStatus).toBe('paused'));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const shellElement = () => (
  <ManageShell currentClubId={1}>
    <p>운영 콘솔 본문</p>
  </ManageShell>
);

describe('ManageShell — 관리 동아리 조회 실패', () => {
  it('조회가 실패하면 본문·사이드바 대신 실패 안내·다시 시도·홈 링크를 보인다', async () => {
    server.use(http.get(MANAGED_URL, () => fail()));
    render(withProviders(shellElement()));

    expect(await screen.findByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '홈으로 돌아가기' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('현재 운영하는 동아리가 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '운영진 콘솔 사이드바' })).not.toBeInTheDocument();
  });

  it('다시 받는 동안 같은 버튼을 잠가 포커스를 지키고 본문을 열지 않으며, 성공하면 본문을 연다', async () => {
    const user = userEvent.setup();
    const { releaseHeld } = failFirstThenHold(() => ok([managedClub(1)]));
    render(withProviders(shellElement()));

    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    await user.click(retryButton);

    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 불러오는 중'));
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toBeEnabled();
    expect(retryButton).toHaveFocus();
    expect(screen.getByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '운영 권한 확인 중' })).not.toBeInTheDocument();
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();

    releaseHeld();
    expect(await screen.findByText('운영 콘솔 본문')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: FAILURE_TEXT })).not.toBeInTheDocument();
  });

  it('다시 받기가 또 실패하면 같은 버튼이 다시 시도로 돌아오고 포커스가 남는다', async () => {
    const user = userEvent.setup();
    const { releaseHeld } = failFirstThenHold(() => fail());
    render(withProviders(shellElement()));

    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    await user.click(retryButton);
    // '다시 받는 중'이 실제로 그려진 뒤에 게이트를 연다 — 건너뛰면 아래 '같은 요소' 단언이 아무것도 지키지 않는다.
    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 불러오는 중'));

    releaseHeld();
    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 시도'));
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).not.toHaveAttribute('aria-disabled');
    expect(retryButton).toHaveFocus();
    expect(screen.getByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
    expect(screen.queryByText('현재 운영하는 동아리가 없습니다.')).not.toBeInTheDocument();
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();
  });

  // 다시 시도의 첫 요청이 실패한 뒤 자동 재시도를 기다리는 사이 탭이 가려지면 TanStack 은 조회를 멈춘다(paused).
  // 그동안 isFetching·isLoading 은 거짓이지만 아직 받는 중이므로 같은 버튼이 잠겨 있어야 한다.
  it('다시 받다 탭이 가려져 자동 재시도가 멈춘 동안에도 같은 버튼이 잠겨 있고, 돌아오면 이어 받아 본문을 연다', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient(1);
    const { releaseHeld } = failFirstLoadThenHoldRetryFailure(() => ok([managedClub(1)]));
    render(withProviders(shellElement(), queryClient));

    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    focusManager.setFocused(false);
    await user.click(retryButton);
    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 불러오는 중'));

    releaseHeld();
    await waitForPausedRetry(queryClient);
    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toBeEnabled();
    expect(retryButton).toHaveFocus();
    expect(screen.getByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
    expect(screen.queryByText('운영 콘솔 본문')).not.toBeInTheDocument();

    act(() => focusManager.setFocused(true));
    expect(await screen.findByText('운영 콘솔 본문')).toBeInTheDocument();
  });

  it('운영 동아리가 0곳이면 기존 없음 안내와 홈 링크를 유지한다', async () => {
    server.use(http.get(MANAGED_URL, () => ok([])));
    render(withProviders(shellElement()));

    expect(
      await screen.findByRole('heading', { name: '현재 운영하는 동아리가 없습니다.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '홈으로 돌아가기' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  // 실제 앱은 빠른 실패를 1회 더 받는다. 그 자동 재시도는 아직 첫 조회라 스피너를 유지한다.
  it('첫 조회의 자동 재시도 중에는 스피너를 유지하고, 끝내 실패하면 실패 안내를 보인다', async () => {
    const { releaseHeld } = failFirstThenHold(() => fail());
    render(withProviders(shellElement(), createTestQueryClient(1)));

    await waitFor(() => expect(managedRequestCount).toBe(2));
    expect(screen.getByRole('status', { name: '운영 권한 확인 중' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: FAILURE_TEXT })).not.toBeInTheDocument();

    releaseHeld();
    expect(await screen.findByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
  });

  // 실패가 캐시에 남은 채 다시 들어오면 첫 로딩으로 본다 — 실패 이력을 캐시 단위(errorUpdateCount)로 보면 여기서 깨진다.
  it('다른 화면에서 실패한 뒤 다시 들어오면 실패 안내가 아니라 스피너부터 보인다', async () => {
    const queryClient = createTestQueryClient();
    const { releaseHeld } = failFirstThenHold(() => ok([managedClub(1)]));
    const firstVisit = render(withProviders(shellElement(), queryClient));
    await waitFor(() => {
      expect(managedRequestCount).toBe(1);
      expect(queryClient.isFetching()).toBe(0);
    });
    firstVisit.unmount();

    render(withProviders(shellElement(), queryClient));
    await waitFor(() => expect(managedRequestCount).toBe(2));
    expect(screen.getByRole('status', { name: '운영 권한 확인 중' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: FAILURE_TEXT })).not.toBeInTheDocument();

    releaseHeld();
    expect(await screen.findByText('운영 콘솔 본문')).toBeInTheDocument();
  });

  it('빈 캐시의 서버 HTML 은 스피너이고 실패 안내가 없다(하이드레이션 첫 프레임 오판 방지)', () => {
    const serverHtml = renderToString(withProviders(shellElement()));
    expect(serverHtml).toContain('운영 권한 확인 중');
    expect(serverHtml).not.toContain(FAILURE_TEXT);
  });
});

describe('/manage — 관리 동아리 조회 실패', () => {
  it('조회가 실패하면 없음 안내 대신 실패 안내·다시 시도·홈 링크를 보이고 이동하지 않는다', async () => {
    server.use(http.get(MANAGED_URL, () => fail()));
    render(withProviders(<ManagePage />));

    expect(await screen.findByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '홈으로 돌아가기' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('관리하는 동아리가 없습니다.')).not.toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('다시 받는 동안 같은 버튼을 잠가 포커스를 지키고, 성공하면 콘솔로 replace 한다', async () => {
    const user = userEvent.setup();
    const { releaseHeld } = failFirstThenHold(() => ok([managedClub(10)]));
    render(withProviders(<ManagePage />));

    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    await user.click(retryButton);

    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 불러오는 중'));
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toBeEnabled();
    expect(retryButton).toHaveFocus();
    expect(screen.getByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '관리 동아리 불러오는 중' })).not.toBeInTheDocument();

    releaseHeld();
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/manage/clubs/10'));
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('다시 받기가 또 실패하면 같은 버튼이 다시 시도로 돌아오고 포커스가 남는다', async () => {
    const user = userEvent.setup();
    const { releaseHeld } = failFirstThenHold(() => fail());
    render(withProviders(<ManagePage />));

    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    await user.click(retryButton);
    // '다시 받는 중'이 실제로 그려진 뒤에 게이트를 연다 — 건너뛰면 아래 '같은 요소' 단언이 아무것도 지키지 않는다.
    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 불러오는 중'));

    releaseHeld();
    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 시도'));
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).not.toHaveAttribute('aria-disabled');
    expect(retryButton).toHaveFocus();
    expect(screen.getByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
    expect(screen.queryByText('관리하는 동아리가 없습니다.')).not.toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  // 다시 시도의 첫 요청이 실패한 뒤 자동 재시도를 기다리는 사이 탭이 가려지면 TanStack 은 조회를 멈춘다(paused).
  // 그동안 isFetching·isLoading 은 거짓이지만 아직 받는 중이므로 같은 버튼이 잠겨 있어야 한다.
  it('다시 받다 탭이 가려져 자동 재시도가 멈춘 동안에도 같은 버튼이 잠겨 있고, 돌아오면 이어 받아 콘솔로 replace 한다', async () => {
    const user = userEvent.setup();
    const queryClient = createTestQueryClient(1);
    const { releaseHeld } = failFirstLoadThenHoldRetryFailure(() => ok([managedClub(10)]));
    render(withProviders(<ManagePage />, queryClient));

    const retryButton = await screen.findByRole('button', { name: '다시 시도' });
    focusManager.setFocused(false);
    await user.click(retryButton);
    await waitFor(() => expect(retryButton).toHaveAccessibleName('다시 불러오는 중'));

    releaseHeld();
    await waitForPausedRetry(queryClient);
    expect(retryButton).toHaveAccessibleName('다시 불러오는 중');
    expect(retryButton).toHaveAttribute('aria-disabled', 'true');
    expect(retryButton).toBeEnabled();
    expect(retryButton).toHaveFocus();
    expect(screen.getByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();

    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/manage/clubs/10'));
  });

  it('운영 동아리가 0곳이면 기존 없음 안내를 유지하고 이동하지 않는다', async () => {
    server.use(http.get(MANAGED_URL, () => ok([])));
    render(withProviders(<ManagePage />));

    expect(await screen.findByText('관리하는 동아리가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  // 실패가 캐시에 남은 채 다시 들어오면 첫 로딩으로 본다 — 실패 이력을 캐시 단위(errorUpdateCount)로 보면 여기서 깨진다.
  it('다른 화면에서 실패한 뒤 다시 들어오면 실패 안내가 아니라 스피너부터 보이고, 성공하면 replace 한다', async () => {
    const queryClient = createTestQueryClient();
    const { releaseHeld } = failFirstThenHold(() => ok([managedClub(10)]));
    const firstVisit = render(withProviders(<ManagePage />, queryClient));
    await waitFor(() => {
      expect(managedRequestCount).toBe(1);
      expect(queryClient.isFetching()).toBe(0);
    });
    firstVisit.unmount();

    render(withProviders(<ManagePage />, queryClient));
    await waitFor(() => expect(managedRequestCount).toBe(2));
    expect(screen.getByRole('status', { name: '관리 동아리 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: FAILURE_TEXT })).not.toBeInTheDocument();

    releaseHeld();
    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/manage/clubs/10'));
  });

  it('빈 캐시의 서버 HTML 은 스피너이고 실패 안내가 없다(하이드레이션 첫 프레임 오판 방지)', () => {
    const serverHtml = renderToString(withProviders(<ManagePage />));
    expect(serverHtml).toContain('관리 동아리 불러오는 중');
    expect(serverHtml).not.toContain(FAILURE_TEXT);
  });
});
