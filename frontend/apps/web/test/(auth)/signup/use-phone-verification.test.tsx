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

    // VERIFIED 확정 후에는 refetchInterval=false 로 폴링이 멈춘다 — 타이머를 더 진행해도 재요청이 없다.
    const pollCountAtVerified = pollCount;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(pollCount).toBe(pollCountAtVerified);
  });

  it('일시적 폴링 실패 후 다음 성공 폴링에서 에러 메시지가 지워진다', async () => {
    mockIssue();
    let pollCount = 0;
    server.use(
      http.get('*/auth/phone-verifications/:token', () => {
        pollCount += 1;
        // 첫 폴링만 앱 레벨 실패(HTTP 200 + ok:false). 5xx 면 ky 가 백오프 타이머로 자동 재시도해
        // 한 폴링에 핸들러가 여러 번 불려 pollCount 가 어긋나므로, 재시도 없는 200 으로 결정적으로 1회 실패시킨다.
        if (pollCount === 1) {
          return HttpResponse.json({ ok: false, data: null, message: '일시적 확인 오류' });
        }
        return HttpResponse.json({
          ok: true,
          data: { status: 'VERIFIED', expiresInSeconds: 290, maskedPhone: '010-****-5678' },
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

    // 최초 즉시 폴링 — 503 실패로 에러 메시지가 노출된다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.errorMessage).not.toBeNull();
    expect(result.current.status).toBe('waiting');

    // 3초 뒤 재폴링 — VERIFIED 성공으로 에러 메시지가 지워지고 verified 로 전이한다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.status).toBe('verified');
    expect(result.current.errorMessage).toBeNull();
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

  it('발급 응답 도착 전에 번호가 바뀌면 그 응답을 무시한다(stale 가드)', async () => {
    // 발급(POST) 응답을 수동 release 전까지 지연시켜, 응답 in-flight 중 번호 변경 상황을 재현한다.
    let releaseIssue: () => void = () => {};
    const issueGate = new Promise<void>((resolve) => {
      releaseIssue = resolve;
    });
    server.use(
      http.post('*/auth/phone-verifications', async () => {
        await issueGate;
        return HttpResponse.json({ ok: true, data: SESSION_FIXTURE, message: null });
      }),
    );

    const { result, rerender } = renderHook(
      ({ phone }: { phone: string }) => usePhoneVerification(phone),
      { wrapper: makeWrapper(newQueryClient()), initialProps: { phone: VALID_PHONE } },
    );

    // 번호 A 로 발급 시작 (응답은 아직 지연 상태)
    let issuePromise: Promise<void> | undefined;
    act(() => {
      issuePromise = result.current.issue(false);
    });

    // 응답 도착 전에 번호를 B 로 변경 (previousPhoneRef 리셋 + latestPhoneRef=B)
    rerender({ phone: '010-9999-8888' });

    // 뒤늦게 A 응답을 release → stale 가드가 무시해야 한다
    releaseIssue();
    await act(async () => {
      await issuePromise;
      await vi.advanceTimersByTimeAsync(0);
    });

    // A 세션이 적용되지 않고 idle 유지 — 세션/코드/쿨다운 미세팅으로 즉시 재발급 가능(dead-end 아님)
    expect(result.current.status).toBe('idle');
    expect(result.current.session).toBeNull();
    expect(result.current.verificationToken).toBeNull();
    expect(result.current.code).toBe('');
    expect(result.current.resendCooldownSeconds).toBe(0);
    expect(result.current.canIssue).toBe(true);
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
