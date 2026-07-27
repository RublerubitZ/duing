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
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

const TEST_USER: User = {
  id: 1,
  studentId: '20240001',
  name: '홍길동',
  phone: '010-1234-5678',
  grade: 'FRESHMAN',
  role: 'STUDENT',
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  replaceSpy.mockReset();
  memoryStore.clear();
  window.localStorage.removeItem('duing.accessToken');
  mockSearchParams = new URLSearchParams();
  useAuthStore.setState({ status: 'idle', user: null });
});
afterAll(() => server.close());

function renderLoginForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <LoginFormPanel />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  return { queryClient, ...renderResult };
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
      http.post(`${BASE}/auth/web/login`, () => {
        loginCalled = true;
        return HttpResponse.json({
          ok: true,
          data: { user: TEST_USER },
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

  // 로그인 페이지는 세션 보유 상태에서도 열린다(사용자 전환) — 이전 계정의 캐시가
  // 새 계정 화면에 렌더되지 않도록 로그인 성공이 캐시를 비워야 한다(공용 단말 정보 노출 방지).
  it('로그인 성공 시 이전 계정의 React Query 캐시를 비운다', async () => {
    server.use(
      http.post(`${BASE}/auth/web/login`, () =>
        HttpResponse.json({ ok: true, data: { user: TEST_USER }, message: null }),
      ),
    );
    const user = userEvent.setup();
    const { container, queryClient } = renderLoginForm();
    queryClient.setQueryData(['users', 'me'], { id: 99, name: '이전사용자' });

    await user.type(screen.getByLabelText('학번'), '20240001');
    await user.type(screen.getByLabelText('비밀번호'), 'password1234');
    submitForm(container);

    await waitFor(() => expect(useAuthStore.getState().status).toBe('authenticated'));
    expect(queryClient.getQueryData(['users', 'me'])).toBeUndefined();
  });

  it('유효한 학번·비밀번호로 제출하면 login 을 호출한다', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post(`${BASE}/auth/web/login`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          ok: true,
          data: { user: TEST_USER },
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
    expect(capturedBody).toEqual({ studentId: '20240001', password: 'password1234', rememberMe: false });
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', user: TEST_USER });
    expect('accessToken' in useAuthStore.getState()).toBe(false);
    expect(window.localStorage.getItem('duing.accessToken')).toBeNull();
  });

  it('로그인 실패 시 학번 기준 에러 문구를 보여준다', async () => {
    server.use(
      http.post(`${BASE}/auth/web/login`, () =>
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

  // 정지된 계정은 비밀번호가 맞아도 로그인이 막힌다. 이때 자격증명 문구를 보여주면 사용자가 맞는
  // 비밀번호를 계속 의심하며 재시도하고, 문의할 곳도 알지 못한다.
  it('정지된 계정이면 자격증명 문구 대신 정지 안내와 문의처를 보여준다', async () => {
    server.use(
      http.post(`${BASE}/auth/web/login`, () =>
        HttpResponse.json(
          {
            ok: false,
            data: null,
            message: '정지된 계정입니다. 총동아리연합회로 문의해 주세요.',
            code: 'ACCOUNT_SUSPENDED',
          },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText('학번'), '20240001');
    await user.type(screen.getByLabelText('비밀번호'), 'correctpassword');
    await user.click(screen.getByRole('button', { name: /두잉 시작하기/ }));

    expect(
      await screen.findByText('정지된 계정입니다. 총동아리연합회로 문의해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('학번 또는 비밀번호가 올바르지 않습니다.')).not.toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  // 연속 실패로 계정이 잠긴 것도 자격증명 문제가 아니다 — 얼마나 기다려야 하는지가 안내의 핵심인데
  // 일반 장애 문구로 덮으면 그 정보가 사라진다.
  it('연속 실패로 계정이 잠기면 서버가 준 잠금 안내를 그대로 보여준다', async () => {
    server.use(
      http.post(`${BASE}/auth/web/login`, () =>
        HttpResponse.json(
          {
            ok: false,
            data: null,
            message: '로그인 시도가 너무 많아 계정이 일시적으로 잠겼습니다. 잠시 후 다시 시도해주세요.',
          },
          { status: 429 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText('학번'), '20240001');
    await user.type(screen.getByLabelText('비밀번호'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /두잉 시작하기/ }));

    expect(
      await screen.findByText(
        '로그인 시도가 너무 많아 계정이 일시적으로 잠겼습니다. 잠시 후 다시 시도해주세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('학번 또는 비밀번호가 올바르지 않습니다.')).not.toBeInTheDocument();
  });

  // 검증 오류(400)는 필드명이 섞인 서버 문구라 그대로 노출하면 안 된다. 프론트 zod 가 먼저 막으므로
  // 여기까지 오는 것은 입력 형식 문제이고, 사용자에게는 입력을 다시 보라는 안내가 맞다.
  it('서버 검증 오류는 필드명이 섞인 원문 대신 입력 확인 문구로 대체한다', async () => {
    server.use(
      http.post(`${BASE}/auth/web/login`, () =>
        HttpResponse.json(
          { ok: false, data: null, message: 'studentId: 학번은 8자리 숫자여야 합니다.' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderLoginForm();

    await user.type(screen.getByLabelText('학번'), '20240001');
    await user.type(screen.getByLabelText('비밀번호'), 'somepassword');
    await user.click(screen.getByRole('button', { name: /두잉 시작하기/ }));

    expect(await screen.findByText('학번 또는 비밀번호가 올바르지 않습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/studentId:/)).not.toBeInTheDocument();
  });
});
