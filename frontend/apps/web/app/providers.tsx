'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MotionConfig } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { createApiClient, registerCookieAdapter, registerConnectivityAdapter } from '@duing/api';
import { ApiClientProvider, shouldRetryQuery } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { webStorage } from '@duing/storage/web';
import { hydrateAuthFromStorage } from '@duing/stores';
import { webCookieAdapter } from './_lib/cookie-adapter';
import { ToastProvider } from './_components/toast/ToastProvider';
import { SessionExpiryHandler } from './_components/SessionExpiryHandler';

setStorage(webStorage);
registerCookieAdapter(webCookieAdapter);
// navigator.onLine 이 명시적으로 false 일 때만 오프라인 — SSR(navigator 부재)은 온라인 취급.
registerConnectivityAdapter(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

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
            // 재시도 정책은 @duing/hooks 의 shouldRetryQuery 로 일원화 —
            // 401/403(반복 무의미)·TIMEOUT(대기 배가)은 재시도하지 않고, 빠른 실패만 1회 재시도.
            retry: shouldRetryQuery,
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
