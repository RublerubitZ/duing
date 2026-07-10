import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { User } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';

import { LoginFormPanel } from '@/app/(auth)/login/_components/LoginFormPanel';

// LoginForm 은 useRouter 뿐 아니라 useSearchParams(next 파라미터)도 사용한다 —
// ManagePage.test.tsx / faq-page.test.tsx 와 동일하게 둘 다 모킹해야 한다.
const replaceSpy = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

// 로그인 성공 시 setSession 이 토큰을 저장할 수 있도록 인메모리 storage 주입
// (account-dialogs.test.tsx / session-expiry.test.tsx 와 동일 패턴).
const memoryStore = new Map<string, string>();
setStorage({
  getItem: (key) => Promise.resolve(memoryStore.get(key) ?? null),
  setItem: (key, value) => {
    memoryStore.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key) => {
    memoryStore.delete(key);
    return Promise.resolve();
  },
});

const BASE = 'http://localhost:8080/api/v1';
// 실제 ApiClient 를 주입하고 네트워크 레벨(MSW)에서 스텁한다 — TanStack Query 자체는 모킹하지 않는다
// (use-phone-verification.test.tsx, account-dialogs.test.tsx 와 동일 패턴).
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE });

const TEST_USER: User = {
  id: 1,
  studentId: '20240001',
  name: '홍길동',
  email: '20240001@daegu.ac.kr',
  phone: '010-1234-5678',
  grade: 'FRESHMAN',
  role: 'STUDENT',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  replaceSpy.mockReset();
  memoryStore.clear();
  mockSearchParams = new URLSearchParams();
  useAuthStore.setState({ status: 'idle', user: null, accessToken: null });
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

// studentId 가 pattern="\d{8}" 을 만족하지 않으면 jsdom 도 브라우저처럼 제출 버튼 클릭 시
// 네이티브 제약 검증에서 submit 이벤트 자체를 막는다. zod 백스톱(handleSubmit)을 직접 검증하려면
// 제출 컨트롤의 활성화 동작을 거치지 않는 form submit 이벤트를 직접 발생시켜야 한다.
function submitForm(container: HTMLElement) {
  const form = container.querySelector('form');
  if (!form) throw new Error('로그인 폼을 찾을 수 없습니다.');
  fireEvent.submit(form);
}

describe('LoginFormPanel', () => {
  it('학번이 8자리가 아니면 제출 시 검증 에러를 보여준다', async () => {
    let loginCalled = false;
    server.use(
      http.post(`${BASE}/auth/login`, () => {
        loginCalled = true;
        return HttpResponse.json({
          ok: true,
          data: { accessToken: 'unused', tokenType: 'Bearer', user: TEST_USER },
          message: null,
        });
      }),
    );
    const user = userEvent.setup();
    const { container } = renderLoginForm();

    await user.type(screen.getByLabelText('학번'), '2024');
    await user.type(screen.getByLabelText('비밀번호'), 'password1234');
    submitForm(container);

    expect(screen.getByText('학번은 8자리 숫자여야 합니다.')).toBeInTheDocument();
    expect(loginCalled).toBe(false);
  });

  it('유효한 학번·비밀번호로 제출하면 login 을 호출한다', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(`${BASE}/auth/login`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          ok: true,
          data: { accessToken: 'access-token-abc', tokenType: 'Bearer', user: TEST_USER },
          message: null,
        });
      }),
    );
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText('학번'), '20240001');
    await user.type(screen.getByLabelText('비밀번호'), 'password1234');
    await user.click(screen.getByRole('button', { name: /두잉 시작하기/ }));

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/me'));
    expect(capturedBody).toEqual({ studentId: '20240001', password: 'password1234' });
  });

  it('로그인 실패 시 학번 기준 에러 문구를 보여준다', async () => {
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json({ ok: false, data: null, message: 'Invalid credentials' }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText('학번'), '20240001');
    await user.type(screen.getByLabelText('비밀번호'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /두잉 시작하기/ }));

    expect(await screen.findByText('학번 또는 비밀번호가 올바르지 않습니다.')).toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
