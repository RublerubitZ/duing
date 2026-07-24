'use client';

// 토큰 만료(인증 401) 시 전역 처리: 세션 정리 + 만료 토스트 + 홈 이동.
// API 클라이언트의 401 감지(afterResponse)가 registerUnauthorizedHandler 로 등록한 이 콜백을 호출한다.

import { useEffect } from 'react';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useQueryClient } from '@tanstack/react-query';

import { registerUnauthorizedHandler } from '@duing/api';
import { useApiClient } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { toLinkRoute, toRoute } from '@/app/_lib/route';
import { useToast } from './toast/ToastProvider';
import posthog from 'posthog-js';

export function SessionExpiryHandler() {
  const router = useGuardedRouter();
  const queryClient = useQueryClient();
  const client = useApiClient();
  const { addToast } = useToast();

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      const { status, clearSession } = useAuthStore.getState();
      // 인증 상태일 때만 한 번 처리한다. 동시다발 401 의 중복 토스트/이동을 막기 위해
      // 상태를 동기적으로 먼저 내려, 이후 호출은 이 가드에서 걸러지게 한다.
      if (status !== 'authenticated') return;
      useAuthStore.setState({ status: 'unauthenticated' });
      // JS 로 지울 수 없는 HttpOnly 쿠키 3종(auth_hint 포함)을 서버가 정리하게 한다 —
      // 세션이 죽은 뒤 살아남은 auth_hint 는 미들웨어의 라우팅 판단을 오염시킨다.
      // best-effort: 실패해도 사용자 흐름(토스트·로그인 이동)을 막지 않고, 만료 상태의 401 도 정상이다.
      void client.auth.logout().catch(() => {});
      posthog.reset();
      void clearSession();
      // 이전 사용자 데이터가 화면/캐시에 남지 않도록 비운다(공용 단말 정보 노출 방지).
      queryClient.clear();
      addToast('세션이 만료되었어요. 다시 로그인해 주세요.', { variant: 'error' });
      const currentPath = toLinkRoute(window.location.pathname + window.location.search) ?? '/';
      router.push(toRoute(`/login?next=${encodeURIComponent(currentPath)}`));
    });
    return () => registerUnauthorizedHandler(null);
  }, [router, addToast, queryClient, client]);

  return null;
}
