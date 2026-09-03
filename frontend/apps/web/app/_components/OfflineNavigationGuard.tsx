'use client';

import { useEffect } from 'react';
import { NETWORK_ERROR_MESSAGE } from '@duing/api';

import { markNavigationPending } from '@/app/_lib/backDismiss';

import { useToast } from './toast/ToastProvider';

// 오프라인 차단에 더해, 온라인 내부 앵커 클릭에는 backDismiss 의 이동 예약을 세운다(#1139).
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
    function trackOrBlockNavigation(clickEvent: MouseEvent) {
      if (clickEvent.defaultPrevented) return;
      // 수정자 키 클릭(새 탭 등)은 브라우저 기본 동작에 맡긴다.
      if (clickEvent.metaKey || clickEvent.ctrlKey || clickEvent.shiftKey || clickEvent.altKey) return;
      const eventTarget = clickEvent.target;
      if (!(eventTarget instanceof Element)) return;
      const anchor = eventTarget.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      // 내부 라우트('/x')만 대상 — 외부·프로토콜 상대('//')·해시·다운로드·새 탭은 통과.
      if (!href || !href.startsWith('/') || href.startsWith('//')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      if (navigator.onLine) {
        // 내부 라우트 클릭은 Link 가 곧 이동을 시작한다 — 커밋 전 창에서 오버레이 회수 back() 이 이동을
        // 삼키지 않게 예약한다(#1139). capture 단계라 React onClick 의 preventDefault 는 아직 안 보인다 —
        // 그런 앵커(이동 없음)는 예약만 남고 failsafe 로 풀린다(그 사이 닫힘은 죽은 엔트리 → 자동 스킵).
        markNavigationPending();
        return;
      }

      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      addToast(NETWORK_ERROR_MESSAGE, { variant: 'error' });
    }

    document.addEventListener('click', trackOrBlockNavigation, true);
    return () => document.removeEventListener('click', trackOrBlockNavigation, true);
  }, [addToast]);

  return null;
}
