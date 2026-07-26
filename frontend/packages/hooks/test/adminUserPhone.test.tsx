import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApiClient } from '@duing/api';

import { ApiClientProvider, useAdminUserPhoneMutation } from '../src';

const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('useAdminUserPhoneMutation', () => {
  it('조회가 끝나고 옵저버가 사라지면 원본 번호를 뮤테이션 캐시에 남기지 않는다', async () => {
    server.use(
      http.get('*/admin/users/12/phone', () =>
        HttpResponse.json({ ok: true, message: null, data: { phone: '010-2210-9983' } }),
      ),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );

    const { result, unmount } = renderHook(() => useAdminUserPhoneMutation(), { wrapper });
    const phone = await result.current.mutateAsync(12);
    expect(phone).toEqual({ phone: '010-2210-9983' });

    // 기본 gcTime(5분)이면 패널을 닫아도 원본 번호가 그만큼 힙에 남는다.
    unmount();
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
  });
});
