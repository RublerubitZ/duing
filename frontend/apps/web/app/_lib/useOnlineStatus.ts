'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// SSR 은 항상 온라인으로 렌더한다 — 초기 HTML/하이드레이션 mismatch 방지.
// 실제 오프라인이면 하이드레이션 직후 offline 스냅샷으로 갱신된다.
function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
