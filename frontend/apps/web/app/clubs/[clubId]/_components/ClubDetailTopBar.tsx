'use client';

// 모바일 전용(md:hidden) 상세 상단 액션바 — [뒤로] 좌측, [찜][공유] 우측.
// 상세는 포커스 뷰라 전역 브랜드 바(ExploreNav)를 모바일에서 숨기고(ExploreNav 가 /clubs/{id} 를 md 미만 숨김) 이 바가 대신한다.
// 커버 배너 위에 오버레이되므로 버튼은 크림 반투명 원형 + 그림자로 대비를 준다. 부모는 relative 여야 한다.

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ArrowLeft, Check, Share } from '@/components/duing/Icon';
import { FavoriteToggleButton } from '../../../_components/FavoriteToggleButton';

const ROUND =
  'grid h-9 w-9 place-items-center rounded-full bg-cream/85 text-ink shadow-1 backdrop-blur transition active:scale-95';

export function ClubDetailTopBar({ clubId }: { clubId: number }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/clubs');
  }

  async function handleShare() {
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

  return (
    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]">
      <button type="button" onClick={handleBack} aria-label="뒤로" className={ROUND}>
        <ArrowLeft size={19} />
      </button>
      <div className="flex items-center gap-2">
        <FavoriteToggleButton
          clubId={clubId}
          size="md"
          className="h-9 w-9 bg-cream/85 text-ink shadow-1 backdrop-blur hover:bg-cream"
        />
        <button type="button" onClick={handleShare} aria-label={copied ? '링크 복사됨' : '공유'} className={ROUND}>
          {copied ? <Check size={18} /> : <Share size={17} />}
        </button>
      </div>
    </div>
  );
}
