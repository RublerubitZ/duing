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
 *
 * `ready` 는 찜 상태(방향)를 아는지다. 찜 목록이 도착하기 전에는 찜한 동아리도 "찜 안 함"으로
 * 보이므로, 목록이 도착하며 false → true 로 뒤집히는 첫 반영을 사용자의 클릭과 구분할 수 없다.
 * 그래서 준비 전에는 "꺼진 하트를 봤다"고 기록하지도, 팝하지도 않는다 — 준비된 뒤의 전환만 재생한다.
 *
 * 준비됐다가 다시 준비 안 됨이 되면 앞서 본 "꺼진 하트"도 잊는다. 대표 사례: 로그인 이력 표시 없이 세션이 복원되는
 * 첫 진입은 미인증(준비됨·꺼짐)으로 그린 뒤 인증되며 찜 목록을 기다린다 — 그 "꺼짐" 은 실제 상태가 아니었다.
 */
export function useHeartPop(filled: boolean, ready = true): boolean {
  const [seenUnfilled, setSeenUnfilled] = useState(ready && !filled);
  if (ready && !filled && !seenUnfilled) setSeenUnfilled(true);
  if (!ready && seenUnfilled) setSeenUnfilled(false);
  return ready && filled && seenUnfilled;
}
