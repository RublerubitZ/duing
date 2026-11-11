'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { registerConnectivityAdapter } from '@duing/api';
import { useApiClient, userQueryKeys } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  consumeBootSessionRestore,
  hadSession,
  markHadSession,
  SESSION_USER_KEY,
  sessionUserDiverged,
  setConfirmedSessionUser,
  writeSessionUser,
} from '@/app/_lib/authBoot';
import posthog from 'posthog-js';

// 새로고침 대기 중에도, 나가기 확인 창을 취소해 막힌 채 남은 뒤에도 맞는 문구 — 이 문서의 요청은 더 나가지 않는다.
const SESSION_SWITCHED_MESSAGE =
  '다른 탭에서 로그인 상태가 바뀌었어요. 이 화면에서는 저장되지 않아요.';

export function AuthSessionBootstrap() {
  const [attempt, setAttempt] = useState(0);
  const client = useApiClient();
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  const status = useAuthStore((state) => state.status);
  const isVerified = useAuthStore((state) => state.isVerified);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const { addToast } = useToast();

  const previousStateRef = useRef({ status, isVerified });
  // 요청 막기·새로고침은 문서당 한 번 — 나가기 확인 창(고친 내용이 있는 폼의 beforeunload)을 신호마다 띄우지 않는다.
  const reloadStartedRef = useRef(false);

  // had-session 플래그와 PostHog 신원은 "서버로 확인된" 전이만 따라간다.
  // 시드(미검증 authenticated)에 플래그를 다시 심으면 스텔 플래그가 스스로를 영속시키고,
  // 시드가 무너진 익명 방문(미검증 authenticated → 확정 미인증)에 reset 을 걸면
  // 가입 전 행동과 가입 후 identify 의 연결이 끊긴다. 세션이 서고 지워지는 경로가 여럿이라
  // 호출부마다 심는 대신 스토어 전이 한 곳에서만 갱신한다(빠지는 곳 방지 — 기존 주석 계약 유지).
  useEffect(() => {
    // 막힌 문서는 건드리지 않는다 — 늦게 끝난 clearSession 이 공유 had-session 을 지우고 PostHog 신원을 끊지 않게.
    if (reloadStartedRef.current) return;
    if (isVerified && status === 'authenticated') markHadSession(true);
    else if (isVerified && status === 'unauthenticated') {
      markHadSession(false);
      const previous = previousStateRef.current;
      if (previous.isVerified && previous.status === 'authenticated') posthog.reset();
    }
    previousStateRef.current = { status, isVerified };
  }, [status, isVerified]);

  // 탭 사이 사용자 표지도 같은 전이만 따라간다 — 다른 탭은 이 값이 자기가 확인한 값과 달라지면 요청을 막고 새로고침한다.
  // 위 effect 와 따로 두는 이유: 로그인 상태의 계정 전환은 user id 만 바뀌어 deps 에 넣어야 하는데,
  // 그 전환에 had-session·PostHog 분기를 다시 돌리지 않는다.
  useEffect(() => {
    // 막힌 문서는 쓰지 않는다 — 늦게 끝난 요청(비밀번호 변경 성공의 clearSession 등)이 다른 탭의 값을 지우면 멀쩡한 탭이 새로고침된다.
    if (reloadStartedRef.current) return;
    if (!isVerified) return;
    let sessionUser: string | null = null;
    if (status === 'authenticated') {
      // 확인된 로그인인데 사용자가 없는 상태(지금은 생기지 않는다) — 모르는 값을 쓰지 않는다.
      if (userId === null) return;
      sessionUser = String(userId);
    }
    setConfirmedSessionUser(writeSessionUser(sessionUser) ? sessionUser : undefined);
  }, [status, isVerified, userId]);

  // 확인한 값의 수명은 이 컴포넌트와 같다 — 언마운트 뒤 남은 값으로 요청을 막지 않게(StrictMode 는 다시 마운트하며 쓰기 effect 가 되살린다).
  useEffect(() => () => setConfirmedSessionUser(undefined), []);

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

  // 다른 탭이 로그인·로그아웃해 공유 표지가 이 탭이 확인한 값과 달라지면 하드 새로고침한다 — 쿠키는 브라우저 전체가
  // 공유해 이 화면의 요청이 이미 바뀐 계정으로 나간다. 소프트 이동은 언마운트 정리의 저장을 바뀐 쿠키로 보낸다.
  // 놓친 storage 이벤트(동결 탭·bfcache)는 다시 보일 때·복원될 때 값을 다시 읽어 메운다.
  useEffect(() => {
    const showSessionSwitchedNotice = () =>
      addToast(SESSION_SWITCHED_MESSAGE, {
        variant: 'error',
        durationMs: 0,
        action: {
          label: '새로고침',
          onClick: () => {
            window.location.reload();
            // 누르면 토스트가 먼저 닫힌다 — 나가기 확인 창을 다시 취소해도 안내 없이 막힌 채 남지 않게 다시 띄운다
            // (닫히는 중인 토스트는 중복으로 걸러지지 않고, 이동이 진행되면 문서가 버려져 무해하다).
            showSessionSwitchedNotice();
          },
        },
      });
    const checkSessionUser = () => {
      // 이미 막은 문서 — 닫힌 안내만 다시 띄운다(떠 있으면 ToastProvider 가 같은 문구를 거른다).
      if (reloadStartedRef.current) {
        showSessionSwitchedNotice();
        return;
      }
      if (!sessionUserDiverged()) return;
      reloadStartedRef.current = true;
      showSessionSwitchedNotice();
      // 하드 이동은 응답이 커밋될 때까지 이 문서가 살아 있다 — 그 사이 요청이 바뀐 계정 쿠키로 나가지 않게 오프라인으로 취급한다.
      registerConnectivityAdapter(() => false);
      window.location.reload();
    };
    // 다른 키(토큰 갱신 시각 등)의 쓰기는 거른다 — key 가 null 이면 다른 탭의 localStorage.clear() 다.
    const checkOnSessionUserStorage = (event: StorageEvent) => {
      if (event.key === SESSION_USER_KEY || event.key === null) checkSessionUser();
    };
    window.addEventListener('storage', checkOnSessionUserStorage);
    document.addEventListener('visibilitychange', checkSessionUser);
    window.addEventListener('pageshow', checkSessionUser);
    return () => {
      window.removeEventListener('storage', checkOnSessionUserStorage);
      document.removeEventListener('visibilitychange', checkSessionUser);
      window.removeEventListener('pageshow', checkSessionUser);
    };
  }, [addToast]);

  return null;
}
