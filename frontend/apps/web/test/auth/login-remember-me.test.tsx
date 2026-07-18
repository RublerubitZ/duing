import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { User } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { LoginFormPanel } from '@/app/(auth)/login/_components/LoginFormPanel';

// LoginFormPanel.test.tsx 와 동일 관례: 실제 ApiClient(cookie transport) 를 주입하고 MSW 로 스텁,
// 요청 본문을 캡처해 rememberMe 전달을 검증한다 — TanStack Query 자체는 모킹하지 않는다.
const replaceSpy = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

const TEST_USER: User = {
  id: 1,
  studentId: '20261234',
  name: '테스터',
  phone: '010-0000-0000',
  grade: 'FRESHMAN',
  role: 'STUDENT',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  replaceSpy.mockReset();
  mockSearchParams = new URLSearchParams();
  useAuthStore.setState({ status: 'idle', user: null });
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

function captureLoginBody() {
  const captured: { value: unknown } = { value: null };
  server.use(
    http.post(`${BASE}/auth/web/login`, async ({ request }) => {
      captured.value = await request.json();
      return HttpResponse.json({ ok: true, data: { user: TEST_USER }, message: null });
    }),
  );
  return captured;
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('학번'), '20261234');
  await user.type(screen.getByLabelText('비밀번호'), 'Abcd1234!');
  await user.click(screen.getByRole('button', { name: /두잉 시작하기/ }));
}

describe('로그인 상태 유지 체크박스', () => {
  it('미체크(기본)면 로그인 페이로드에 rememberMe false 가 전달된다', async () => {
    const captured = captureLoginBody();
    const user = userEvent.setup();
    renderLoginForm();

    await submitCredentials(user);

    await waitFor(() => expect(captured.value).not.toBeNull());
    expect(captured.value).toMatchObject({ studentId: '20261234', rememberMe: false });
  });

  it('체크하면 로그인 페이로드에 rememberMe true 가 전달된다', async () => {
    const captured = captureLoginBody();
    const user = userEvent.setup();
    renderLoginForm();

    await user.click(screen.getByRole('checkbox', { name: /로그인 상태 유지/ }));
    await submitCredentials(user);

    await waitFor(() => expect(captured.value).not.toBeNull());
    expect(captured.value).toMatchObject({ rememberMe: true });
  });
});
