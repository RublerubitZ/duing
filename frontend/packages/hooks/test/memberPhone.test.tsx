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

  // 상태코드까지 단언한다 — toThrow() 만으로는 500·타임아웃으로 거부돼도 통과해,
  // "권한 없음" 을 실제로 전파하는지 검증하지 못한다.
  it('403 이면 상태코드를 단 에러로 끝난다 — 원본을 표시하면 안 되는 경우', async () => {
    server.use(
      http.get('*/clubs/7/members/3/phone', () =>
        HttpResponse.json(
          { ok: false, message: '해당 동아리의 회장만 가능한 작업입니다.', data: null },
          { status: 403 },
        ),
      ),
    );

    const { result } = renderHook(() => useMemberPhoneMutation(7), { wrapper });

    await expect(result.current.mutateAsync(3)).rejects.toMatchObject({
      status: 403,
      message: '해당 동아리의 회장만 가능한 작업입니다.',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  // 404 는 "그 동아리에 없는 멤버"(미존재·타 동아리·탈퇴) 를 뜻한다 — 구분하지 않는다.
  it('404 면 상태코드를 단 에러로 끝난다 — 그 동아리에 없는 멤버', async () => {
    server.use(
      http.get('*/clubs/7/members/3/phone', () =>
        HttpResponse.json(
          { ok: false, message: '동아리 멤버를 찾을 수 없습니다.', data: null },
          { status: 404 },
        ),
      ),
    );

    const { result } = renderHook(() => useMemberPhoneMutation(7), { wrapper });

    await expect(result.current.mutateAsync(3)).rejects.toMatchObject({
      status: 404,
      message: '동아리 멤버를 찾을 수 없습니다.',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
