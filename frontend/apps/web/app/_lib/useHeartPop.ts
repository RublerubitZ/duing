'use client';

import { useState } from 'react';

/**
 * 찜 하트 팝 재생 여부 — "꺼진 하트를 본 뒤에 켜졌을 때"만 참이다.
 *
 * 하트 SVG 는 key 로 리마운트해 키프레임을 재생하므로 판정을 아이콘 안에 둘 수 없다(리마운트마다
 * 초기화된다) — 리마운트되지 않는 호출부에서 이 훅으로 판정해 내려준다.
 *
 * 이미 찜한 상태로 마운트되는 화면(캐시된 찜 목록으로 들어온 카드·상세)에서 아무도 누르지 않았는데
 * 하트가 튀는 것을 막는다. 렌더 중 setState 는 React 가 권장하는 파생 상태 갱신 방식이다 —
 * effect 없이 같은 렌더 패스에서 즉시 반영되고 추가 페인트가 없다.
 */
export function useHeartPop(filled: boolean): boolean {
  const [seenUnfilled, setSeenUnfilled] = useState(!filled);
  if (!filled && !seenUnfilled) setSeenUnfilled(true);
  return filled && seenUnfilled;
}
