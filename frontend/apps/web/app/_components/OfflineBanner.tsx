'use client';

import { useOnlineStatus } from '@/app/_lib/useOnlineStatus';

// 오프라인 동안 상단에 고정되는 슬림 배너. 온라인 복귀 시 자동 제거.
// 고정 오버레이는 배경을 명시한다 — .duing 스코프가 bg-cream 을 전파해 상단 띠가 생기는 함정 회피.
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] bg-charcoal px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-center text-xs font-medium text-white"
    >
      인터넷 연결을 확인해주세요.
    </div>
  );
}
