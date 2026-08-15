'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useApiClient, userQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { consumeBootSessionRestore, hadSession, markHadSession } from '@/app/_lib/authBoot';
import posthog from 'posthog-js';

export function AuthSessionBootstrap() {
  const [attempt, setAttempt] = useState(0);
  const client = useApiClient();
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  const status = useAuthStore((state) => state.status);
  const isVerified = useAuthStore((state) => state.isVerified);
  const { addToast } = useToast();

  const previousStateRef = useRef({ status, isVerified });

  // had-session 플래그와 PostHog 신원은 "서버로 확인된" 전이만 따라간다.
  // 시드(미검증 authenticated)에 플래그를 다시 심으면 스텔 플래그가 스스로를 영속시키고,
  // 시드가 무너진 익명 방문(미검증 authenticated → 확정 미인증)에 reset 을 걸면
  // 가입 전 행동과 가입 후 identify 의 연결이 끊긴다. 세션이 서고 지워지는 경로가 여럿이라
  // 호출부마다 심는 대신 스토어 전이 한 곳에서만 갱신한다(빠지는 곳 방지 — 기존 주석 계약 유지).
  useEffect(() => {
    if (isVerified && status === 'authenticated') markHadSession(true);
    else if (isVerified && status === 'unauthenticated') {
      markHadSession(false);
      const previous = previousStateRef.current;
      if (previous.isVerified && previous.status === 'authenticated') posthog.reset();
    }
    previousStateRef.current = { status, isVerified };
  }, [status, isVerified]);

  useEffect(() => {
    let cancelled = false;
    // 레버 1: 부팅 1회분은 모듈 스코프에서 선점된 요청을 받아쓴다(요청이 하이드레이션보다
    // 먼저 나간다). 재시도(attempt>0)와 선점이 없던 경우는 여기서 새로 요청한다.
    const preflighted = attempt === 0 ? consumeBootSessionRestore() : null;
    // 복원 요청을 me 쿼리의 첫 조회로 등록한다 — 화면의 /users/me 소비자(헤더·마이페이지 등)는
    // 하이드레이션 직후 같은 키로 마운트되므로, 등록해 두면 진행 중인 이 요청을 물려받는다
    // (React Query 중복 제거). 등록하지 않으면 부팅마다 /users/me 가 두 번 나간다.
    // retry: false — 자동 재시도는 하지 않는다. 선점 프로미스는 1회용이라 재시도해도 같은
    // 실패를 되풀이하고, 복구는 아래 '다시 시도' 알림(새 요청)이 맡는다.
    void queryClient
      .fetchQuery({
        queryKey: userQueryKeys.me(),
        queryFn: () => preflighted ?? client.users.me(),
        retry: false,
      })
      .then((user) => {
        if (cancelled) return;
        // 확정된 종료(로그아웃·만료 확정) 후 도착한 늦은 응답은 세션을 되살리지 않는다 —
        // 종료 판정의 단일 출처는 SessionExpiryHandler·clearSession 이고, 이 응답은 그보다
        // 먼저 나간 요청이다(catch 의 침묵 가드와 대칭). 스토어와 같은 이유로 캐시에서도
        // 지운다 — 종료 경로들이 비운 캐시를 이 늦은 응답이 되채우면 안 된다.
        const settled = useAuthStore.getState();
        if (settled.isVerified && settled.status === 'unauthenticated') {
          queryClient.removeQueries({ queryKey: userQueryKeys.me() });
          return;
        }
        setSession(user);
        posthog.identify(String(user.id), {
          role: user.role,
          grade: user.grade,
          college: user.college,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // 401 을 세션 종료로 해석하지 않는다. 진짜 만료와 일시 장애(갱신이 403·5xx·타임아웃·
        // 오프라인으로 실패)의 예외 객체가 완전히 동일해, 반환 채널만으로는 구분할 근거가 없다.
        // 종료 판정은 SessionExpiryHandler 한 곳에 있고, 확정됐다면 그쪽이 이 catch 보다 먼저
        // (동기 setState 로) 스토어를 내려둔다 — 여기서는 그 결과만 읽는다.
        // TODO(후속 #844): 다른 탭이 10초 내 갱신해 'skipped' 로 재시도된 요청이 다시 401 이면
        // 사이드 채널이 울리지 않아, 서버측 세션 폐기가 일시 장애로 오분류된다.
        const settled = useAuthStore.getState();
        if (settled.isVerified && settled.status === 'unauthenticated') return;
        if (!hadSession()) return;
        // durationMs 0 — 자동으로 사라지지 않는다. 복구 수단(다시 시도)이 붙은 알림이라
        // 사용자가 처리하거나 닫을 때까지 남는다.
        addToast('세션을 확인하지 못했습니다. 로그인 상태는 유지됩니다.', {
          variant: 'error',
          durationMs: 0,
          action: {
            label: '다시 시도',
            onClick: () => setAttempt((currentAttempt) => currentAttempt + 1),
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, queryClient, setSession, addToast]);

  return null;
}
