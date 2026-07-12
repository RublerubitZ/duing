'use client';

import { useEffect } from 'react';
import { useToast } from './toast/ToastProvider';

// 오프라인 상태의 내부 라우트 이동 시도를 원천 차단한다.
// 오프라인에서 클릭 시점 RSC fetch 가 실패하면 Next 라우터가 하드 내비게이션으로 폴백해
// 브라우저 오류 페이지로 앱을 이탈시킨다(재현 실험으로 확인) — 라우터 내부 동작이라
// 시도 차단이 유일한 방어다. capture 단계 리스너라 React 위임 핸들러보다 먼저 실행되므로
// preventDefault() 로 네이티브 앵커 기본 동작(이동)을 막고, stopPropagation() 으로 이벤트가
// React 루트(위임 리스너)까지 전파되는 것 자체를 끊는다. preventDefault 만 걸고
// stopPropagation 을 빼면 네이티브 이동은 막혀도 React onClick(next/link ·
// next-view-transitions Link 자체 핸들러는 물론, 그 앞단에 걸린 사용자 onClick 부수효과까지)
// 은 그대로 실행된다 — 실제로 AcceptanceBanner 의 "둘러보기" 앵커를 오프라인에서 눌러도
// ack() 가 실행돼 localStorage 에 30일 확인 상태가 기록되던 문제가 있었다. 차단된
// 상호작용은 부수효과도 남기면 안 되므로 stopPropagation 으로 React 핸들러 자체가 아예
// 돌지 않게 막는다.
export function OfflineNavigationGuard() {
  const { addToast } = useToast();

  useEffect(() => {
    function blockOfflineNavigation(clickEvent: MouseEvent) {
      if (navigator.onLine) return;
      if (clickEvent.defaultPrevented) return;
      // 수정자 키 클릭(새 탭 등)은 브라우저 기본 동작에 맡긴다.
      if (clickEvent.metaKey || clickEvent.ctrlKey || clickEvent.shiftKey || clickEvent.altKey) return;
      const eventTarget = clickEvent.target;
      if (!(eventTarget instanceof Element)) return;
      const anchor = eventTarget.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      // 내부 라우트('/x')만 차단 — 외부·프로토콜 상대('//')·해시·다운로드·새 탭은 통과.
      if (!href || !href.startsWith('/') || href.startsWith('//')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      addToast('인터넷 연결을 확인해주세요.', { variant: 'error' });
    }

    document.addEventListener('click', blockOfflineNavigation, true);
    return () => document.removeEventListener('click', blockOfflineNavigation, true);
  }, [addToast]);

  return null;
}
