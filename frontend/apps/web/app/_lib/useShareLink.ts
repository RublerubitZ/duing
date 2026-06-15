'use client';

import { useState } from 'react';

/**
 * 현재 페이지 URL 공유 — 네이티브 공유 시트가 있으면 그걸 쓰고, 없으면 클립보드 복사 후 1.5초간 copied 표시.
 * 상세 페이지 상단 액션바(동아리/공지)가 공유한다.
 */
export function useShareLink() {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch {
        // 사용자가 네이티브 공유 시트를 닫은 경우 — 별도 처리 없음.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 접근 불가 — 조용히 무시.
    }
  }

  return { copied, share };
}
