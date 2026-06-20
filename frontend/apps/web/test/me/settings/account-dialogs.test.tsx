import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { ProfileEditDialog } from '@/app/me/settings/_components/ProfileEditDialog';
import { PasswordChangeDialog } from '@/app/me/settings/_components/PasswordChangeDialog';
import { WithdrawAccountDialog } from '@/app/me/settings/_components/WithdrawAccountDialog';

const replaceSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn(), back: vi.fn() }),
}));

// clearSession 이 토큰을 정리할 수 있도록 인메모리 storage 주입.
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
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE });
const ok204 = () => new HttpResponse(null, { status: 204 });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  replaceSpy.mockReset();
  memoryStore.clear();
  useAuthStore.setState({ status: 'idle', user: null, accessToken: null });
});
afterAll(() => server.close());

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>{ui}</ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

describe('ProfileEditDialog', () => {
  it('전화번호가 자리수가 모자라면 에러를 보여주고 저장하지 않는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog open onClose={onClose} currentName="홍길동" currentPhone="010-1111-2222" currentGrade="JUNIOR" />,
    );

    const phone = screen.getByDisplayValue('010-1111-2222');
    await user.clear(phone);
    await user.type(phone, '01012');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(screen.getByText(/형식/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('숫자만 입력해도 하이픈이 자동으로 들어간다', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProfileEditDialog open onClose={vi.fn()} currentName="홍길동" currentPhone="010-1111-2222" currentGrade="JUNIOR" />,
    );

    const phone = screen.getByDisplayValue('010-1111-2222');
    await user.clear(phone);
    // 숫자만 타이핑 — 문자는 무시되고 010-XXXX-XXXX 로 포맷된다.
    await user.type(phone, '010a9999b8888');

    expect(screen.getByDisplayValue('010-9999-8888')).toBeInTheDocument();
  });

  it('유효한 값이면 PATCH 후 닫고 토스트를 띄운다', async () => {
    server.use(http.patch(`${BASE}/users/me`, ok204));
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog open onClose={onClose} currentName="홍길동" currentPhone="010-1111-2222" currentGrade="JUNIOR" />,
    );

    const name = screen.getByDisplayValue('홍길동');
    await user.clear(name);
    await user.type(name, '김두잉');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText('프로필을 수정했어요.')).toBeInTheDocument();
  });

  it('학년 셀렉트가 렌더되고, 학년을 변경하면 PATCH 페이로드에 grade가 포함된다', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${BASE}/users/me`, async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>;
        return ok204();
      }),
    );

    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog open onClose={onClose} currentName="홍길동" currentPhone="010-1111-2222" currentGrade="JUNIOR" />,
    );

    // 학년 셀렉트가 노출되고 현재 값(3학년)이 선택되어 있다.
    expect(screen.getByRole('option', { name: '3학년' })).toBeInTheDocument();

    // 학년을 4학년으로 변경한다.
    await user.selectOptions(screen.getByRole('combobox'), '4학년');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(capturedBody).toMatchObject({ grade: 'SENIOR' });
  });
});

describe('PasswordChangeDialog', () => {
  it('새 비밀번호 확인이 일치하지 않으면 에러를 보여준다', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordChangeDialog open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('현재 비밀번호'), 'Old1234!');
    await user.type(screen.getByLabelText('새 비밀번호'), 'New5678!');
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'New9999!');
    await user.click(screen.getByRole('button', { name: '변경하기' }));

    expect(screen.getByText(/일치하지 않/)).toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('성공하면 세션을 정리하고 로그인으로 보낸다', async () => {
    server.use(http.patch(`${BASE}/users/me/password`, ok204));
    useAuthStore.setState({ status: 'authenticated', accessToken: 'x' });
    const user = userEvent.setup();
    renderWithProviders(<PasswordChangeDialog open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('현재 비밀번호'), 'Old1234!');
    await user.type(screen.getByLabelText('새 비밀번호'), 'New5678!');
    await user.type(screen.getByLabelText('새 비밀번호 확인'), 'New5678!');
    await user.click(screen.getByRole('button', { name: '변경하기' }));

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/login'));
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});

describe('WithdrawAccountDialog', () => {
  it('탈퇴에 성공하면 세션을 정리하고 홈으로 보낸다', async () => {
    server.use(http.delete(`${BASE}/users/me`, ok204));
    useAuthStore.setState({ status: 'authenticated', accessToken: 'x' });
    const user = userEvent.setup();
    renderWithProviders(<WithdrawAccountDialog open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    await waitFor(() => expect(replaceSpy).toHaveBeenCalledWith('/'));
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('회장이라 탈퇴할 수 없으면(409) 사유를 보여주고 이동하지 않는다', async () => {
    server.use(
      http.delete(`${BASE}/users/me`, () =>
        HttpResponse.json(
          { ok: false, data: null, message: '동아리 회장은 회장직을 인계한 뒤 탈퇴할 수 있습니다.' },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<WithdrawAccountDialog open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '탈퇴하기' }));

    expect(await screen.findByText(/회장직을 인계/)).toBeInTheDocument();
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
