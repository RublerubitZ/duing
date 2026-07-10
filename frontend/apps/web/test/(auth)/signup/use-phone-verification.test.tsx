import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { usePhoneVerification } from '@/app/(auth)/signup/_lib/use-phone-verification';

// MSW 기반 훅 테스트 — TanStack Query 자체는 모킹하지 않고 네트워크 레벨에서 mocking 한다.
// (packages/hooks/test/interviewRound.test.tsx, authLogout.test.tsx 와 동일 패턴)

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const VALID_PHONE = '010-1234-5678';

const SESSION_FIXTURE = {
  verificationToken: 'verification-token-abc',
  code: '7K3M9PXQ',
  moNumber: '16663538',
  qrCode: null as string | null,
  expiresAt: '2026-07-10T12:05:00',
  expiresInSeconds: 300,
};

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

function mockIssue(overrides: Partial<typeof SESSION_FIXTURE> = {}) {
  server.use(
    http.post('*/auth/phone-verifications', () =>
      HttpResponse.json({ ok: true, data: { ...SESSION_FIXTURE, ...overrides }, message: null }),
    ),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePhoneVerification', () => {
  it('issue 성공 시 issued 로 전이하고 코드·만료초를 담는다', async () => {
    mockIssue();
    const { result } = renderHook(() => usePhoneVerification(VALID_PHONE), {
      wrapper: makeWrapper(newQueryClient()),
    });

    await act(async () => {
      await result.current.issue(false);
    });

    expect(result.current.status).toBe('issued');
    expect(result.current.code).toBe(SESSION_FIXTURE.code);
    expect(result.current.moNumber).toBe(SESSION_FIXTURE.moNumber);
    expect(result.current.remainingSeconds).toBe(SESSION_FIXTURE.expiresInSeconds);
    expect(result.current.verificationToken).toBe(SESSION_FIXTURE.verificationToken);
  });

  it('markSent 후 waiting 에서 폴링이 VERIFIED 를 받으면 verified 로 전이한다', async () => {
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

    const { result } = renderHook(() => usePhoneVerification(VALID_PHONE), {
      wrapper: makeWrapper(newQueryClient()),
    });

    await act(async () => {
      await result.current.issue(false);
    });

    act(() => {
      result.current.markSent();
    });
    expect(result.current.status).toBe('waiting');

    // 최초 즉시 폴링 — PENDING
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('waiting');

    // 3초 간격 재폴링 — VERIFIED
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.status).toBe('verified');
  });

  it('remainingSeconds 가 0 이 되면 expired 로 전이한다', async () => {
    mockIssue({ expiresInSeconds: 2 });
    const { result } = renderHook(() => usePhoneVerification(VALID_PHONE), {
      wrapper: makeWrapper(newQueryClient()),
    });

    await act(async () => {
      await result.current.issue(false);
    });
    expect(result.current.remainingSeconds).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.status).toBe('expired');
  });

  it('phone 이 바뀌면 idle 로 리셋된다(verified 였어도)', async () => {
    mockIssue();
    server.use(
      http.get('*/auth/phone-verifications/:token', () =>
        HttpResponse.json({
          ok: true,
          data: { status: 'VERIFIED', expiresInSeconds: 290, maskedPhone: '010-****-5678' },
          message: null,
        }),
      ),
    );

    const { result, rerender } = renderHook(
      ({ phone }: { phone: string }) => usePhoneVerification(phone),
      { wrapper: makeWrapper(newQueryClient()), initialProps: { phone: VALID_PHONE } },
    );

    await act(async () => {
      await result.current.issue(false);
    });
    act(() => {
      result.current.markSent();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('verified');

    rerender({ phone: '010-9999-8888' });

    expect(result.current.status).toBe('idle');
    expect(result.current.verificationToken).toBeNull();
  });

  it('잘못된 번호 형식으로 issue 하면 에러 메시지를 세팅하고 발급하지 않는다', async () => {
    let issueCalled = false;
    server.use(
      http.post('*/auth/phone-verifications', () => {
        issueCalled = true;
        return HttpResponse.json({ ok: true, data: SESSION_FIXTURE, message: null });
      }),
    );

    const { result } = renderHook(() => usePhoneVerification('010-1234-567'), {
      wrapper: makeWrapper(newQueryClient()),
    });

    await act(async () => {
      await result.current.issue(false);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).not.toBeNull();
    expect(issueCalled).toBe(false);
  });

  it('발급 60초 쿨다운 동안 canIssue 가 false 다', async () => {
    mockIssue();
    const { result } = renderHook(() => usePhoneVerification(VALID_PHONE), {
      wrapper: makeWrapper(newQueryClient()),
    });

    expect(result.current.canIssue).toBe(true);

    await act(async () => {
      await result.current.issue(false);
    });

    expect(result.current.resendCooldownSeconds).toBe(60);
    expect(result.current.canIssue).toBe(false);
  });
});
