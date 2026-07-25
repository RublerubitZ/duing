import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, useMemberPhoneMutation } from '../src';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientProvider>
  );
}

describe('useMemberPhoneMutation', () => {
  it('memberId 로 원본 연락처를 조회한다', async () => {
    server.use(
      http.get('*/clubs/7/members/3/phone', () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-1234-5678' } }),
      ),
    );

    const { result } = renderHook(() => useMemberPhoneMutation(7), { wrapper });
    const phone = await result.current.mutateAsync(3);

    expect(phone).toEqual({ phone: '010-1234-5678' });
  });

  it('403 이면 에러로 끝난다 — 원본을 표시하면 안 되는 경우', async () => {
    server.use(
      http.get('*/clubs/7/members/3/phone', () =>
        HttpResponse.json(
          { ok: false, message: '해당 동아리의 회장만 가능한 작업입니다.', data: null },
          { status: 403 },
        ),
      ),
    );

    const { result } = renderHook(() => useMemberPhoneMutation(7), { wrapper });

    await expect(result.current.mutateAsync(3)).rejects.toThrow();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
