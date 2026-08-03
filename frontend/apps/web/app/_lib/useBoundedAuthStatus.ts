'use client';

import { useEffect, useState } from 'react';

import { useAuthStore } from '@duing/stores';

/**
 * 세션 확인 대기(idle)에 상한을 두고, 넘으면 미인증으로 보고 화면을 연다.
 *
 * AuthSessionBootstrap 은 /users/me 가 401 이 아닌 이유(5xx·타임아웃·오프라인·CORS)로 실패하면
 * 세션을 세우지도 지우지도 않아 status 가 idle 에 영구히 머문다. 이때 idle 을 "확인 중"으로만
 * 렌더하면 로그인 진입점이 사라져, 사용자가 스스로 복구할 방법이 없어진다 — 백엔드 장애 때
 * 로그인조차 못 하게 되는 종류의 사고다.
 *
 * 그래서 기다리되 무한히 기다리지는 않는다. 상한을 넘으면 이 훅을 쓰는 화면은 미인증 화면으로
 * 열려 로그인 버튼이 다시 나타난다(fail-open). 세션이 실제로 살아 있었다면 확인이 끝나는 즉시
 * authenticated 로 정정된다.
 *
 * 상한은 클라이언트가 스스로 허용하는 복원 예산 위에 둔다. 한 번의 복원은 조회(10초) → 갱신(8초)
 * → 재조회(10초)까지 정상 진행될 수 있어(REQUEST_TIMEOUT_MS) 최대 28초다. 실측 최악은 6초지만
 * 느린 회선·콜드스타트에서 그 예산을 쓰는 것은 예외가 아니라 규약대로 동작하는 것이므로, 예산보다
 * 짧게 자르면 살아 있는 세션을 미인증으로 뒤집어 이 PR 이 없애려는 깜빡임을 되살린다.
 *
 * 타이머는 부트스트랩 시작이 아니라 이 훅을 쓰는 화면의 마운트 시점부터 센다. 늦게 열리는 화면은
 * 그만큼 더 기다리지만, 오판보다 대기가 안전한 방향이라 그대로 둔다.
 *
 * 근본 해결은 부트스트랩이 실패해도 상태를 확정하는 것이고 그건 인증 판정 계층 몫이다(후속 PR).
 * 그때 이 훅은 통째로 사라진다 — 여기서는 그때까지 로그인 진입점이 사라지는 구간만 막는다.
 */
const IDLE_TIMEOUT_MS = 30_000;

export function useBoundedAuthStatus(): 'idle' | 'authenticated' | 'unauthenticated' {
  const status = useAuthStore((state) => state.status);
  const [waitedTooLong, setWaitedTooLong] = useState(false);

  useEffect(() => {
    if (status !== 'idle') {
      setWaitedTooLong(false);
      return;
    }
    const timer = window.setTimeout(() => setWaitedTooLong(true), IDLE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (status === 'idle' && waitedTooLong) return 'unauthenticated';
  return status;
}
