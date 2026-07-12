import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';
import { createApiClient, TIMEOUT_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from '@duing/api';
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
});
afterAll(() => server.close());

function renderLoginForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
