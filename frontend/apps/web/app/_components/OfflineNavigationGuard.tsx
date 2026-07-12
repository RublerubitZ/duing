'use client';

import { useEffect } from 'react';
import { useToast } from './toast/ToastProvider';

// 오프라인 상태의 내부 라우트 이동 시도를 원천 차단한다.
// 오프라인에서 클릭 시점 RSC fetch 가 실패하면 Next 라우터가 하드 내비게이션으로 폴백해
// 브라우저 오류 페이지로 앱을 이탈시킨다(재현 실험으로 확인) — 라우터 내부 동작이라
// 시도 차단이 유일한 방어다. capture 단계 리스너라 React 위임 핸들러보다 먼저 실행되어
// preventDefault() 를 먼저 건다 — next/link · next-view-transitions Link 모두 자체
// onClick 진입부에서 `e.defaultPrevented` 를 확인하고 그대로 반환하므로, 이 시점에
// defaultPrevented 를 세워두는 것만으로 두 Link 구현을 한 지점에서 모두 막는다.
// stopPropagation 은 걸지 않는다 — 걸면 이벤트가 타깃(앵커)에 도달하지 못해 앵커 자체에
// 달린 다른 핸들러(분석 로깅 등)까지 함께 죽는다.
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
      addToast('인터넷 연결을 확인해주세요.', { variant: 'error' });
    }

    document.addEventListener('click', blockOfflineNavigation, true);
    return () => document.removeEventListener('click', blockOfflineNavigation, true);
  }, [addToast]);

  return null;
}
