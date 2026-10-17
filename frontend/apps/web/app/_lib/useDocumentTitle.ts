import { useEffect } from 'react';

/**
 * 데이터 도착 후 탭 제목을 `… | 두잉` 으로 맞춘다 — 서버 메타데이터가 제목을 붙이지 못한 렌더(셸)를 덮는다.
 * 바꿀 때 직전 제목을 기억하고, 정리(언마운트·값 변경) 때 지금 제목이 자기가 쓴 값일 때만 그 제목으로 되돌린다 — 동아리 상세
 * 인터셉트(스펙 P1 §3.6)는 head 가 목록 것 그대로라 뒤로 와도 제목이 다시 그려지지 않는다. 일반 이동은 다음 라우트 head 가 먼저
 * 제목을 바꿔(커밋의 DOM 단계가 effect 정리보다 앞) 정리가 아무것도 하지 않는다.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null || title === '') return;
    const previousTitle = document.title;
    const ownTitle = `${title} | 두잉`;
    document.title = ownTitle;
    return () => {
      if (document.title === ownTitle) document.title = previousTitle;
    };
  }, [title]);
}
