'use client';

import { useState } from 'react';

/**
 * 스켈레톤을 거쳐 콘텐츠가 도착했는지 — 마운트 시점에 쿼리가 로딩 중이었을 때만 참이다.
 * 참이면 콘텐츠 요소에 `.enter-content`(globals.css)를 붙여 1회 떠오르게 한다.
 *
 * useState 초기값을 그대로 돌려주므로 리렌더로 바뀌지 않는다. 캐시가 있어 첫 렌더부터 콘텐츠가 나오는
 * 재방문·클라이언트 내비게이션에는 붙지 않는다 — (1) 반복 진입에는 연출하지 않는다. (2) 상세 로고 모핑은
 * 캐시 재방문에서만 짝이 맞는데, 그때 조상에 translateY(8px) 가 걸리면 모핑이 8px 아래를 목표로 끝나 튄다.
 *
 * 로딩 분기가 early return 이라, 초기값이 로딩 렌더에서 잡히도록 early return 보다 위에서 호출한다.
 */
export function useEnteredFromSkeleton(isLoading: boolean): boolean {
  const [enteredFromSkeleton] = useState(isLoading);
  return enteredFromSkeleton;
}
