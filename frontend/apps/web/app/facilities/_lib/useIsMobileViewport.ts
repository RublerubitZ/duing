'use client';

import { useSyncExternalStore } from 'react';

// Tailwind sm 미만(<640px) = 모바일 압축 레이아웃(§9). 주간 그리드 블록 disabled(PC) ↔ 시트 트리거(모바일)
// 게이트 판정에만 쓴다 — 레이아웃 압축 자체는 sm: 프리픽스(순수 CSS)로 처리한다.
const MOBILE_QUERY = '(max-width: 639px)';

function subscribeToViewport(onChange: () => void) {
  const mediaQueryList = window.matchMedia(MOBILE_QUERY);
  mediaQueryList.addEventListener('change', onChange);
  return () => mediaQueryList.removeEventListener('change', onChange);
}

/**
 * <sm 뷰포트 여부(§9) — useSyncExternalStore + matchMedia 로 뷰포트 변화를 구독한다.
 * SSR·하이드레이션 초기값은 데스크탑(false)으로 두고, 마운트 후 구독으로 보정한다(하이드레이션 mismatch 방지).
 */
export function useIsMobileViewport(): boolean {
  return useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}
