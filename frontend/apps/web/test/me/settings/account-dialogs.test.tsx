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
  useAuthStore.setState({ status: 'idle', user: null });
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
  it('유효한 값이면 PATCH 후 닫고 토스트를 띄운다', async () => {
    server.use(http.patch(`${BASE}/users/me`, ok204));
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog
        open
        onClose={onClose}
        currentName="홍길동"
        currentGrade="JUNIOR"
        currentCollege="IT_ENGINEERING"
        currentMajor="컴퓨터정보공학부"
      />,
    );

    const name = screen.getByDisplayValue('홍길동');
    await user.clear(name);
    await user.type(name, '김두잉');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText('프로필을 수정했어요.')).toBeInTheDocument();
  });

  it('전환기(college/major 미시드)에는 이름·학년만 저장하고 payload 에서 college·major 를 생략한다', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    server.use(
      http.patch(`${BASE}/users/me`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return ok204();
      }),
    );

    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog open onClose={onClose} currentName="홍길동" currentGrade="JUNIOR" />,
    );

    // college='' · major='' 인 전환기에도 이름·학년 수정은 막히지 않는다.
    const name = screen.getByDisplayValue('홍길동');
    await user.clear(name);
    await user.type(name, '김두잉');
    await user.selectOptions(screen.getByLabelText('학년'), '4학년');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(capturedBody).toEqual({ name: '김두잉', grade: 'SENIOR' });
    expect(capturedBody).not.toHaveProperty('college');
    expect(capturedBody).not.toHaveProperty('major');
  });

  it('시드된 전공을 모두 지우고 저장하면 API 호출 없이 필수 오류를 보여준다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog
        open
        onClose={onClose}
        currentName="홍길동"
        currentGrade="JUNIOR"
        currentCollege="IT_ENGINEERING"
        currentMajor="컴퓨터정보공학부"
      />,
    );

    // 시드된 필수 필드(전공)를 비워 저장하면 침묵 복원 대신 명시적 에러.
    // (MSW 핸들러 미등록 + onUnhandledRequest: 'error' 로 "API 호출 없음"도 함께 검증)
    const major = screen.getByDisplayValue('컴퓨터정보공학부');
    await user.clear(major);
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('전공 학과는 필수 입력값입니다.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('단과대학·전공을 변경하면 PATCH 페이로드에 college·major가 포함된다', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.patch(`${BASE}/users/me`, async ({ request }) => {
        capturedBody = await request.json();
        return ok204();
      }),
    );

    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog
        open
        onClose={onClose}
        currentName="홍길동"
        currentGrade="JUNIOR"
        currentCollege="IT_ENGINEERING"
        currentMajor="컴퓨터정보공학부"
      />,
    );

    // 시드된 현재 값이 노출된다.
    expect(screen.getByDisplayValue('컴퓨터정보공학부')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('단과대학'), '간호대학');
    const major = screen.getByDisplayValue('컴퓨터정보공학부');
    await user.clear(major);
    await user.type(major, '간호학과');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(capturedBody).toMatchObject({ college: 'NURSING', major: '간호학과' });
  });

  // 아래 두 케이스는 MSW 핸들러를 등록하지 않는다 — 검증 실패 시 PATCH 가 나가면
  // onUnhandledRequest: 'error' 로 테스트가 실패하므로 "API 호출 없음"까지 함께 검증된다.
  it('한글 2~7자가 아닌 이름이면 API 호출 없이 오류 메시지를 보여준다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog open onClose={onClose} currentName="홍길동" currentGrade="JUNIOR" />,
    );

    const name = screen.getByDisplayValue('홍길동');
    await user.clear(name);
    await user.type(name, 'Terry');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByText('이름은 한글 2~7자만 입력할 수 있습니다.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('금칙어 이름이면 API 호출 없이 안내 메시지를 보여준다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog open onClose={onClose} currentName="홍길동" currentGrade="JUNIOR" />,
    );

    const name = screen.getByDisplayValue('홍길동');
    await user.clear(name);
    await user.type(name, '테스트');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(
      await screen.findByText('사용할 수 없는 이름입니다. 다른 이름을 입력해 주세요.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('학년 셀렉트가 렌더되고, 학년을 변경하면 PATCH 페이로드에 grade가 포함된다', async () => {
    let capturedBody: unknown = null;
    server.use(
      http.patch(`${BASE}/users/me`, async ({ request }) => {
        capturedBody = await request.json();
        return ok204();
      }),
    );

    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <ProfileEditDialog
        open
        onClose={onClose}
        currentName="홍길동"
        currentGrade="JUNIOR"
        currentCollege="IT_ENGINEERING"
        currentMajor="컴퓨터정보공학부"
      />,
    );

    // 학년 셀렉트가 노출되고 현재 값(3학년)이 선택되어 있다.
    expect(screen.getByRole('option', { name: '3학년' })).toBeInTheDocument();

    // 학년을 4학년으로 변경한다(단과대학 셀렉트가 추가되어 label 로 특정한다).
    await user.selectOptions(screen.getByLabelText('학년'), '4학년');
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
    useAuthStore.setState({ status: 'authenticated' });
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
    useAuthStore.setState({ status: 'authenticated' });
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
