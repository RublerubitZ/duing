import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
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
afterEach(() => server.resetHandlers());
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

/** 실제 앱은 빠른 실패를 1회 더 받는다(shouldRetryQuery) — 그 경로를 볼 때만 retry 를 켠다. */
const createTestQueryClient = (retry: number | false = false) =>
  new QueryClient({ defaultOptions: { queries: { retry, retryDelay: 0 } } });

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

  it('운영 동아리가 0곳이면 기존 없음 안내와 홈 링크를 유지한다', async () => {
    server.use(http.get(MANAGED_URL, () => ok([])));
    render(withProviders(shellElement()));

    expect(
      await screen.findByRole('heading', { name: '현재 운영하는 동아리가 없습니다.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '홈으로 돌아가기' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  // Review Focus 1 — 실제 앱은 빠른 실패를 1회 더 받는다. 그 자동 재시도는 아직 첫 조회라 스피너를 유지한다.
  it('첫 조회의 자동 재시도 중에는 스피너를 유지하고, 끝내 실패하면 실패 안내를 보인다', async () => {
    const { releaseHeld } = failFirstThenHold(() => fail());
    render(withProviders(shellElement(), createTestQueryClient(1)));

    await waitFor(() => expect(managedRequestCount).toBe(2));
    expect(screen.getByRole('status', { name: '운영 권한 확인 중' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: FAILURE_TEXT })).not.toBeInTheDocument();

    releaseHeld();
    expect(await screen.findByRole('heading', { name: FAILURE_TEXT })).toBeInTheDocument();
  });

  // Review Focus 2 — 실패가 캐시에 남은 채 다시 들어오면 첫 로딩으로 본다(스펙 §7-3). errorUpdateCount 로 판정하면 여기서 깨진다.
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
