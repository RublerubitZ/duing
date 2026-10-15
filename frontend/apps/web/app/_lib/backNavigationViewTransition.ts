'use client';

// 뒤로/앞으로(popstate) 이동으로 화면이 그려지는 동안 서는 마커(<html data-back-navigation>)를 관리한다.
// 화면 본문 등장 연출(useEntranceMotion·탐색 스태거)이 마운트 때 읽어, 돌아온 화면에는 연출을 붙이지 않는다 —
// 스크롤이 복원된 자리에서 다시 떠오르지 않게 하고, iOS 스와이프 백의 네이티브 슬라이드와 겹치지 않게 한다.
// popstate 에는 View Transition 을 쓰지 않는다 — next-view-transitions 의 popstate 처리는 패치로 뺐다(frontend/patches).
// 그 처리는 새 화면 렌더를 스크린샷 뒤로 미뤄, 그 사이 브라우저 스크롤 복원이 떠나는 화면에 적용됐다(목록 위치 상실·
// 떠나는 화면 튐, 2026-10-13 운영 실측). 그래서 마커도 전환 수명이 아니라 경로 커밋에 묶는다.

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { installBackDismiss, isOverlayOnlyTraversal } from './backDismiss';

const BACK_NAVIGATION_ATTRIBUTE = 'data-back-navigation';
// 경로가 바뀌지 않는 popstate(쿼리·해시만 다른 엔트리)는 마커를 내릴 커밋이 없다 — 그때 마커가 남지 않게 하는 안전장치.
// 그런 이동은 화면 컴포넌트가 다시 마운트되지 않아 등장 판정에 쓰이지 않는다.
// ponytail: 라우터 캐시에 없는 화면으로 돌아가면 로딩 경계가 먼저 커밋돼(경로 변경) 마커가 그때 내려가고, 나중에 마운트되는
// 실제 화면은 연출을 재생한다(로딩 경계 없이 2초를 넘기면 이 failsafe 가 먼저 내려 같은 결과). 쿼리·해시 전용 뒤로가기 뒤
// 2초 안의 앞으로 이동은 연출이 빠진다(스펙 수용 한계). 실측되면 backDismiss 의 navigationPending 신호와 묶는다.
const FAILSAFE_CLEAR_MS = 2000;

let installed = false;
let failsafeTimer: number | null = null;

function clearBackNavigationMarker() {
  if (failsafeTimer !== null) {
    window.clearTimeout(failsafeTimer);
    failsafeTimer = null;
  }
  document.documentElement.removeAttribute(BACK_NAVIGATION_ATTRIBUTE);
}

/**
 * 뒤로·앞으로 가기(popstate)로 화면이 그려지는 중인지 — 마커가 서 있는 동안 참이다.
 * 화면 본문 등장 연출(useEntranceMotion)이 마운트 때 읽어, 돌아온 화면에는 연출을 붙이지 않는다.
 * 서버 렌더(문서 없음)에서는 거짓이다.
 */
export function isBackNavigationPending(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement.hasAttribute(BACK_NAVIGATION_ATTRIBUTE)
  );
}

/** popstate 에 마커를 세우는 리스너를 단다(한 번만). SSR 에서는 아무것도 하지 않는다. */
export function installBackNavigationViewTransitionGuard() {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;

  // 오버레이만 닫는 이동인지는 backDismiss 의 popstate 리스너가 계산한다. 리스너는 등록순으로 실행되므로 그쪽을 먼저
  // 설치해 둔다(이미 설치돼 있으면 아무것도 하지 않는다).
  installBackDismiss();

  window.addEventListener('popstate', () => {
    // 시트·라이트박스만 닫는 뒤로가기는 페이지가 그대로라 마커를 내릴 커밋이 없다. 세우면 바로 이어지는 앞으로 이동
    // (닫고 곧바로 카드 탭)이 뒤로 가기로 읽혀 그 화면의 등장 연출이 빠진다.
    // 죽은 엔트리 자동 스킵의 두 번째 hop 도 이 경우라, 첫 hop 이 세운 마커를 건드리지 않고 그대로 둔다.
    if (isOverlayOnlyTraversal()) return;
    document.documentElement.setAttribute(BACK_NAVIGATION_ATTRIBUTE, '');
    if (failsafeTimer !== null) window.clearTimeout(failsafeTimer);
    failsafeTimer = window.setTimeout(clearBackNavigationMarker, FAILSAFE_CLEAR_MS);
  });
}

/**
 * 경로가 바뀐 커밋 뒤 마커를 내린다 — Providers 안 children 뒤에 한 번 렌더한다(새 화면의 effect 보다 나중에 돌도록).
 * 새 화면의 useState 초기값은 렌더 중에 마커를 읽고, 같은 커밋의 이 effect 가 그 뒤에 내린다.
 * 첫 마운트에서도 돌지만 마커가 없어 무해하다.
 */
export function BackNavigationMarkerReset(): null {
  const pathname = usePathname();
  useEffect(() => {
    clearBackNavigationMarker();
  }, [pathname]);
  return null;
}
