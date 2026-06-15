'use client';

// 모바일 전용(md:hidden) 공지 상세 상단 액션바 — [뒤로] 좌측, [공유] 우측.
// 동아리 상세처럼 포커스 뷰라 모바일에서 전역 브랜드 바(ExploreNav)·하단 탭바를 숨기고 이 바가 대신한다.
// 커버 위가 아닌 크림 배경 위에 놓이므로 버튼은 paper 원형 + 보더/그림자로 대비를 준다.

import { useRouter } from 'next/navigation';

import { ArrowLeft, Check, Share } from '@/components/duing/Icon';
import { useShareLink } from '@/app/_lib/useShareLink';

const ROUND =
  'grid h-9 w-9 place-items-center rounded-full border border-line bg-paper text-ink shadow-1 transition active:scale-95';

export function NoticeDetailTopBar() {
  const router = useRouter();
  const { copied, share } = useShareLink();

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/notices');
  }

  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] md:hidden">
      <button type="button" onClick={handleBack} aria-label="뒤로" className={ROUND}>
        <ArrowLeft size={19} />
      </button>
      <button type="button" onClick={share} aria-label={copied ? '링크 복사됨' : '공유'} className={ROUND}>
        {copied ? <Check size={18} /> : <Share size={17} />}
      </button>
    </div>
  );
}
