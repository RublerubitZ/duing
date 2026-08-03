'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { MotionConfig } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { createApiClient, registerConnectivityAdapter, registerRefreshLockAdapter } from '@duing/api';
import { ApiClientProvider, shouldRetryQuery } from '@duing/hooks';
import { setStorage } from '@duing/storage';
import { webStorage } from '@duing/storage/web';
import { resolveApiBaseUrl } from './_lib/apiBaseUrl';
import { installBackDismiss } from './_lib/backDismiss';
import { installBackNavigationViewTransitionGuard } from './_lib/backNavigationViewTransition';
import { clearLegacyWebAuthArtifacts } from './_lib/legacy-auth-cleanup';
import { ToastProvider } from './_components/toast/ToastProvider';
import { OfflineBanner } from './_components/OfflineBanner';
import { OfflineNavigationGuard } from './_components/OfflineNavigationGuard';
import { SessionExpiryHandler } from './_components/SessionExpiryHandler';
import { AuthSessionBootstrap } from './_components/AuthSessionBootstrap';

setStorage(webStorage);
clearLegacyWebAuthArtifacts();
// navigator.onLine 이 명시적으로 false 일 때만 오프라인 — SSR(navigator 부재)은 온라인 취급.
registerConnectivityAdapter(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
// 크로스탭 refresh 직렬화 — navigator.locks 지원 브라우저만 주입, 미지원은 미등록(탭 내 in-flight 폴백).
if (typeof navigator !== 'undefined' && 'locks' in navigator) {
  registerRefreshLockAdapter(
    async <T,>(task: () => Promise<T>): Promise<T> =>
      await navigator.locks.request('duing-auth:refresh', task),
  );
}
// 뒤로가기(popstate) View Transition 이중 재생 방지 — 함수 내부에서 window 가드하므로 SSR 안전.
installBackNavigationViewTransitionGuard();
// 오버레이 뒤로가기 닫기 — 리스너 설치와 이전 문서 잔존 마커 제거를 로드 시점에 끝낸다.
// 오버레이를 여는 순간까지 미루면, 새 문서에서 잔존 엔트리를 만났을 때 스킵하지 못한다. SSR 안전.
installBackDismiss();

const apiClient = createApiClient({
  baseUrl: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV),
  authTransport: 'cookie',
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // 오프라인 처리는 RQ 의 pause(networkMode 기본 'online')가 아니라 ky connectivity
            // 어댑터의 즉시 실패(ApiError NETWORK)로 일원화한다 — pause 는 사용자에게 무한 로딩으로
            // 보이고 fail-fast 에 도달조차 못 한다 (2026-07-12 리뷰 실험으로 확인).
            networkMode: 'always',
            // 재시도 정책은 @duing/hooks 의 shouldRetryQuery 로 일원화 —
            // 401/403(반복 무의미)·TIMEOUT(대기 배가)은 재시도하지 않고, 빠른 실패만 1회 재시도.
            retry: shouldRetryQuery,
            refetchOnWindowFocus: false,
          },
          mutations: {
            // 재시도는 기본값 0 유지(비멱등 이중 실행 차단) — networkMode 만 fail-fast 를 위해 변경.
            networkMode: 'always',
          },
        },
      }),
  );

  return (
    // reducedMotion="user" — OS 의 '동작 줄이기' 설정 시 transform 모션을 자동 비활성화한다.
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>
          <ToastProvider>
            <AuthSessionBootstrap />
            <SessionExpiryHandler />
            <OfflineBanner />
            <OfflineNavigationGuard />
            {children}
          </ToastProvider>
        </ApiClientProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </MotionConfig>
  );
}
