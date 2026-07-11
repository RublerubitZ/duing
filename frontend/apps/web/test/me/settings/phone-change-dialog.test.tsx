import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ReactElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { PhoneChangeDialog } from '@/app/me/settings/_components/PhoneChangeDialog';

// 번호(복구 수단) 변경 성공 시 세션이 무효화되어 재로그인으로 보내진다 — account-dialogs 하네스와 동일하게
// next/navigation 을 모킹해 리다이렉트를 단언한다.
const mockRouterReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn(), back: vi.fn() }),
}));

// 인메모리 storage 주입(account-dialogs 하네스 동일) — api client·clearSession 의 세션 접근을 결정적으로 만든다.
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

// use-phone-verification.test 의 세션 픽스처와 동일 shape. verificationToken 은 완료 페이로드가
// "토큰 + 현재 비밀번호"만 담는지 검증하기 위해 눈에 띄는 값으로 둔다.
const SESSION_FIXTURE = {
  verificationToken: 'phone-change-token-777',
  code: '7K3M9PXQ',
  moNumber: '16663538',
  qrCode: null as string | null,
  expiresAt: '2026-07-11T12:05:00',
  expiresInSeconds: 300,
};

const CURRENT_PASSWORD = 'Curr1234!';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  // 전화번호 변경은 로그인 사용자 흐름이다 — 세션을 세팅해 실제 사용 맥락과 맞춘다.
  useAuthStore.setState({ status: 'authenticated', accessToken: 'x' });
});
afterEach(() => {
  server.resetHandlers();
  memoryStore.clear();
  mockRouterReplace.mockReset();
  useAuthStore.setState({ status: 'idle', user: null, accessToken: null });
  vi.useRealTimers();
});
afterAll(() => server.close());

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <ToastProvider>{ui}</ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

function mockIssue() {
  server.use(
    http.post(`${BASE}/users/me/phone-verifications`, () =>
      HttpResponse.json({ ok: true, data: SESSION_FIXTURE, message: null }, { status: 201 }),
    ),
  );
}

function mockPollVerified() {
  // SignupFormPanel.test 폴링 시나리오 재현 — 1회차 PENDING, 이후 VERIFIED.
  let pollCount = 0;
  server.use(
    http.post(`${BASE}/auth/phone-verifications/status`, () => {
      pollCount += 1;
      return HttpResponse.json({
        ok: true,
        data: {
          status: pollCount < 2 ? 'PENDING' : 'VERIFIED',
          expiresInSeconds: 290,
          maskedPhone: '010-****-8888',
        },
        message: null,
      });
    }),
  );
}

// 발급→문자수신→폴링 VERIFIED 까지 몰아 verified 상태로 만든다(fake timers 전제).
async function issueAndVerify() {
  mockIssue();
  mockPollVerified();

  fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '01099998888' } });
  fireEvent.click(screen.getByRole('button', { name: '인증 시작' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

  fireEvent.click(screen.getByRole('button', { name: '문자를 보냈어요' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
}

// 성공 onSuccess(await clearSession → clear → toast → replace)의 마이크로태스크까지 흘려준다.
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('PhoneChangeDialog', () => {
  it('인증 후 현재 비밀번호를 입력하고 [번호 변경하기]를 누르면 토큰+비밀번호만 전송하고 재로그인으로 보낸다', async () => {
    vi.useFakeTimers();
    let capturedBody: unknown = null;
    // 보안 게이트: PATCH 는 오직 [번호 변경하기] 클릭에서만 발화해야 한다. 호출 횟수를 세어
    // verified 전이만으로 자동 발화되는 회귀를 RED 로 잡는다.
    let patchCallCount = 0;
    server.use(
      http.patch(`${BASE}/users/me/phone`, async ({ request }) => {
        patchCallCount += 1;
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const onClose = vi.fn();
    renderWithProviders(<PhoneChangeDialog open onClose={onClose} />);

    await issueAndVerify();

    // VERIFIED 도달 직후·현재 비밀번호 입력 전 — 자동 발화가 없어야 하고, 확인 필드가 노출된다.
    expect(patchCallCount).toBe(0);
    const changeButton = screen.getByRole('button', { name: '번호 변경하기' });
    // 현재 비밀번호가 비어 있으면 [번호 변경하기]는 비활성이다(step-up 강제).
    expect(changeButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: CURRENT_PASSWORD } });
    expect(changeButton).toBeEnabled();
    // 입력만으로는 발화하지 않는다.
    expect(patchCallCount).toBe(0);

    fireEvent.click(changeButton);
    await flush();

    // 명시적 클릭 이후에만, 정확히 1회 발화한다.
    expect(patchCallCount).toBe(1);
    // 완료 페이로드는 토큰 + 현재 비밀번호뿐 — 현재 입력값(전화번호)은 절대 담지 않는다.
    expect(capturedBody).toEqual({
      verificationToken: SESSION_FIXTURE.verificationToken,
      currentPassword: CURRENT_PASSWORD,
    });
    // 세션 무효화 → 재로그인 안내 토스트 + 로그인 리다이렉트. onClose 는 호출되지 않는다.
    expect(screen.getByText('전화번호가 변경되었어요. 다시 로그인해 주세요.')).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('현재 비밀번호가 틀리면(400) 에러를 보여주고 인증 상태를 유지한 채 재시도할 수 있다', async () => {
    vi.useFakeTimers();
    let patchCallCount = 0;
    server.use(
      http.patch(`${BASE}/users/me/phone`, () => {
        patchCallCount += 1;
        if (patchCallCount === 1) {
          return HttpResponse.json(
            {
              ok: false,
              data: null,
              message: '현재 비밀번호가 일치하지 않습니다.',
              code: 'INVALID_CURRENT_PASSWORD',
            },
            { status: 400 },
          );
        }
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const onClose = vi.fn();
    renderWithProviders(<PhoneChangeDialog open onClose={onClose} />);

    await issueAndVerify();

    // 틀린 현재 비밀번호로 시도 → 400.
    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'Wrong9999!' } });
    fireEvent.click(screen.getByRole('button', { name: '번호 변경하기' }));
    await flush();

    // 서버 메시지를 그대로 보여주고, 인증 상태(verified)는 유지된다 — 재인증 없이 재시도 가능.
    expect(screen.getByText('현재 비밀번호가 일치하지 않습니다.')).toBeInTheDocument();
    expect(screen.getByLabelText('현재 비밀번호')).toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();

    // 비밀번호만 고쳐 다시 누르면(같은 인증 세션) 성공한다.
    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: CURRENT_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: '번호 변경하기' }));
    await flush();

    expect(patchCallCount).toBe(2);
    expect(screen.getByText('전화번호가 변경되었어요. 다시 로그인해 주세요.')).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });

  it('세션이 만료(403)면 인증 스텝으로 되돌리고 안내를 보여준다', async () => {
    vi.useFakeTimers();
    server.use(
      http.patch(`${BASE}/users/me/phone`, () =>
        HttpResponse.json(
          { ok: false, data: null, message: '휴대폰 인증이 만료됐어요.', code: 'PHONE_NOT_VERIFIED' },
          { status: 403 },
        ),
      ),
    );
    const onClose = vi.fn();
    renderWithProviders(<PhoneChangeDialog open onClose={onClose} />);

    await issueAndVerify();

    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: CURRENT_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: '번호 변경하기' }));
    await flush();

    expect(
      screen.getByText('인증이 만료됐어요. 새 번호 인증을 다시 진행해주세요.'),
    ).toBeInTheDocument();
    // reset() 으로 idle 복귀 → 인증 시작 버튼이 다시 노출되고, 현재 비밀번호 필드는 사라진다.
    expect(screen.getByRole('button', { name: '인증 시작' })).toBeInTheDocument();
    expect(screen.queryByLabelText('현재 비밀번호')).not.toBeInTheDocument();
    // 실패 시 닫거나 이동하지 않는다.
    expect(onClose).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('닫았다 다시 열면 이전 인증 상태와 비밀번호 입력이 남지 않는다', async () => {
    vi.useFakeTimers();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            다시 열기
          </button>
          <PhoneChangeDialog open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    renderWithProviders(<Harness />);

    // 인증을 끝까지(VERIFIED) 몰고 현재 비밀번호까지 입력해 [번호 변경하기]가 활성인 상태로 만든다 —
    // verified + stale 토큰 + 입력한 비밀번호가 남은 채 재오픈되는 회귀까지 초기화 대상에 포함시킨다.
    await issueAndVerify();
    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: CURRENT_PASSWORD } });
    expect(screen.getByRole('button', { name: '번호 변경하기' })).toBeEnabled();

    // 닫기.
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 다시 열기 → idle 초기화(휴대폰 번호 입력 노출·빈 값, verified 흔적·비밀번호 필드·확정 버튼 없음).
    fireEvent.click(screen.getByRole('button', { name: '다시 열기' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByLabelText('휴대폰 번호')).toHaveValue('');
    expect(screen.queryByRole('button', { name: '문자를 보냈어요' })).not.toBeInTheDocument();
    // verified 잔상이 없으므로 현재 비밀번호 필드는 숨겨지고 [번호 변경하기]는 다시 비활성이다.
    expect(screen.queryByLabelText('현재 비밀번호')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '번호 변경하기' })).toBeDisabled();

    // 재인증하면 비밀번호 필드가 다시 노출되며, 이전 입력이 남지 않고 비어 있다(state 리셋 증거).
    await issueAndVerify();
    expect(screen.getByLabelText('현재 비밀번호')).toHaveValue('');
    expect(screen.getByRole('button', { name: '번호 변경하기' })).toBeDisabled();
  });

  it('변경 요청이 진행 중이면 ESC 로 닫히지 않고, 응답이 오면 재로그인으로 보낸다', async () => {
    vi.useFakeTimers();
    // PATCH 응답을 수동 게이트로 붙잡아, 요청이 pending 인 구간을 만든다.
    let resolvePatch = () => {};
    const patchGate = new Promise<void>((resolve) => {
      resolvePatch = resolve;
    });
    server.use(
      http.patch(`${BASE}/users/me/phone`, async () => {
        await patchGate;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const onClose = vi.fn();
    renderWithProviders(<PhoneChangeDialog open onClose={onClose} />);

    await issueAndVerify();

    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: CURRENT_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: '번호 변경하기' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // 요청이 pending — 버튼이 '변경 중…' 으로 바뀐다.
    expect(screen.getByRole('button', { name: '변경 중…' })).toBeInTheDocument();

    // pending 구간에 ESC 를 눌러도 닫히지 않는다(오버레이/ESC 닫힘 경로 가드).
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onClose).not.toHaveBeenCalled();

    // 응답 도착 → 성공 토스트 + 재로그인 리다이렉트(세션 무효화로 onClose 대신 이동).
    resolvePatch();
    await flush();
    expect(screen.getByText('전화번호가 변경되었어요. 다시 로그인해 주세요.')).toBeInTheDocument();
    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
    expect(onClose).not.toHaveBeenCalled();
  });
});
