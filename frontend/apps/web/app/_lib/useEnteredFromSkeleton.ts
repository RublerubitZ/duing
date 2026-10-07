'use client';

import { useState } from 'react';

/**
 * 스켈레톤을 거쳐 콘텐츠가 도착했는지 — 마운트 시점에 쿼리가 로딩 중이었을 때만 참이다.
 * 인자로 isPending 을 넘기면 데이터 없이 마운트한 경우(대기 포함)로 판정한다.
 * useState 초기값을 그대로 돌려주므로 리렌더로 바뀌지 않는다.
 *
 * 화면 안에서 따로 받아오는 하위 영역(동아리 상세 대표 활동·소식 탭의 공지·일정) 전용이다 — 참이면 그 영역에
 * `.enter-content`(globals.css)를 붙인다. 이 영역들은 화면 본문 래퍼 안에 있어, 진입 판정(useEntranceMotion)까지
 * 주면 본문이 떠오르는 동안 함께 떠올라 이동 거리가 겹친다. 캐시가 있어 곧바로 보이는 탭 재진입에는 붙지 않는다.
 * 탐색 목록의 "데이터 없이 마운트" 판정에도 쓴다. 화면 본문은 useEntranceMotion 을 쓴다.
 *
 * 로딩 분기가 early return 이라, 초기값이 로딩 렌더에서 잡히도록 early return 보다 위에서 호출한다.
 */
export function useEnteredFromSkeleton(isLoading: boolean): boolean {
  const [enteredFromSkeleton] = useState(isLoading);
  return enteredFromSkeleton;
}
