'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 자식의 무한 CSS 애니메이션(마키 등)을 뷰포트 밖에서 멈춘다 — data-offscreen + globals.css 한 줄.
 *
 * <p>서버 컴포넌트를 children 으로 받는 얇은 클라이언트 래퍼라, 감싸는 쪽(홈 페이지)은 서버 렌더를
 * 그대로 유지한다. 래퍼 div 는 스타일이 없어 자식 섹션의 margin 이 그대로 collapse 된다.
 *
 * <p>IntersectionObserver 미지원(jsdom·구형 WebView)이면 아무것도 하지 않는다 — 항상 재생이 기존 동작이다.
 */
export function PauseOffscreen({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOffscreen, setIsOffscreen] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setIsOffscreen(!entry.isIntersecting);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} data-offscreen={isOffscreen || undefined}>
      {children}
    </div>
  );
}
