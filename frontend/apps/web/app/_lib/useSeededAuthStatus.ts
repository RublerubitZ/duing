'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { useAuthStore } from '@duing/stores';

import type { AuthStatus } from '@duing/stores';

// 화면 렌더용 status 셀렉터(§10) — 소비자가 raw 비교를 하지 않게 하는 단일 지점.
// serverSeed(A′ 가 SSR 에서 검증한 값)가 있으면 그것이 서버 스냅샷이 된다:
// SSR HTML 과 하이드레이션 첫 렌더가 서버 값으로 일치하고(React #419 방지), 하이드레이션 직후
// 스토어 현재값(부팅 시드·서버 확정 반영)으로 동기화된다. serverSeed 가 없는 라우트는 스토어
// 초기값이 서버 스냅샷이라 정적 프리렌더 HTML 과 일치한다.
export function useSeededAuthStatus(serverSeed: boolean | null = null): AuthStatus {
  const getServerSnapshot = useCallback((): AuthStatus => {
    if (serverSeed === null) return useAuthStore.getInitialState().status;
    return serverSeed ? 'authenticated' : 'unauthenticated';
  }, [serverSeed]);
  return useSyncExternalStore(
    useAuthStore.subscribe,
    () => useAuthStore.getState().status,
    getServerSnapshot,
  );
}
