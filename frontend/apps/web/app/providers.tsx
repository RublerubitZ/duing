'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MotionConfig } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, createApiClient, registerCookieAdapter } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { webStorage } from '@duing/storage/web';
import { hydrateAuthFromStorage } from '@duing/stores';
import { webCookieAdapter } from './_lib/cookie-adapter';
import { ToastProvider } from './_components/toast/ToastProvider';
import { SessionExpiryHandler } from './_components/SessionExpiryHandler';

setStorage(webStorage);
registerCookieAdapter(webCookieAdapter);

const apiClient = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1',
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // 인증 실패(401)·권한 실패(403)는 retry 무의미 — 콘솔 노이즈만 유발.
            // 그 외 네트워크/일시 오류는 기존 1 회 retry 유지.
            retry: (failureCount, error) => {
              if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                return false;
              }
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    void hydrateAuthFromStorage();
  }, []);

  return (
    // reducedMotion="user" — OS 의 '동작 줄이기' 설정 시 transform 모션을 자동 비활성화한다.
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>
          <ToastProvider>
            <SessionExpiryHandler />
            {children}
          </ToastProvider>
        </ApiClientProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </MotionConfig>
  );
}
