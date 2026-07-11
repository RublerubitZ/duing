import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

// next/navigation.useRouter 를 모킹해 재설정 성공 후 replace 인자를 검증한다(SignupFormPanel.test 선례).
const mockRouterReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// next/navigation 모킹 팩토리가 mockRouterReplace 초기화 이후 실행되도록 패널 import 를 아래에 둔다.
import { ForgotPasswordPanel } from '@/app/(auth)/forgot-password/_components/ForgotPasswordPanel';

// MSW 기반 통합 테스트 — SignupFormPanel.test 와 동일한 provider/stub-client·fake timers 패턴.
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  mockRouterReplace.mockReset();
  vi.useRealTimers();
});
afterAll(() => server.close());

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

// 비밀번호 재설정 세션 픽스처 — SignupFormPanel.test 의 세션 shape 에 maskedPhone(등록 번호) 추가.
const SESSION_FIXTURE = {
  verificationToken: 'verification-token-abc',
  code: '7K3M9PXQ',
  moNumber: '16663538',
  qrCode: null as string | null,
  expiresAt: '2026-07-10T12:05:00',
  expiresInSeconds: 300,
  maskedPhone: '010-****-5678',
};

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPanel() {
  const queryClient = newQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </ApiClientProvider>
    );
  }
  return render(<ForgotPasswordPanel />, { wrapper: Wrapper });
}

function mockIssue() {
  server.use(
    http.post('*/auth/password-resets', () =>
      HttpResponse.json({ ok: true, data: SESSION_FIXTURE, message: null }, { status: 202 }),
    ),
  );
}

// 학번 입력→인증 시작(발급)→문자수신→폴링 VERIFIED 까지 몰아 새 비밀번호 폼 단계로 진입시키는 헬퍼.
// SignupFormPanel.test 의 폴링 시나리오(pollCount<2 이면 PENDING, 이후 VERIFIED)를 재현한다.
async function startVerifyReset() {
  mockIssue();
  let pollCount = 0;
  server.use(
    http.get('*/auth/phone-verifications/:token', () => {
      pollCount += 1;
      return HttpResponse.json({
        ok: true,
        data: {
          status: pollCount < 2 ? 'PENDING' : 'VERIFIED',
          expiresInSeconds: 290,
          maskedPhone: '010-****-5678',
        },
        message: null,
      });
    }),
  );

  // 학번 입력 → 인증 시작 → 발급 응답 반영(issued)
  fireEvent.change(screen.getByLabelText('학번'), { target: { value: '20240001' } });
  fireEvent.click(screen.getByRole('button', { name: '인증 시작' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

  // 문자를 보냈어요 → waiting → 즉시 폴링(PENDING) → 3초 재폴링(VERIFIED)
  fireEvent.click(screen.getByRole('button', { name: '문자를 보냈어요' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
}

describe('ForgotPasswordPanel — 문자 인증 기반 비밀번호 재설정', () => {
  it('학번을 입력해 인증을 시작하면 마스킹된 등록 번호를 안내한다', async () => {
    vi.useFakeTimers();
    renderPanel();
    mockIssue();

    fireEvent.change(screen.getByLabelText('학번'), { target: { value: '20240001' } });
    fireEvent.click(screen.getByRole('button', { name: '인증 시작' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 등록된 번호(마스킹) 안내 + 인증 UI(코드) 노출.
    expect(screen.getByText('010-****-5678')).toBeInTheDocument();
    expect(screen.getByText('7K3M9PXQ')).toBeInTheDocument();
  });

  it('인증이 완료되면 새 비밀번호 입력 폼이 나타난다', async () => {
    vi.useFakeTimers();
    renderPanel();

    await startVerifyReset();

    expect(screen.getByLabelText('새 비밀번호')).toBeInTheDocument();
    expect(screen.getByLabelText('새 비밀번호 확인')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '비밀번호 재설정' })).toBeInTheDocument();
  });

  it('새 비밀번호 재설정에 성공하면 로그인으로 이동한다', async () => {
    vi.useFakeTimers();
    renderPanel();

    // 완료 엔드포인트 호출을 카운트/캡처한다 — 인증 완료(VERIFIED)만으로 자동 호출되지 않음을 함께 검증.
    let capturedCompleteBody: unknown = null;
    let completeCallCount = 0;
    server.use(
      http.post('*/auth/password-resets/complete', async ({ request }) => {
        completeCallCount += 1;
        capturedCompleteBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await startVerifyReset();

    // 자동 완료 금지: VERIFIED 로 전이해도 [비밀번호 재설정] 제출 전에는 complete 가 호출되지 않는다.
    expect(completeCallCount).toBe(0);

    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'duing1234!' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'duing1234!' } });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 명시적 제출로 정확히 1회 호출되고, 페이로드에는 학번이 없다(토큰+새 비밀번호만).
    expect(completeCallCount).toBe(1);
    expect(capturedCompleteBody).toEqual({
      verificationToken: 'verification-token-abc',
      newPassword: 'duing1234!',
    });
    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });

  it('완료가 403 이면 인증 단계로 되돌아간다', async () => {
    vi.useFakeTimers();
    renderPanel();

    server.use(
      http.post('*/auth/password-resets/complete', () =>
        HttpResponse.json(
          { ok: false, data: null, message: '휴대폰 인증이 만료됐어요.', code: 'PHONE_NOT_VERIFIED' },
          { status: 403 },
        ),
      ),
    );

    await startVerifyReset();

    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'duing1234!' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'duing1234!' } });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // 학번 입력 스텝(인증 시작 버튼) 복귀 + 만료 안내. 새 비밀번호 폼은 사라진다.
    expect(screen.getByText('인증이 만료됐어요. 처음부터 다시 진행해주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증 시작' })).toBeInTheDocument();
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
