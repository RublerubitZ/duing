import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';
import {
  createApiClient,
  registerConnectivityAdapter,
  TIMEOUT_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

import { LoginFormPanel } from '@/app/(auth)/login/_components/LoginFormPanel';

// 재현 실험(F6): API 무응답 시 catch 가 모든 오류를 자격증명 실패로 취급해 "학번 또는 비밀번호가
// 올바르지 않습니다" 를 오표시했다. LoginFormPanel.test.tsx 와 동일하게 실제 ApiClient 를 주입하고
// 네트워크 레벨(MSW)에서 스텁한다 — TanStack Query 자체는 모킹하지 않는다.
const replaceSpy = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  replaceSpy.mockReset();
  // 오프라인 테스트가 남긴 전역 상태를 원복한다(다른 테스트로 누수 방지).
  onlineManager.setOnline(true);
  registerConnectivityAdapter(null);
});
afterAll(() => server.close());

function renderLoginForm() {
  // mutations.networkMode: 'always' — providers.tsx 실제 옵션과 일치. 이게 없으면 onlineManager 가
  // offline 일 때 mutation 이 paused 되어 버튼이 "로그인 중…"으로 무한 유지된다(스펙 목표 1 위반).
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { networkMode: 'always' },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <LoginFormPanel />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

async function submitValidCredentials() {
  const user = userEvent.setup();
  renderLoginForm();

  await user.type(screen.getByLabelText('학번'), '20251234');
  await user.type(screen.getByLabelText('비밀번호'), 'Test1234!@');
  await user.click(screen.getByRole('button', { name: /두잉 시작하기/ }));
}

describe('LoginFormPanel 네트워크 오류 안내', () => {
  it('오프라인·연결 실패면 자격증명 오류가 아니라 연결 확인 안내를 표시한다', async () => {
    server.use(http.post(`${BASE}/auth/login`, () => HttpResponse.error()));

    await submitValidCredentials();

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('학번 또는 비밀번호가 올바르지 않습니다.')).not.toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('오프라인이면 mutation 이 paused 되지 않고 즉시 연결 확인 안내를 표시한다', async () => {
    // onlineManager offline + connectivity 어댑터 false. mutations.networkMode 'always' 덕에
    // mutation 이 paused 되지 않고 실행 → ky beforeRequest 가 fail-fast(NETWORK)로 즉시 거부한다.
    // networkMode 가 없으면 이 테스트는 paused 로 findByText 가 타임아웃되어 실패한다(RED 근거).
    onlineManager.setOnline(false);
    registerConnectivityAdapter(() => false);

    await submitValidCredentials();

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('학번 또는 비밀번호가 올바르지 않습니다.')).not.toBeInTheDocument();
    // 버튼이 "로그인 중…"에 묶이지 않고 복구된다.
    expect(screen.queryByRole('button', { name: /로그인 중/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /두잉 시작하기/ })).toBeEnabled();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('서버 오류(500)면 자격증명 오류가 아니라 일시적 오류 안내를 표시한다', async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 }),
      ),
    );

    await submitValidCredentials();

    expect(
      await screen.findByText('일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('학번 또는 비밀번호가 올바르지 않습니다.')).not.toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('타임아웃이면 자격증명 오류가 아니라 시간 초과 안내를 표시한다', async () => {
    server.use(
      http.post(`${BASE}/auth/login`, async () => {
        // REQUEST_TIMEOUT_MS.login(5_000ms) 을 넘겨 실제 ky TimeoutError 를 유발한다
        // (packages/api/test/timeoutPolicy.test.ts 와 동일 패턴).
        await delay(6_000);
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    await submitValidCredentials();

    expect(await screen.findByText(TIMEOUT_ERROR_MESSAGE, {}, { timeout: 7_000 })).toBeInTheDocument();
    expect(screen.queryByText('학번 또는 비밀번호가 올바르지 않습니다.')).not.toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  }, 10_000);
});
