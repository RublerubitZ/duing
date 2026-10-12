'use client';

import { useState } from 'react';

import { isBackNavigationPending } from './backNavigationViewTransition';

/**
 * 화면 본문 등장 연출을 재생할지 — 마운트 시점 값으로 고정된다(리렌더로 바뀌지 않는다).
 * 앞으로 들어왔거나(첫 로드·앱 안 이동), 데이터를 기다리며 마운트해 스켈레톤을 거쳤으면 참이다.
 * 뒤로·앞으로 가기 마커(data-back-navigation)가 서 있을 때 마운트하면 거짓이다 — 스크롤이 복원된 자리에서 다시
 * 떠오르지 않게 하고, iOS 스와이프 백의 네이티브 슬라이드와 겹치지 않게 한다. 마커는 View Transition 을 지원하는
 * 브라우저에서만 서므로(가드 설치 조건), 미지원 브라우저의 뒤로 가기에는 연출이 재생될 수 있다.
 * 서버 렌더에는 문서가 없어 참이다 — 서버 HTML 에 클래스가 실려 첫 화면에서 CSS 로 재생된다. 마커는 popstate 리스너만
 * 세우고 새 문서는 그 전에 하이드레이션되므로, 하이드레이션 때도 같은 값이 나온다.
 * 참이면 본문 요소에 `.enter-content`(globals.css)를 붙인다. 로딩 분기가 early return 이라 그보다 위에서 호출한다.
 * 화면 안에서 따로 받아오는 하위 영역은 이 훅이 아니라 useEnteredFromSkeleton 을 쓴다(본문과 함께 떠올라 이동이 겹치지 않게).
 */
export function useEntranceMotion(isLoading: boolean): boolean {
  const [playsEntrance] = useState(() => isLoading || !isBackNavigationPending());
  return playsEntrance;
}
