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
 * 상한 10초는 정상 복원(3왕복, 실측 최악 약 6초)이 절대 걸리지 않는 값으로 잡았다.
 * 근본 해결(부트스트랩이 실패해도 상태를 확정)은 인증 판정 계층 몫이라 여기서 다루지 않는다.
 */
const IDLE_TIMEOUT_MS = 10_000;

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
