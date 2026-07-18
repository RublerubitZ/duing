'use client';

import { NETWORK_ERROR_MESSAGE } from '@duing/api';

import { useOnlineStatus } from '@/app/_lib/useOnlineStatus';

// 오프라인 동안 상단에 고정되는 슬림 배너. 온라인 복귀 시 자동 제거.
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  return (
    // live region 은 상시 마운트 — 콘텐츠와 함께 삽입되면 스크린리더가 공지를 놓친다.
    <div role="status">
      {isOnline ? null : (
        // 고정 오버레이는 배경을 명시한다 — .duing 스코프가 bg-cream 을 전파해 상단 띠가 생기는 함정 회피.
        <div className="fixed inset-x-0 top-0 z-[60] bg-charcoal px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-center text-xs font-medium text-white">
          {NETWORK_ERROR_MESSAGE}
        </div>
      )}
    </div>
  );
}
