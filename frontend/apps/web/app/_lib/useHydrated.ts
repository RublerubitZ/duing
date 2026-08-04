'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

// SSR/프리렌더 프레임 여부 — 서버 스냅샷 false, 하이드레이션 완료 후 true.
// 비-A′ 라우트의 가드가 초기값(unauthenticated)으로 그려지는 SSR 프레임에 부정 UI(권한 거부·
// 로그인 유도)를 싣지 않기 위한 정합 장치다. 상태 분기가 아니므로 §8.1(화면은 status 로만)과
// 충돌하지 않는다 — status 판정은 하이드레이션 후 그대로 status 가 한다.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
