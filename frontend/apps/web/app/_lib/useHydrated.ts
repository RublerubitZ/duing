'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

// SSR/프리렌더 프레임 여부 — 서버 스냅샷 false, 하이드레이션 완료 후 true.
// 비-A′ 라우트의 가드가 초기값(unauthenticated)으로 그려지는 SSR 프레임에 부정 UI(권한 거부·
// 로그인 유도)를 싣지 않기 위한 정합 장치다. 상태 분기가 아니므로 §8.1(화면은 status 로만)과
// 충돌하지 않는다 — status 판정은 하이드레이션 후 그대로 status 가 한다.
// 서버와 첫 렌더가 다르게 보는 값으로 분기하는 렌더의 게이트로도 쓴다 — 셸의 부팅 세션 복원이 본문 하이드레이션 전에 등록하거나
// 끝내는 me 조회(#1003·#1496), 지금 시각에 따라 바뀌는 표시(NEW·D-day·오늘 — 서버 HTML 은 그린 시각에 굳어 하루 넘게
// 묵을 수 있다).
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
