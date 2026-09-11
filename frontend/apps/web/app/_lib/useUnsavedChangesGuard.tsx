'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Route } from 'next';

import { ConfirmDialog } from '@/app/_components/ConfirmDialog';
import { toLinkRoute } from '@/app/_lib/route';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

/**
 * 저장하지 않은 변경이 있을 때 이탈을 막는다 — (1) beforeunload 브라우저 경고, (2) 내부 앵커 클릭을
 * capture 단계에서 가로채 확인 다이얼로그 후 이동(OfflineNavigationGuard 와 같은 판별). 뒤로가기는 막지 않는다.
 * 소비처는 반환된 leaveDialog 를 트리 어딘가에 렌더한다.
 *
 * OfflineNavigationGuard 도 capture 리스너지만 온라인에서는 markNavigationPending() 만 하고 통과하므로
 * 충돌하지 않는다. 오프라인이면 그쪽이 먼저 preventDefault 하고, 같은 노드의 capture 리스너는 모두
 * 실행되므로 여기서는 defaultPrevented 검사로 건너뛴다.
 */
export function useUnsavedChangesGuard(isDirty: boolean): { leaveDialog: ReactNode } {
  const router = useGuardedRouter();
  const [pendingHref, setPendingHref] = useState<Route | null>(null);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (clickEvent: MouseEvent) => {
      if (clickEvent.defaultPrevented) return;
      // 수정자 키 클릭(새 탭 등)은 브라우저 기본 동작에 맡긴다.
      if (clickEvent.metaKey || clickEvent.ctrlKey || clickEvent.shiftKey || clickEvent.altKey) return;
      const target = clickEvent.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (!anchor) return;
      // 내부 라우트('/x')만 대상 — 외부·프로토콜 상대('//')·해시·다운로드·새 탭은 통과(toLinkRoute 판별).
      const route = toLinkRoute(anchor.getAttribute('href'));
      if (!route) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      setPendingHref(route);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [isDirty]);

  const leaveDialog = (
    <ConfirmDialog
      open={pendingHref !== null}
      title="저장하지 않은 변경이 있어요"
      description="지금 나가면 입력한 내용이 사라져요."
      confirmLabel="나가기"
      onCancel={() => setPendingHref(null)}
      onConfirm={() => {
        const href = pendingHref;
        setPendingHref(null);
        if (href) router.push(href);
      }}
    />
  );
  return { leaveDialog };
}
