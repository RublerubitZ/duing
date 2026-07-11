import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '../src/api-context';
import {
  useChangePhoneMutation,
  useCompletePasswordResetMutation,
  useRequestPasswordResetMutation,
  useStartPhoneChangeVerificationMutation,
} from '../src/auth';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  };
}

function newQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const wrapper = makeWrapper(newQueryClient());

const SESSION = {
  verificationToken: 'token-1',
  code: 'CODE1234',
  moNumber: '16663538',
  qrCode: null,
  expiresAt: '2099-01-01T00:00:00',
  expiresInSeconds: 300,
};

describe('번호 변경·비밀번호 재설정 훅', () => {
  it('번호 변경 인증 시작은 인증 전용 엔드포인트를 호출한다', async () => {
    let requestedPath = '';
    server.use(
      http.post('*/users/me/phone-verifications', ({ request }) => {
        const url = new URL(request.url);
        requestedPath = url.pathname + url.search;
        return HttpResponse.json({ ok: true, data: SESSION, message: null }, { status: 201 });
      }),
    );

    const { result } = renderHook(() => useStartPhoneChangeVerificationMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ payload: { phone: '010-1234-5678' }, includeQr: true });
    });

    expect(requestedPath).toContain('/users/me/phone-verifications');
    expect(requestedPath).toContain('qr=true');
  });

  it('번호 변경 성공 시 내 정보 쿼리를 무효화한다', async () => {
    server.use(http.patch('*/users/me/phone', () => new HttpResponse(null, { status: 204 })));

    const queryClient = newQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useChangePhoneMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ verificationToken: 'token-1' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users', 'me'] });
  });

  it('재설정 시작은 마스킹 번호가 포함된 세션을 반환한다', async () => {
    server.use(
      http.post('*/auth/password-resets', () =>
        HttpResponse.json(
          { ok: true, data: { ...SESSION, maskedPhone: '010-****-5678' }, message: null },
          { status: 202 },
        ),
      ),
    );

    const { result } = renderHook(() => useRequestPasswordResetMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ payload: { studentId: '20240001' }, includeQr: false });
    });

    expect(result.current.data?.maskedPhone).toBe('010-****-5678');
  });

  it('재설정 완료는 토큰과 새 비밀번호를 전송한다', async () => {
    let requestBody: unknown = null;
    server.use(
      http.post('*/auth/password-resets/complete', async ({ request }) => {
        requestBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { result } = renderHook(() => useCompletePasswordResetMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ verificationToken: 'token-1', newPassword: 'newPass123!' });
    });

    expect(requestBody).toEqual({ verificationToken: 'token-1', newPassword: 'newPass123!' });
  });
});
